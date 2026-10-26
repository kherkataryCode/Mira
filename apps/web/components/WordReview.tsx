'use client';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { Word } from '@friday/shared';
import { api } from '@/lib/api';

type Saved = Word & { status: 'saved' | 'known'; due: boolean; reviewDueAt: string | null };

/** Flashcard review of saved English words (spaced repetition on the server). */
export function WordReview() {
  const [words, setWords] = useState<Saved[] | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const load = useCallback(() => void api.get<{ words: Saved[] }>('/words').then((r) => setWords(r.words)).catch(() => setWords([])), []);
  useEffect(load, [load]);
  if (!words?.length) return null;
  const due = words.filter((w) => w.due);
  const grade = async (w: Saved, remembered: boolean) => {
    await api.post(`/words/${w.word}/quiz`, { remembered });
    setShown(null);
    load();
  };
  return (
    <section aria-label="Your words" className="mb-6 rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-accent-text" aria-hidden />Your words · {due.length} due for review</h2>
      {due.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {due.slice(0, 6).map((w) => (
            <div key={w.word} className="rounded-2xl border border-line bg-raised p-3">
              <p className="display text-xl">{w.word}</p>
              {shown === w.word ? (
                <>
                  <p className="mt-1 text-sm">{w.definition}</p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button type="button" onClick={() => void grade(w, true)} className="rounded-full border border-positive px-3 py-1.5 text-positive">I remembered</button>
                    <button type="button" onClick={() => void grade(w, false)} className="rounded-full border border-line px-3 py-1.5 text-muted">Not yet</button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setShown(w.word)} className="mt-1 text-sm text-accent-text underline">Show meaning</button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-1.5">
        {words.map((w) => <span key={w.word} className={`rounded-full border px-2.5 py-0.5 text-xs ${w.status === 'known' ? 'border-positive/60 text-positive' : 'border-line text-muted'}`}>{w.word}</span>)}
      </p>
    </section>
  );
}
