import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { describeRecurrence, deviceRegisterSchema, reminderCreateSchema, reminderUpdateSchema, snoozeSchema } from '@friday/shared';
import { devices, notificationDeliveries, reminders, tasks } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { badRequest, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { initialSchedule, type ReminderRow } from '../services/reminders.js';

type IdParams = { Params: { id: string } };

function present(r: ReminderRow, lastDelivery?: { status: string; channel: string; createdAt: Date; error: string | null }) {
  return {
    ...r,
    recurrenceLabel: describeRecurrence(r.recurrence),
    deliveryState: r.status !== 'active' ? r.status : r.nextFireAt ? 'scheduled' : 'delivered',
    lastDelivery: lastDelivery ?? null,
  };
}

export async function reminderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  async function owned(userId: string, id: string): Promise<ReminderRow> {
    const rows = await app.db.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId))).limit(1);
    if (!rows[0]) throw notFound('Reminder');
    return rows[0];
  }

  app.get<{ Querystring: { status?: string } }>('/reminders', async (req) => {
    const me = authUser(req);
    const status = req.query.status === 'all' ? null : 'active';
    const rows = await app.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, me.id), status ? eq(reminders.status, status) : undefined))
      .orderBy(sql`${reminders.nextFireAt} asc nulls last`, desc(reminders.createdAt))
      .limit(200);
    const ids = rows.map((r) => r.id);
    // Latest delivery per reminder in one query (no N+1).
    const latest = ids.length
      ? await app.db
          .selectDistinctOn([notificationDeliveries.reminderId], {
            reminderId: notificationDeliveries.reminderId,
            status: notificationDeliveries.status,
            channel: notificationDeliveries.channel,
            createdAt: notificationDeliveries.createdAt,
            error: notificationDeliveries.error,
          })
          .from(notificationDeliveries)
          .where(and(eq(notificationDeliveries.userId, me.id), inArray(notificationDeliveries.reminderId, ids)))
          .orderBy(notificationDeliveries.reminderId, desc(notificationDeliveries.createdAt), desc(notificationDeliveries.channel))
      : [];
    const byId = new Map(latest.map((l) => [l.reminderId, l]));
    return { reminders: rows.map((r) => present(r, byId.get(r.id))) };
  });

  app.post('/reminders', async (req, reply) => {
    const me = authUser(req);
    const body = parse(reminderCreateSchema, req.body);
    const prefs = await getPreferences(app.db, me.id);
    const timezone = body.timezone ?? prefs.timezone;
    if (body.taskId) {
      const t = await app.db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, me.id))).limit(1);
      if (!t.length) throw badRequest('Unknown task');
    }
    const anchor = new Date(body.remindAt);
    const advance = body.advanceMinutes || prefs.notifications.reminderAdvanceMinutes;
    const schedule = initialSchedule(anchor, body.recurrence, timezone, advance);
    const [row] = await app.db
      .insert(reminders)
      .values({
        userId: me.id,
        taskId: body.taskId ?? null,
        title: body.title,
        anchorAt: anchor,
        timezone,
        recurrence: body.recurrence,
        advanceMinutes: advance,
        ...schedule,
      })
      .returning();
    return reply.code(201).send({ reminder: present(row!) });
  });

  app.patch<IdParams>('/reminders/:id', async (req) => {
    const me = authUser(req);
    const current = await owned(me.id, req.params.id);
    const patch = parse(reminderUpdateSchema, req.body);
    const anchor = patch.remindAt ? new Date(patch.remindAt) : current.anchorAt;
    const recurrence = patch.recurrence ?? current.recurrence;
    const timezone = patch.timezone ?? current.timezone;
    const advance = patch.advanceMinutes ?? current.advanceMinutes;
    const reschedule = patch.remindAt || patch.recurrence || patch.timezone || patch.advanceMinutes !== undefined;
    const [row] = await app.db
      .update(reminders)
      .set({
        title: patch.title ?? current.title,
        anchorAt: anchor,
        recurrence,
        timezone,
        advanceMinutes: advance,
        ...(reschedule ? { ...initialSchedule(anchor, recurrence, timezone, advance), status: 'active' as const } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(reminders.id, current.id), eq(reminders.userId, me.id)))
      .returning();
    return { reminder: present(row!) };
  });

  app.post<IdParams>('/reminders/:id/snooze', async (req) => {
    const me = authUser(req);
    const current = await owned(me.id, req.params.id);
    const { minutes } = parse(snoozeSchema, req.body);
    const [row] = await app.db
      .update(reminders)
      .set({ nextFireAt: new Date(Date.now() + minutes * 60_000), status: 'active', updatedAt: new Date() })
      .where(and(eq(reminders.id, current.id), eq(reminders.userId, me.id)))
      .returning();
    return { reminder: present(row!) };
  });

  /** Acknowledge: one-off reminders are closed; recurring ones keep their next occurrence. */
  app.post<IdParams>('/reminders/:id/dismiss', async (req) => {
    const me = authUser(req);
    const current = await owned(me.id, req.params.id);
    const oneOff = current.recurrence.freq === 'none';
    const [row] = await app.db
      .update(reminders)
      .set(oneOff ? { status: 'dismissed', nextFireAt: null, updatedAt: new Date() } : { updatedAt: new Date() })
      .where(and(eq(reminders.id, current.id), eq(reminders.userId, me.id)))
      .returning();
    return { reminder: present(row!) };
  });

  /** Complete: stop the reminder entirely (and complete its linked one-off task). */
  app.post<IdParams>('/reminders/:id/complete', async (req) => {
    const me = authUser(req);
    const current = await owned(me.id, req.params.id);
    const [row] = await app.db
      .update(reminders)
      .set({ status: 'completed', nextFireAt: null, updatedAt: new Date() })
      .where(and(eq(reminders.id, current.id), eq(reminders.userId, me.id)))
      .returning();
    return { reminder: present(row!) };
  });

  app.delete<IdParams>('/reminders/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db
      .delete(reminders)
      .where(and(eq(reminders.id, req.params.id), eq(reminders.userId, me.id)))
      .returning({ id: reminders.id });
    if (!deleted.length) throw notFound('Reminder');
    return { ok: true };
  });

  /* ----- notification inbox ----- */

  app.get('/notifications', async (req) => {
    const me = authUser(req);
    const rows = await app.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, me.id))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(50);
    const unread = rows.filter((r) => r.channel === 'in_app' && !r.readAt).length;
    return { notifications: rows, unread };
  });

  app.post('/notifications/read-all', async (req) => {
    const me = authUser(req);
    await app.db
      .update(notificationDeliveries)
      .set({ readAt: new Date() })
      .where(and(eq(notificationDeliveries.userId, me.id), isNull(notificationDeliveries.readAt)));
    return { ok: true };
  });

  /* ----- devices ----- */

  app.post('/devices', async (req, reply) => {
    const me = authUser(req);
    const body = parse(deviceRegisterSchema, req.body);
    // Re-registering a token moves it to the current user (device changed hands).
    const [device] = await app.db
      .insert(devices)
      .values({ userId: me.id, platform: body.platform, pushToken: body.pushToken })
      .onConflictDoUpdate({ target: devices.pushToken, set: { userId: me.id, lastSeenAt: new Date(), disabledAt: null } })
      .returning({ id: devices.id, platform: devices.platform, createdAt: devices.createdAt });
    return reply.code(201).send({ device });
  });

  app.get('/devices', async (req) => {
    const me = authUser(req);
    const rows = await app.db
      .select({ id: devices.id, platform: devices.platform, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt, disabledAt: devices.disabledAt })
      .from(devices)
      .where(eq(devices.userId, me.id));
    return { devices: rows };
  });

  app.delete<IdParams>('/devices/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db.delete(devices).where(and(eq(devices.id, req.params.id), eq(devices.userId, me.id))).returning({ id: devices.id });
    if (!deleted.length) throw notFound('Device');
    return { ok: true };
  });
}
