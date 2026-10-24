import { eq } from 'drizzle-orm';
import { DEFAULT_PREFERENCES, preferencesSchema, type Preferences } from '@friday/shared';
import type { Db } from '../db/client.js';
import { userPreferences } from '../db/schema.js';

/** Merges stored prefs over defaults so newly added settings get sensible values. */
export function mergePreferences(stored: Partial<Preferences> | null | undefined): Preferences {
  const d = DEFAULT_PREFERENCES;
  const s = stored ?? {};
  const merged: Preferences = {
    ...d,
    ...s,
    schedule: { ...d.schedule, ...s.schedule },
    scheduleEnabled: { ...d.scheduleEnabled, ...s.scheduleEnabled },
    notifications: { ...d.notifications, ...s.notifications },
    news: { ...d.news, ...s.news },
    ai: { ...d.ai, ...s.ai },
    voice: { ...d.voice, ...s.voice },
    dashboard: { ...d.dashboard, ...s.dashboard },
  };
  const checked = preferencesSchema.safeParse(merged);
  return checked.success ? checked.data : d;
}

export async function getPreferences(db: Db, userId: string): Promise<Preferences> {
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return mergePreferences(rows[0]?.data);
}

export async function savePreferences(db: Db, userId: string, prefs: Preferences): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, data: prefs })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { data: prefs, updatedAt: new Date() } });
}
