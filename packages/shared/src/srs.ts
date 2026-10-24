/**
 * SM-2 style spaced repetition. `quality` is 0–5 (0 = forgot, 5 = perfect).
 * Returns the next review state; dates are computed from `now`.
 */
export interface ReviewState {
  ease: number;
  intervalDays: number;
  repetitions: number;
}

export const INITIAL_REVIEW_STATE: ReviewState = { ease: 2.5, intervalDays: 0, repetitions: 0 };

export function scheduleReview(
  prev: ReviewState,
  quality: number,
  now: Date = new Date(),
): ReviewState & { dueAt: Date } {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease, intervalDays, repetitions } = prev;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  intervalDays = Math.min(intervalDays, 365);
  const dueAt = new Date(now.getTime() + intervalDays * 86_400_000);
  return { ease: Math.round(ease * 100) / 100, intervalDays, repetitions, dueAt };
}

/** Maps a quiz score to SM-2 quality. One quiz never implies mastery. */
export function qualityFromScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  const ratio = correct / total;
  if (ratio >= 1) return 5;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.4) return 2;
  return 1;
}
