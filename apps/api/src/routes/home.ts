import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { CYBER_RELEVANCE_THRESHOLD, localDate } from '@friday/shared';
import { briefs, lessonProgress, lessons, newsItems, reminders, tasks } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { getPreferences } from '../services/prefs.js';
import { generateBrief } from '../services/brief.js';

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Everything the dashboard needs in one round trip, from persisted data only. */
  app.get('/home', async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    const now = new Date();
    const local = DateTime.fromJSDate(now, { zone: prefs.timezone });
    const dayEnd = local.endOf('day').toJSDate();
    const today = localDate(now, prefs.timezone);

    const [todayTasks, todayCount, nextReminders, featuredLesson, topNews, latestBrief, reviewsDue, openTasks, upNext] = await Promise.all([
      app.db.select().from(tasks)
        .where(and(eq(tasks.userId, me.id), eq(tasks.status, 'open'), isNotNull(tasks.dueAt), lt(tasks.dueAt, dayEnd)))
        .orderBy(asc(tasks.dueAt)).limit(5),
      app.db.select({ n: sql<number>`count(*)::int` }).from(tasks)
        .where(and(eq(tasks.userId, me.id), eq(tasks.status, 'open'), isNotNull(tasks.dueAt), lt(tasks.dueAt, dayEnd))),
      app.db.select().from(reminders)
        .where(and(eq(reminders.userId, me.id), eq(reminders.status, 'active'), isNotNull(reminders.nextFireAt)))
        .orderBy(asc(reminders.nextFireAt)).limit(3),
      app.db.select({ lesson: lessons, status: lessonProgress.status }).from(lessons)
        .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, me.id)))
        .where(and(
          sql`${lessonProgress.status} is distinct from 'completed'`,
          prefs.learningTopics.length ? inArray(lessons.topic, prefs.learningTopics) : undefined,
        ))
        .orderBy(sql`${lessonProgress.status} = 'started' desc nulls last`, asc(lessons.title)).limit(1),
      // Cyber-relevant stories from the last 3 days, exploited first.
      app.db.select().from(newsItems)
        .where(and(eq(newsItems.userId, me.id), eq(newsItems.hidden, false), gte(newsItems.relevance, CYBER_RELEVANCE_THRESHOLD), gte(newsItems.fetchedAt, new Date(now.getTime() - 72 * 3_600_000))))
        .orderBy(sql`array_position(array['exploited','proof-of-concept','not-reported'], ${newsItems.exploitation})`, sql`${newsItems.publishedAt} desc nulls last`)
        .limit(3),
      app.db.select().from(briefs).where(and(eq(briefs.userId, me.id), eq(briefs.localDate, today)))
        .orderBy(desc(briefs.createdAt)).limit(1),
      app.db.select({ n: sql<number>`count(*)::int` }).from(lessonProgress)
        .where(and(eq(lessonProgress.userId, me.id), lte(lessonProgress.reviewDueAt, now))),
      app.db.select({ n: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.userId, me.id), eq(tasks.status, 'open'))),
      // When nothing is due today, the to-do box shows what's next instead.
      app.db.select().from(tasks).where(and(eq(tasks.userId, me.id), eq(tasks.status, 'open')))
        .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt)).limit(3),
    ]);

    const hour = local.hour;
    const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const lesson = featuredLesson[0];
    return {
      greeting: `${greeting}, ${me.displayName}`,
      localDate: today,
      timezone: prefs.timezone,
      dashboard: prefs.dashboard,
      counts: { tasksToday: todayCount[0]?.n ?? 0, openTasks: openTasks[0]?.n ?? 0, reminders: nextReminders.length, news: topNews.length, reviewsDue: reviewsDue[0]?.n ?? 0 },
      tasks: todayTasks,
      upNext,
      reminders: nextReminders,
      lesson: lesson
        ? { id: lesson.lesson.id, title: lesson.lesson.title, topic: lesson.lesson.topic, minutes: lesson.lesson.minutes, summary: lesson.lesson.summary, artSeed: lesson.lesson.artSeed, status: lesson.status }
        : null,
      news: topNews,
      brief: latestBrief[0] ?? null,
    };
  });

  app.post('/briefs/generate', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    return { brief: await generateBrief(app.db, app.ai, me.id, prefs, 'ondemand') };
  });

  app.get('/briefs', async (req) => {
    const me = authUser(req);
    const rows = await app.db.select().from(briefs).where(eq(briefs.userId, me.id)).orderBy(desc(briefs.createdAt)).limit(14);
    return { briefs: rows };
  });
}
