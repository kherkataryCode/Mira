import { desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { localDate } from '@friday/shared';
import type { Db } from '../db/client.js';
import { learningDays } from '../db/schema.js';
import { getPreferences } from './prefs.js';

export async function markLearningDay(db: Db, userId: string, now = new Date()): Promise<void> {
  const prefs = await getPreferences(db, userId);
  await db.insert(learningDays).values({ userId, localDate: localDate(now, prefs.timezone) }).onConflictDoNothing();
}

/** Consecutive learning days ending today (or yesterday, so the streak isn't "lost" before you learn today). */
export async function learningStreak(db: Db, userId: string, timezone: string, now = new Date()): Promise<{ days: number; today: boolean }> {
  const rows = await db.select({ d: learningDays.localDate }).from(learningDays).where(eq(learningDays.userId, userId)).orderBy(desc(learningDays.localDate)).limit(400);
  const set = new Set(rows.map((r) => r.d));
  let day = DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
  const today = set.has(day.toISODate()!);
  if (!today) day = day.minus({ days: 1 });
  let days = 0;
  while (set.has(day.toISODate()!)) {
    days++;
    day = day.minus({ days: 1 });
  }
  return { days, today };
}
