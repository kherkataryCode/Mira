import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { eventCreateSchema, eventUpdateSchema, rangeQuerySchema, type EventCreate } from '@friday/shared';
import type { Db } from '../db/client.js';
import { events, reminders } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { badRequest, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { initialSchedule } from '../services/reminders.js';
import { calendarRange, conflictsFor, presentEvent } from '../services/calendar.js';

type IdParams = { Params: { id: string } };

/** Creates an event, and its single linked reminder when asked. Shared by the calendar and chat confirmations. */
export async function createEvent(db: Db, userId: string, timezone: string, body: EventCreate) {
  return db.transaction(async (tx) => {
    let reminderId: string | null = null;
    let reminderSkipped = false;
    if (body.reminderMinutes !== null && body.reminderMinutes !== undefined) {
      const anchor = new Date(body.startAt);
      // A one-off event in the past still saves; it just gets no reminder (reported back to the user).
      let schedule: ReturnType<typeof initialSchedule> | null = null;
      try {
        schedule = initialSchedule(anchor, body.recurrence, timezone, body.reminderMinutes);
      } catch {
        reminderSkipped = true;
      }
      if (schedule) {
        const [r] = await tx
          .insert(reminders)
          .values({ userId, title: body.title, anchorAt: anchor, timezone, recurrence: body.recurrence, advanceMinutes: body.reminderMinutes, ...schedule })
          .returning({ id: reminders.id });
        reminderId = r!.id;
      }
    }
    const [row] = await tx
      .insert(events)
      .values({
        userId,
        title: body.title,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        allDay: body.allDay,
        location: body.location ?? null,
        notes: body.notes ?? null,
        attendees: body.attendees,
        recurrence: body.recurrence,
        timezone,
        reminderId,
      })
      .returning();
    return { row: row!, reminderSkipped };
  });
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  const owned = async (userId: string, id: string) => {
    const [row] = await app.db.select().from(events).where(and(eq(events.id, id), eq(events.userId, userId))).limit(1);
    if (!row) throw notFound('Event');
    return row;
  };

  app.get('/calendar', async (req) => {
    const me = authUser(req);
    const q = parse(rangeQuerySchema, req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to.getTime() - from.getTime() > 62 * 86_400_000 || to <= from) throw badRequest('Range must be positive and at most 62 days');
    return calendarRange(app.db, me.id, from, to);
  });

  app.get<IdParams>('/events/:id', async (req) => ({ event: presentEvent(await owned(authUser(req).id, req.params.id)) }));

  app.post('/events', async (req, reply) => {
    const me = authUser(req);
    const body = parse(eventCreateSchema, req.body);
    const prefs = await getPreferences(app.db, me.id);
    const conflicts = body.allDay ? [] : await conflictsFor(app.db, me.id, new Date(body.startAt), new Date(body.endAt));
    const { row, reminderSkipped } = await createEvent(app.db, me.id, prefs.timezone, body);
    return reply.code(201).send({ event: presentEvent(row), conflicts, reminderSkipped });
  });

  app.patch<IdParams>('/events/:id', async (req) => {
    const me = authUser(req);
    const cur = await owned(me.id, req.params.id);
    const body = parse(eventUpdateSchema, req.body);
    const startAt = body.startAt ? new Date(body.startAt) : cur.startAt;
    const endAt = body.endAt ? new Date(body.endAt) : body.startAt ? new Date(startAt.getTime() + (cur.endAt.getTime() - cur.startAt.getTime())) : cur.endAt;
    if (endAt < startAt) throw badRequest('End must be after start');
    const recurrence = body.recurrence ?? cur.recurrence;
    const [row] = await app.db
      .update(events)
      .set({ ...body, startAt, endAt, recurrence, updatedAt: new Date() })
      .where(eq(events.id, cur.id))
      .returning();
    // Keep the linked reminder in step with the event time.
    if (cur.reminderId && (body.startAt || body.recurrence || body.title)) {
      const [r] = await app.db.select().from(reminders).where(eq(reminders.id, cur.reminderId)).limit(1);
      // A one-off event moved into the past keeps its old reminder state.
      const schedule = r ? (() => { try { return initialSchedule(startAt, recurrence, r.timezone, r.advanceMinutes); } catch { return null; } })() : null;
      if (r && schedule) {
        await app.db
          .update(reminders)
          .set({ title: row!.title, anchorAt: startAt, recurrence, ...schedule, updatedAt: new Date() })
          .where(eq(reminders.id, r.id));
      }
    }
    const conflicts = row!.allDay ? [] : await conflictsFor(app.db, me.id, startAt, endAt, row!.id);
    return { event: presentEvent(row!), conflicts };
  });

  app.delete<IdParams>('/events/:id', async (req) => {
    const me = authUser(req);
    const cur = await owned(me.id, req.params.id);
    await app.db.transaction(async (tx) => {
      await tx.delete(events).where(eq(events.id, cur.id));
      if (cur.reminderId) await tx.delete(reminders).where(and(eq(reminders.id, cur.reminderId), eq(reminders.userId, me.id)));
    });
    return { ok: true };
  });
}
