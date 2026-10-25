import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { nextOccurrence, parseHm, type Recurrence } from '@friday/shared';
import type { Db } from '../db/client.js';
import { devices, notificationDeliveries, reminders } from '../db/schema.js';
import { badRequest } from '../util/errors.js';
import { getPreferences } from './prefs.js';

export type ReminderRow = typeof reminders.$inferSelect;

const MISSED_GRACE_MS = 6 * 3_600_000;

/** First occurrence at or after `now` (recurring anchors in the past roll forward). */
export function initialSchedule(
  anchor: Date,
  recurrence: Recurrence,
  timezone: string,
  advanceMinutes: number,
  now = new Date(),
): { nextOccurrenceAt: Date; nextFireAt: Date } {
  let occurrence = anchor;
  if (anchor.getTime() <= now.getTime()) {
    if (recurrence.freq === 'none') throw badRequest('Reminder time is in the past');
    const next = nextOccurrence(anchor, recurrence, timezone, now);
    if (!next) throw badRequest('Recurrence has no future occurrences');
    occurrence = next;
  }
  return { nextOccurrenceAt: occurrence, nextFireAt: new Date(occurrence.getTime() - advanceMinutes * 60_000) };
}

export function isQuietHours(now: Date, timezone: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const minutes = local.hour * 60 + local.minute;
  const s = parseHm(start);
  const e = parseHm(end);
  const sm = s.hour * 60 + s.minute;
  const em = e.hour * 60 + e.minute;
  return sm <= em ? minutes >= sm && minutes < em : minutes >= sm || minutes < em;
}

export interface DispatchResult {
  claimed: number;
  deliveriesCreated: number;
}

/**
 * Claims due reminders with row locks (SKIP LOCKED, safe across worker replicas),
 * records deliveries idempotently, and advances the schedule — all in one transaction.
 * Push sending happens separately so a slow push provider never holds row locks.
 */
export async function dispatchDueReminders(db: Db, now = new Date(), batch = 100): Promise<DispatchResult> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, 'active'), lte(reminders.nextFireAt, now)))
      .orderBy(reminders.nextFireAt)
      .limit(batch)
      .for('update', { skipLocked: true });
    let created = 0;
    const prefsCache = new Map<string, Awaited<ReturnType<typeof getPreferences>>>();
    const userIds = [...new Set(due.map((r) => r.userId))];
    const deviceRows = userIds.length
      ? await tx
          .select({ userId: devices.userId })
          .from(devices)
          .where(and(inArray(devices.userId, userIds), isNull(devices.disabledAt)))
      : [];
    const hasDevice = new Set(deviceRows.map((d) => d.userId));

    for (const r of due) {
      let prefs = prefsCache.get(r.userId);
      if (!prefs) {
        prefs = await getPreferences(tx as unknown as Db, r.userId);
        prefsCache.set(r.userId, prefs);
      }
      const occurrence = r.nextOccurrenceAt ?? r.anchorAt;
      const fireAt = r.nextFireAt ?? occurrence;
      const missed = now.getTime() - fireAt.getTime() > MISSED_GRACE_MS;
      const occurrenceKey = `${r.id}:${occurrence.toISOString()}:${fireAt.toISOString()}`;
      const when = DateTime.fromJSDate(occurrence, { zone: r.timezone }).toFormat('ccc d LLL, h:mm a');
      const body = missed ? `Missed while Mira was offline — was due ${when}` : `Due ${when}`;

      const rows: (typeof notificationDeliveries.$inferInsert)[] = [
        { userId: r.userId, reminderId: r.id, kind: 'reminder', occurrenceKey, channel: 'in_app', status: 'sent', title: r.title, body, sentAt: now },
      ];
      if (hasDevice.has(r.userId)) {
        const quiet = isQuietHours(now, prefs.timezone, prefs.notifications.quietHoursStart, prefs.notifications.quietHoursEnd);
        const skip = !prefs.notifications.push ? 'Push disabled in settings' : quiet ? 'Quiet hours' : null;
        rows.push({
          userId: r.userId,
          reminderId: r.id,
          kind: 'reminder',
          occurrenceKey,
          channel: 'push',
          status: skip ? 'skipped' : 'pending',
          error: skip,
          title: r.title,
          body,
        });
      }
      const inserted = await tx.insert(notificationDeliveries).values(rows).onConflictDoNothing().returning({ id: notificationDeliveries.id });
      created += inserted.length;

      const next = r.recurrence.freq === 'none' ? null : nextOccurrence(r.anchorAt, r.recurrence, r.timezone, new Date(Math.max(now.getTime(), occurrence.getTime())));
      await tx
        .update(reminders)
        .set({
          lastFiredAt: now,
          nextOccurrenceAt: next ?? occurrence,
          nextFireAt: next ? new Date(next.getTime() - r.advanceMinutes * 60_000) : null,
          status: next || r.recurrence.freq === 'none' ? 'active' : 'completed',
          updatedAt: now,
        })
        .where(eq(reminders.id, r.id));
    }
    return { claimed: due.length, deliveriesCreated: created };
  });
}

/** Count of pending push deliveries, for health/queue-depth display. */
export async function pendingPushCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.channel, 'push'), eq(notificationDeliveries.status, 'pending')));
  return row?.n ?? 0;
}
