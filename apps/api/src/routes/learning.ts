import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { INITIAL_REVIEW_STATE, qualityFromScore, quizAnswerSchema, reviewSchema, scheduleReview } from '@friday/shared';
import { lessonProgress, lessons, quizAttempts } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { badRequest, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { markLearningDay } from '../services/streak.js';
import { getPreferences } from '../services/prefs.js';

type IdParams = { Params: { id: string } };
type LessonRow = typeof lessons.$inferSelect;
type ProgressRow = typeof lessonProgress.$inferSelect;

/** Lesson card/detail without quiz answers (answers are revealed only after submission). */
function publicLesson(l: LessonRow, p?: ProgressRow, full = false) {
  return {
    id: l.id,
    slug: l.slug,
    topic: l.topic,
    title: l.title,
    level: l.level,
    minutes: l.minutes,
    summary: l.summary,
    artSeed: l.artSeed,
    ...(full
      ? {
          explanation: l.explanation,
          example: l.example,
          takeaway: l.takeaway,
          steps: l.steps,
          diagram: l.diagram,
          insight: l.insight,
          question: l.question,
          learnMore: l.learnMore,
          origin: l.origin,
          quiz: l.quiz.map((q) => ({ q: q.q, options: q.options })),
        }
      : {}),
    progress: p
      ? { status: p.status, saved: p.saved, reviewDueAt: p.reviewDueAt, lastScore: p.lastScore, repetitions: p.repetitions }
      : null,
  };
}

export async function learningRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Curated lessons, plus AI lessons generated for this user only. */
  const visibleTo = (userId: string) => or(isNull(lessons.ownerUserId), eq(lessons.ownerUserId, userId));

  async function getLesson(id: string, userId: string) {
    const rows = await app.db.select().from(lessons).where(and(eq(lessons.id, id), visibleTo(userId))).limit(1);
    if (!rows[0]) throw notFound('Lesson');
    return rows[0];
  }

  async function progressMap(userId: string, ids: string[]) {
    if (!ids.length) return new Map<string, ProgressRow>();
    const rows = await app.db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, ids)));
    return new Map(rows.map((r) => [r.lessonId, r]));
  }

  app.get<{ Querystring: { topic?: string; filter?: string } }>('/learn/lessons', async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    // Learning is restricted to the topics the user selected in Settings.
    const allowed = prefs.learningTopics as string[];
    const topic = typeof req.query.topic === 'string' && allowed.includes(req.query.topic) ? req.query.topic : undefined;
    const all = await app.db
      .select()
      .from(lessons)
      .where(and(visibleTo(me.id), topic ? eq(lessons.topic, topic) : inArray(lessons.topic, allowed)))
      .orderBy(asc(lessons.topic), asc(lessons.title))
      .limit(200);
    const progress = await progressMap(me.id, all.map((l) => l.id));
    let list = all.map((l) => publicLesson(l, progress.get(l.id)));
    if (req.query.filter === 'saved') list = list.filter((l) => l.progress?.saved);
    if (req.query.filter === 'history') list = list.filter((l) => l.progress);
    // "For you": preferred topics first, unfinished before completed.
    const rank = (l: (typeof list)[number]) => (l.progress?.status === 'completed' ? 1 : 0);
    list.sort((a, b) => rank(a) - rank(b));
    const continueLearning = list.filter((l) => l.progress?.status === 'started');
    const featured = list.find((l) => !l.progress || l.progress.status !== 'completed') ?? list[0] ?? null;
    const topics = allowed;
    return { featured, continueLearning, lessons: list, topics };
  });

  app.get<IdParams>('/learn/lessons/:id', async (req) => {
    const me = authUser(req);
    const lesson = await getLesson(req.params.id, me.id);
    const p = (await progressMap(me.id, [lesson.id])).get(lesson.id);
    return { lesson: publicLesson(lesson, p, true) };
  });

  app.post<IdParams>('/learn/lessons/:id/start', async (req) => {
    const me = authUser(req);
    const lesson = await getLesson(req.params.id, me.id);
    await app.db.insert(lessonProgress).values({ userId: me.id, lessonId: lesson.id }).onConflictDoNothing();
    return { ok: true };
  });

  app.post<IdParams & { Body: unknown }>('/learn/lessons/:id/save', async (req) => {
    const me = authUser(req);
    const lesson = await getLesson(req.params.id, me.id);
    const saved = (req.body as { saved?: unknown } | undefined)?.saved;
    if (typeof saved !== 'boolean') throw badRequest('saved must be boolean');
    await app.db
      .insert(lessonProgress)
      .values({ userId: me.id, lessonId: lesson.id, saved })
      .onConflictDoUpdate({ target: [lessonProgress.userId, lessonProgress.lessonId], set: { saved, updatedAt: new Date() } });
    return { saved };
  });

  app.post<IdParams>('/learn/lessons/:id/quiz', async (req) => {
    const me = authUser(req);
    const lesson = await getLesson(req.params.id, me.id);
    const { answers } = parse(quizAnswerSchema, req.body);
    if (answers.length !== lesson.quiz.length) throw badRequest(`Expected ${lesson.quiz.length} answers`);
    const results = lesson.quiz.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, why: q.why }));
    const correct = results.filter((r) => r.correct).length;
    const existing = (await progressMap(me.id, [lesson.id])).get(lesson.id);
    const state = existing ? { ease: existing.ease, intervalDays: existing.intervalDays, repetitions: existing.repetitions } : INITIAL_REVIEW_STATE;
    const next = scheduleReview(state, qualityFromScore(correct, lesson.quiz.length));
    const score = Math.round((correct / lesson.quiz.length) * 100);
    await app.db.transaction(async (tx) => {
      await tx.insert(quizAttempts).values({ userId: me.id, lessonId: lesson.id, correct, total: lesson.quiz.length, answers });
      const values = {
        status: 'completed' as const,
        ease: next.ease,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        reviewDueAt: next.dueAt,
        lastScore: score,
        updatedAt: new Date(),
      };
      await tx
        .insert(lessonProgress)
        .values({ userId: me.id, lessonId: lesson.id, ...values })
        .onConflictDoUpdate({ target: [lessonProgress.userId, lessonProgress.lessonId], set: values });
    });
    await markLearningDay(app.db, me.id);
    return {
      correct,
      total: lesson.quiz.length,
      score,
      results,
      nextReviewAt: next.dueAt.toISOString(),
      note: 'One quiz is a snapshot, not mastery — Mira will bring this lesson back for spaced review.',
    };
  });

  app.post<IdParams>('/learn/lessons/:id/review', async (req) => {
    const me = authUser(req);
    const lesson = await getLesson(req.params.id, me.id);
    const { quality } = parse(reviewSchema, req.body);
    const existing = (await progressMap(me.id, [lesson.id])).get(lesson.id);
    if (!existing) throw badRequest('Start the lesson first');
    const next = scheduleReview({ ease: existing.ease, intervalDays: existing.intervalDays, repetitions: existing.repetitions }, quality);
    await app.db
      .update(lessonProgress)
      .set({ ease: next.ease, intervalDays: next.intervalDays, repetitions: next.repetitions, reviewDueAt: next.dueAt, updatedAt: new Date() })
      .where(and(eq(lessonProgress.userId, me.id), eq(lessonProgress.lessonId, lesson.id)));
    await markLearningDay(app.db, me.id);
    return { nextReviewAt: next.dueAt.toISOString() };
  });

  app.get('/learn/review', async (req) => {
    const me = authUser(req);
    const rows = await app.db
      .select({ lesson: lessons, progress: lessonProgress })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .where(and(eq(lessonProgress.userId, me.id), isNotNull(lessonProgress.reviewDueAt), lte(lessonProgress.reviewDueAt, new Date())))
      .orderBy(asc(lessonProgress.reviewDueAt))
      .limit(20);
    return { due: rows.map((r) => publicLesson(r.lesson, r.progress)) };
  });

  app.get('/learn/stats', async (req) => {
    const me = authUser(req);
    const [row] = await app.db
      .select({
        completed: sql<number>`count(*) filter (where ${lessonProgress.status} = 'completed')::int`,
        started: sql<number>`count(*) filter (where ${lessonProgress.status} = 'started')::int`,
        saved: sql<number>`count(*) filter (where ${lessonProgress.saved})::int`,
        dueReviews: sql<number>`count(*) filter (where ${lessonProgress.reviewDueAt} <= now())::int`,
      })
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, me.id));
    const recent = await app.db
      .select({ lessonId: quizAttempts.lessonId, correct: quizAttempts.correct, total: quizAttempts.total, createdAt: quizAttempts.createdAt })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, me.id))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(10);
    return { ...row, recentAttempts: recent };
  });
}
