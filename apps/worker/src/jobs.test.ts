import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PREFERENCES } from '@friday/shared';
import { createDb, runMigrations, schema, seedLessons, type DbHandle } from '@friday/api/lib';
import { runBriefs, runCleanup, runOnce, slotIsDue } from './jobs.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://friday:friday@localhost:5432/friday_test';
let handle: DbHandle;
let userId: string;

beforeAll(async () => {
  await runMigrations(URL, false);
  handle = createDb({ url: URL, ssl: false, max: 3 });
  await seedLessons(handle.db);
  const [u] = await handle.db
    .insert(schema.users)
    .values({ email: `worker-${randomUUID()}@example.test`, passwordHash: 'x', displayName: 'Worker' })
    .returning({ id: schema.users.id });
  userId = u!.id;
  await handle.db.insert(schema.userPreferences).values({
    userId,
    data: { ...DEFAULT_PREFERENCES, timezone: 'UTC', schedule: { ...DEFAULT_PREFERENCES.schedule, morningBrief: '08:00' } },
  });
});
afterAll(async () => handle.close());

describe('runOnce', () => {
  it('runs a key to success exactly once, even concurrently', async () => {
    let calls = 0;
    const key = randomUUID();
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return {};
    };
    const results = await Promise.all([runOnce(handle.db, 'test', key, fn), runOnce(handle.db, 'test', key, fn), runOnce(handle.db, 'test', key, fn)]);
    expect(calls).toBe(1);
    expect(results.filter((r) => r.status === 'succeeded')).toHaveLength(1);
    expect((await runOnce(handle.db, 'test', key, fn)).status).toBe('skipped');
  });

  it('allows a failed run to be retried', async () => {
    const key = randomUUID();
    await expect(runOnce(handle.db, 'test', key, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect((await runOnce(handle.db, 'test', key, async () => ({ ok: true }))).status).toBe('succeeded');
  });
});

describe('scheduling window', () => {
  it('runs slots only within the missed-run window', () => {
    expect(slotIsDue(new Date('2026-10-24T02:29:00Z'), 'Asia/Kolkata', '08:00')).toBe(false);
    expect(slotIsDue(new Date('2026-10-24T02:31:00Z'), 'Asia/Kolkata', '08:00')).toBe(true);
    expect(slotIsDue(new Date('2026-10-24T06:00:00Z'), 'Asia/Kolkata', '08:00')).toBe(false);
  });
});

describe('briefs job', () => {
  it('generates one brief and one notification per slot, idempotently', async () => {
    const now = new Date('2026-10-24T08:05:00Z');
    await runBriefs(handle.db, null, now);
    await runBriefs(handle.db, null, now);
    const briefs = await handle.pool.query("select count(*)::int as n from briefs where user_id = $1 and kind = 'morning'", [userId]);
    expect(briefs.rows[0].n).toBe(1);
    const notes = await handle.pool.query("select count(*)::int as n from notification_deliveries where user_id = $1 and kind = 'brief'", [userId]);
    expect(notes.rows[0].n).toBe(1);
  });
});

describe('cleanup', () => {
  it('removes data past retention and keeps recent data', async () => {
    await handle.pool.query("insert into conversations (user_id, title, updated_at) values ($1, 'old', now() - interval '400 days'), ($1, 'new', now())", [userId]);
    const res = await runCleanup(handle.db);
    expect(res.conversations).toBeGreaterThanOrEqual(1);
    const left = await handle.pool.query('select title from conversations where user_id = $1', [userId]);
    expect(left.rows.map((r) => r.title)).toEqual(['new']);
  });
});
