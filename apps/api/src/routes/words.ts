import type { FastifyInstance } from 'fastify';
import { and, asc, eq, lte } from 'drizzle-orm';
import { WORDS, WORD_REVIEW_DAYS, localDate, wordForDate, wordProgressSchema, wordQuiz, wordQuizSchema } from '@friday/shared';
import { wordProgress } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { learningStreak, markLearningDay } from '../services/streak.js';

type WordParams = { Params: { word: string } };

export async function wordRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  const known = (word: string) => {
    const w = WORDS.find((x) => x.word === word);
    if (!w) throw notFound('Word');
    return w;
  };

  /** Today's word (same for everyone on a given local date), with your progress and streak. */
  app.get('/words/today', async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    const w = wordForDate(localDate(new Date(), prefs.timezone));
    const [p] = await app.db.select().from(wordProgress).where(and(eq(wordProgress.userId, me.id), eq(wordProgress.word, w.word))).limit(1);
    const quiz = wordQuiz(w);
    return { word: w, quiz: { options: quiz.options }, status: p?.status ?? null, streak: await learningStreak(app.db, me.id, prefs.timezone) };
  });

  /** Saved and known words, with the ones due for review first. */
  app.get('/words', async (req) => {
    const me = authUser(req);
    const rows = await app.db.select().from(wordProgress).where(eq(wordProgress.userId, me.id)).orderBy(asc(wordProgress.reviewDueAt)).limit(500);
    const now = Date.now();
    return {
      words: rows.flatMap((r) => {
        const w = WORDS.find((x) => x.word === r.word);
        return w ? [{ ...w, status: r.status, reviewDueAt: r.reviewDueAt?.toISOString() ?? null, due: Boolean(r.reviewDueAt && r.reviewDueAt.getTime() <= now) }] : [];
      }),
    };
  });

  app.post<WordParams>('/words/:word/status', async (req) => {
    const me = authUser(req);
    const w = known(req.params.word);
    const { status } = parse(wordProgressSchema, req.body);
    if (status === 'none') {
      await app.db.delete(wordProgress).where(and(eq(wordProgress.userId, me.id), eq(wordProgress.word, w.word)));
      return { status: null };
    }
    const reviewDueAt = status === 'saved' ? new Date(Date.now() + WORD_REVIEW_DAYS[0]! * 86_400_000) : null;
    await app.db
      .insert(wordProgress)
      .values({ userId: me.id, word: w.word, status, reviewDueAt })
      .onConflictDoUpdate({ target: [wordProgress.userId, wordProgress.word], set: { status, reviewDueAt, updatedAt: new Date() } });
    await markLearningDay(app.db, me.id);
    return { status };
  });

  /** Quiz answer (choice) or flashcard review (remembered): correct answers push the next review further out. */
  app.post<WordParams>('/words/:word/quiz', async (req) => {
    const me = authUser(req);
    const w = known(req.params.word);
    const body = parse(wordQuizSchema, req.body);
    const correct = 'remembered' in body ? body.remembered : body.choice === wordQuiz(w).answer;
    const [p] = await app.db.select().from(wordProgress).where(and(eq(wordProgress.userId, me.id), eq(wordProgress.word, w.word))).limit(1);
    const reps = correct ? (p?.repetitions ?? 0) + 1 : 0;
    const gap = WORD_REVIEW_DAYS[Math.min(reps, WORD_REVIEW_DAYS.length - 1)]!;
    const reviewDueAt = new Date(Date.now() + gap * 86_400_000);
    await app.db
      .insert(wordProgress)
      .values({ userId: me.id, word: w.word, status: p?.status ?? 'saved', reviewDueAt, repetitions: reps })
      .onConflictDoUpdate({ target: [wordProgress.userId, wordProgress.word], set: { reviewDueAt, repetitions: reps, updatedAt: new Date() } });
    await markLearningDay(app.db, me.id);
    return { correct, answer: wordQuiz(w).answer, nextReviewAt: reviewDueAt.toISOString() };
  });

  app.get('/words/due', async (req) => {
    const me = authUser(req);
    const rows = await app.db.select({ word: wordProgress.word }).from(wordProgress).where(and(eq(wordProgress.userId, me.id), lte(wordProgress.reviewDueAt, new Date()))).limit(50);
    return { due: rows.map((r) => r.word) };
  });
}
