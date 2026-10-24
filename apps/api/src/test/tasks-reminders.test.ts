import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, registerUser, type TestContext, type TestUser } from './helpers.js';
import { dispatchDueReminders } from '../services/reminders.js';
import { sendPendingPushes } from '../services/push.js';

let ctx: TestContext;
let u: TestUser;
beforeAll(async () => {
  ctx = await createTestApp();
  u = await registerUser(ctx.app, 'Planner');
});
afterAll(async () => closeTestApp(ctx));

describe('tasks', () => {
  it('creates, filters, searches, completes and reopens', async () => {
    const due = new Date(Date.now() + 60_000).toISOString();
    const t = (await u.call({ method: 'POST', url: '/tasks', payload: { title: 'Write 100% report_v2', dueAt: due, priority: 'high', tags: ['work'] } })).json().task;
    expect(t.status).toBe('open');
    const search = (await u.call({ method: 'GET', url: '/tasks?q=100%25' })).json().tasks;
    expect(search.map((x: { id: string }) => x.id)).toContain(t.id);
    const wildcard = (await u.call({ method: 'GET', url: '/tasks?q=_' })).json().tasks;
    expect(wildcard.every((x: { title: string }) => x.title.includes('_'))).toBe(true);
    expect((await u.call({ method: 'GET', url: '/tasks?tag=work' })).json().tasks).toHaveLength(1);

    const done = (await u.call({ method: 'PATCH', url: `/tasks/${t.id}`, payload: { status: 'done' } })).json().task;
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeTruthy();
    const reopened = (await u.call({ method: 'PATCH', url: `/tasks/${t.id}`, payload: { status: 'open' } })).json().task;
    expect(reopened.status).toBe('open');
    const detail = (await u.call({ method: 'GET', url: `/tasks/${t.id}` })).json();
    expect(detail.history.map((h: { kind: string }) => h.kind)).toEqual(['reopened', 'completed', 'created']);
  });

  it('rolls recurring tasks forward instead of closing them', async () => {
    const due = new Date(Date.now() - 3_600_000).toISOString();
    const t = (await u.call({ method: 'POST', url: '/tasks', payload: { title: 'Daily standup', dueAt: due, recurrence: { freq: 'daily' } } })).json().task;
    const next = (await u.call({ method: 'PATCH', url: `/tasks/${t.id}`, payload: { status: 'done' } })).json().task;
    expect(next.status).toBe('open');
    expect(new Date(next.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a natural-language preview without saving', async () => {
    const before = (await u.call({ method: 'GET', url: '/tasks?status=all&limit=100' })).json().tasks.length;
    const p = (await u.call({ method: 'POST', url: '/parse', payload: { text: 'Remind me to call the dentist tomorrow at 5 PM' } })).json();
    expect(p.preview.kind).toBe('reminder');
    expect(p.preview.title).toBe('Call the dentist');
    expect(p.timezone).toBe('Asia/Kolkata');
    const after = (await u.call({ method: 'GET', url: '/tasks?status=all&limit=100' })).json().tasks.length;
    expect(after).toBe(before);
  });
});

describe('reminders and delivery', () => {
  it('rejects one-off reminders in the past', async () => {
    const r = await u.call({ method: 'POST', url: '/reminders', payload: { title: 'late', remindAt: new Date(Date.now() - 60_000).toISOString() } });
    expect(r.statusCode).toBe(400);
  });

  it('delivers due reminders exactly once even with concurrent dispatchers', async () => {
    const r = (await u.call({ method: 'POST', url: '/reminders', payload: { title: 'Concurrent', remindAt: new Date(Date.now() + 1000).toISOString() } })).json().reminder;
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    const results = await Promise.all([dispatchDueReminders(ctx.handle.db), dispatchDueReminders(ctx.handle.db), dispatchDueReminders(ctx.handle.db)]);
    expect(results.reduce((n, x) => n + x.claimed, 0)).toBe(1);
    // Re-running after completion must not create a duplicate either.
    await dispatchDueReminders(ctx.handle.db);
    const { rows } = await ctx.handle.pool.query('select count(*)::int as n from notification_deliveries where reminder_id = $1', [r.id]);
    expect(rows[0].n).toBe(1);
    const list = (await u.call({ method: 'GET', url: '/reminders' })).json().reminders;
    const mine = list.find((x: { id: string }) => x.id === r.id);
    expect(mine.deliveryState).toBe('delivered');
    expect(mine.lastDelivery.status).toBe('sent');
  });

  it('advances recurring reminders and keeps wall-clock time', async () => {
    const anchor = new Date(Date.now() + 2000).toISOString();
    const r = (await u.call({ method: 'POST', url: '/reminders', payload: { title: 'Water plants', remindAt: anchor, recurrence: { freq: 'daily' } } })).json().reminder;
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    await dispatchDueReminders(ctx.handle.db);
    const { rows } = await ctx.handle.pool.query('select next_occurrence_at, status from reminders where id = $1', [r.id]);
    expect(rows[0].status).toBe('active');
    expect(new Date(rows[0].next_occurrence_at).getTime() - new Date(anchor).getTime()).toBe(86_400_000);
  });

  it('snoozes and creates a separate delivery for the snoozed firing', async () => {
    const r = (await u.call({ method: 'POST', url: '/reminders', payload: { title: 'Snoozy', remindAt: new Date(Date.now() + 1000).toISOString() } })).json().reminder;
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    await dispatchDueReminders(ctx.handle.db);
    const snoozed = (await u.call({ method: 'POST', url: `/reminders/${r.id}/snooze`, payload: { minutes: 10 } })).json().reminder;
    expect(snoozed.deliveryState).toBe('scheduled');
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    await dispatchDueReminders(ctx.handle.db);
    const { rows } = await ctx.handle.pool.query('select count(*)::int as n from notification_deliveries where reminder_id = $1', [r.id]);
    expect(rows[0].n).toBe(2);
    const dismissed = (await u.call({ method: 'POST', url: `/reminders/${r.id}/dismiss` })).json().reminder;
    expect(dismissed.status).toBe('dismissed');
  });

  it('marks push as skipped (not sent) when push is not configured', async () => {
    await u.call({ method: 'POST', url: '/devices', payload: { platform: 'ios', pushToken: 'ExponentPushToken[test-device-0001]' } });
    const r = (await u.call({ method: 'POST', url: '/reminders', payload: { title: 'Push me', remindAt: new Date(Date.now() + 1000).toISOString() } })).json().reminder;
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    await dispatchDueReminders(ctx.handle.db);
    const res = await sendPendingPushes(ctx.handle.db, { enabled: false });
    expect(res.skipped).toBeGreaterThanOrEqual(1);
    const { rows } = await ctx.handle.pool.query("select status, error from notification_deliveries where reminder_id = $1 and channel = 'push'", [r.id]);
    expect(rows[0].status).toBe('skipped');
    expect(rows[0].error).toMatch(/not configured/);
  });

  it('retries failed pushes a bounded number of times', async () => {
    const r = (await u.call({ method: 'POST', url: '/reminders', payload: { title: 'Push fail', remindAt: new Date(Date.now() + 1000).toISOString() } })).json().reminder;
    await ctx.handle.pool.query("update reminders set next_fire_at = now() - interval '1 second' where id = $1", [r.id]);
    await dispatchDueReminders(ctx.handle.db);
    let calls = 0;
    const failing = (async () => {
      calls++;
      return new Response('nope', { status: 503 });
    }) as typeof fetch;
    for (let i = 0; i < 5; i++) await sendPendingPushes(ctx.handle.db, { enabled: true }, failing);
    const { rows } = await ctx.handle.pool.query("select status, attempts from notification_deliveries where reminder_id = $1 and channel = 'push'", [r.id]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempts).toBe(3);
    expect(calls).toBeLessThanOrEqual(3 * 2); // includes any other pending rows in this file
  });
});
