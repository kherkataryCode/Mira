import { and, asc, eq, gte, isNotNull, lte, lt, or, sql } from 'drizzle-orm';
import { nextOccurrence } from '@friday/shared';
import type { Db } from '../db/client.js';
import { events, reminders, tasks } from '../db/schema.js';

export type EventRow = typeof events.$inferSelect;

export interface EventOccurrence {
  id: string;
  /** Start of this occurrence (differs from the stored start for recurring events). */
  startAt: string;
  endAt: string;
  title: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  attendees: string[];
  recurrence: EventRow['recurrence'];
  reminderId: string | null;
  recurring: boolean;
}

export function presentEvent(e: EventRow, start = e.startAt): EventOccurrence {
  const dur = e.endAt.getTime() - e.startAt.getTime();
  return {
    id: e.id,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + dur).toISOString(),
    title: e.title,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    attendees: e.attendees,
    recurrence: e.recurrence,
    reminderId: e.reminderId,
    recurring: e.recurrence.freq !== 'none',
  };
}

/** Events overlapping [from, to), with recurring events expanded into occurrences (bounded). */
export async function eventsInRange(db: Db, userId: string, from: Date, to: Date): Promise<EventOccurrence[]> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), lt(events.startAt, to), or(gte(events.endAt, from), sql`${events.recurrence}->>'freq' <> 'none'`)))
    .orderBy(asc(events.startAt))
    .limit(500);
  const out: EventOccurrence[] = [];
  for (const e of rows) {
    const dur = e.endAt.getTime() - e.startAt.getTime();
    if (e.recurrence.freq === 'none') {
      if (e.endAt >= from) out.push(presentEvent(e));
      continue;
    }
    let start: Date | null = e.startAt;
    for (let i = 0; start && start < to && i < 400; i++) {
      if (start.getTime() + dur >= from.getTime()) out.push(presentEvent(e, start));
      start = nextOccurrence(e.startAt, e.recurrence, e.timezone, start);
    }
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Overlapping events, for a conflict warning (not a block). */
export async function conflictsFor(db: Db, userId: string, start: Date, end: Date, excludeId?: string) {
  const list = await eventsInRange(db, userId, start, end);
  return list
    .filter((e) => e.id !== excludeId && !e.allDay && new Date(e.startAt) < end && new Date(e.endAt) > start)
    .map((e) => ({ id: e.id, title: e.title, startAt: e.startAt }));
}

/** One calendar view over shared records: events, tasks with due dates, and reminders. Nothing is copied. */
export async function calendarRange(db: Db, userId: string, from: Date, to: Date) {
  const [evs, taskRows, reminderRows] = await Promise.all([
    eventsInRange(db, userId, from, to),
    db
      .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, allDay: tasks.allDay, status: tasks.status, priority: tasks.priority })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.dueAt), gte(tasks.dueAt, from), lt(tasks.dueAt, to)))
      .orderBy(asc(tasks.dueAt))
      .limit(300),
    db
      .select({ id: reminders.id, title: reminders.title, at: reminders.nextOccurrenceAt, status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, 'active'), isNotNull(reminders.nextOccurrenceAt), gte(reminders.nextOccurrenceAt, from), lte(reminders.nextOccurrenceAt, to)))
      .orderBy(asc(reminders.nextOccurrenceAt))
      .limit(300),
  ]);
  // A reminder created for an event is shown on the event, not twice.
  const linked = new Set(evs.map((e) => e.reminderId).filter(Boolean));
  return {
    events: evs,
    tasks: taskRows.map((t) => ({ ...t, dueAt: t.dueAt!.toISOString() })),
    reminders: reminderRows.filter((r) => !linked.has(r.id)).map((r) => ({ id: r.id, title: r.title, at: r.at!.toISOString() })),
  };
}
