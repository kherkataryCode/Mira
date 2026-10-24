import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { DEFAULT_PREFERENCES, canonicalUrl, titleFingerprint } from '@friday/shared';
import { createDb, type Db } from './client.js';
import { lessons, newsItems, notes, reminders, tasks, users } from './schema.js';
import { LESSONS } from './lessons-content.js';
import { hashPassword } from '../auth/password.js';
import { savePreferences } from '../services/prefs.js';

export const DEMO_EMAIL = 'demo@friday.local';
export const DEMO_PASSWORD = 'friday-demo-password';

/** Idempotent: upserts the curriculum by slug. Safe to run on every deploy. */
export async function seedLessons(db: Db): Promise<number> {
  for (const l of LESSONS) {
    await db
      .insert(lessons)
      .values(l)
      .onConflictDoUpdate({
        target: lessons.slug,
        set: {
          topic: l.topic,
          title: l.title,
          level: l.level,
          minutes: l.minutes,
          summary: l.summary,
          explanation: l.explanation,
          example: l.example,
          takeaway: l.takeaway,
          quiz: l.quiz,
          artSeed: l.artSeed,
        },
      });
  }
  return LESSONS.length;
}

/** Demo account with clearly fake sample data. Only runs when DEMO_MODE=true. */
export async function seedDemo(db: Db, now = new Date()): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing[0]) return existing[0].id;
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), displayName: 'Sandeep', role: 'owner' })
    .returning({ id: users.id });
  const userId = user!.id;
  const tz = DEFAULT_PREFERENCES.timezone;
  await savePreferences(db, userId, DEFAULT_PREFERENCES);
  const today = DateTime.fromJSDate(now, { zone: tz }).startOf('day');
  const at = (days: number, h: number, m = 0) => today.plus({ days }).set({ hour: h, minute: m }).toJSDate();

  await db.insert(tasks).values([
    { userId, title: 'Finish OT security report', priority: 'high', dueAt: at(0, 23, 0), tags: ['work'] },
    { userId, title: 'Call Mom', priority: 'medium', dueAt: at(0, 23, 30), tags: ['personal'] },
    { userId, title: 'Read 10 pages', priority: 'low', dueAt: at(0, 23, 45), tags: ['learning'], recurrence: { freq: 'daily' } },
    { userId, title: 'Team sync meeting prep', priority: 'medium', dueAt: at(1, 14, 0), tags: ['work'] },
    { userId, title: 'Pay electricity bill', priority: 'high', dueAt: at(1, 10, 0), tags: ['home'] },
  ]);
  const remindAt = at(1, 9, 0);
  await db.insert(reminders).values([
    { userId, title: 'Team sync meeting', anchorAt: remindAt, nextOccurrenceAt: remindAt, nextFireAt: remindAt, timezone: tz },
    {
      userId,
      title: 'Gym session',
      anchorAt: at(1, 18, 0),
      nextOccurrenceAt: at(1, 18, 0),
      nextFireAt: at(1, 18, 0),
      timezone: tz,
      recurrence: { freq: 'weekly', byWeekday: [1, 3, 5] },
    },
  ]);
  await db.insert(notes).values([
    { userId, title: 'Firewall review checklist', body: '- Export current rules\n- Flag any-any rules\n- Confirm owners for each exception', tags: ['work'], pinned: true },
    { userId, title: 'Book ideas', body: 'Deep Work; The Psychology of Money', tags: ['reading'] },
  ]);
  const demoNews = [
    { title: 'Sample: Markets steady as investors await inflation data', importance: 'important' as const, category: 'business' },
    { title: 'Sample: New guidance published on securing industrial control systems', importance: 'important' as const, category: 'cybersecurity' },
    { title: 'Sample: Chipmakers expand capacity for AI data centres', importance: 'relevant' as const, category: 'technology' },
  ];
  for (const [i, n] of demoNews.entries()) {
    const url = `https://example.com/friday-demo/${i + 1}`;
    await db.insert(newsItems).values({
      userId,
      sourceName: 'Demo data (not real news)',
      url,
      canonicalUrl: canonicalUrl(url)!,
      titleKey: titleFingerprint(n.title),
      title: n.title,
      summary: 'This is placeholder content created in demo mode. Add real RSS sources in News → Sources.',
      category: n.category,
      importance: n.importance,
      publishedAt: new Date(now.getTime() - (i + 1) * 3_600_000),
      isDemo: true,
    });
  }
  return userId;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const ssl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1';
  const handle = createDb({ url, ssl, max: 1 });
  (async () => {
    const n = await seedLessons(handle.db);
    console.log(`Seeded ${n} lessons.`);
    if (process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1') {
      await seedDemo(handle.db);
      console.log(`Demo account ready: ${DEMO_EMAIL} (password documented in README).`);
    }
    await handle.db.execute(sql`select 1`);
  })()
    .catch((err: unknown) => {
      console.error('Seed failed:', err instanceof Error ? err.message : 'unknown');
      process.exitCode = 1;
    })
    .finally(() => void handle.close());
}
