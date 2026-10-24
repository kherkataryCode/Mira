'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, XCircle } from 'lucide-react';
import type { Lesson } from '@/lib/types';
import { api } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { fmtDay } from '@/lib/format';
import { Art } from '@/components/Art';
import { Button, Card, ErrorNote, Loading } from '@/components/ui';

interface QuizResult {
  correct: number;
  total: number;
  score: number;
  results: { correct: boolean; answer: number; why: string }[];
  nextReviewAt: string;
  note: string;
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<{ lesson: Lesson }>(`/learn/lessons/${id}`);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [saved, setSaved] = useState(false);
  const lesson = data?.lesson;

  useEffect(() => {
    if (!lesson) return;
    setAnswers(lesson.quiz?.map(() => null) ?? []);
    setSaved(Boolean(lesson.progress?.saved));
    if (!lesson.progress) void api.post(`/learn/lessons/${lesson.id}/start`).catch(() => undefined);
  }, [lesson]);

  const submit = useAction(async () => {
    const r = await api.post<QuizResult>(`/learn/lessons/${id}/quiz`, { answers });
    setResult(r);
  });
  const toggleSave = useAction(async () => {
    const r = await api.post<{ saved: boolean }>(`/learn/lessons/${id}/save`, { saved: !saved });
    setSaved(r.saved);
  });
  const addNote = useAction(async () => {
    if (!lesson) return;
    await api.post('/notes', { title: `Notes: ${lesson.title}`, body: `Key takeaway: ${lesson.takeaway ?? ''}\n\n`, lessonId: lesson.id, tags: [lesson.topic] });
  });

  if (loading && !data) return <Loading />;
  if (error) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!lesson) return null;

  return (
    <article className="mx-auto max-w-3xl pb-10 pt-4">
      <Link href="/learn" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden /> All lessons</Link>
      <div className="relative mb-6 overflow-hidden rounded-[2rem]">
        <Art seed={lesson.artSeed} className="h-44 w-full sm:h-56" />
      </div>
      <p className="eyebrow">{lesson.topic} · {lesson.level} · {lesson.minutes} min</p>
      <h1 className="display display-xl mt-2">{lesson.title}</h1>
      <p className="mt-2 text-muted">{lesson.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void toggleSave.run()} pending={toggleSave.pending} aria-pressed={saved}>
          {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />} {saved ? 'Saved' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={() => void addNote.run()} pending={addNote.pending}>{addNote.pending ? 'Adding' : 'Add to notes'}</Button>
        {toggleSave.error || addNote.error ? <ErrorNote message={(toggleSave.error ?? addNote.error)!} /> : null}
      </div>

      <section className="mt-8">
        <h2 className="display display-md mb-2">The idea</h2>
        <p className="leading-relaxed">{lesson.explanation}</p>
      </section>
      <section className="mt-6 rounded-3xl bg-panel p-5 text-on-panel">
        <h2 className="eyebrow !text-on-panel/70">Example</h2>
        <p className="mt-2 leading-relaxed">{lesson.example}</p>
      </section>
      <section className="mt-6 border-l-4 border-accent pl-4">
        <h2 className="eyebrow">Key takeaway</h2>
        <p className="display display-md mt-1">{lesson.takeaway}</p>
      </section>

      {lesson.quiz?.length ? (
        <Card className="mt-8">
          <h2 className="display display-md mb-4">Quick check</h2>
          <ol className="flex flex-col gap-5">
            {lesson.quiz.map((q, qi) => (
              <li key={qi}>
                <fieldset>
                  <legend className="mb-2 font-medium">{qi + 1}. {q.q}</legend>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt, oi) => {
                      const r = result?.results[qi];
                      const chosen = answers[qi] === oi;
                      const isRight = r && r.answer === oi;
                      return (
                        <label
                          key={oi}
                          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm ${
                            isRight ? 'border-positive' : r && chosen ? 'border-accent' : chosen ? 'border-sand' : 'border-line'
                          }`}
                        >
                          <input type="radio" name={`q${qi}`} checked={chosen} disabled={Boolean(result)} onChange={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))} className="size-4 accent-[var(--accent)]" />
                          <span className="flex-1">{opt}</span>
                          {isRight ? <CheckCircle2 className="size-4 text-positive" aria-label="Correct answer" /> : r && chosen ? <XCircle className="size-4 text-accent-text" aria-label="Your answer" /> : null}
                        </label>
                      );
                    })}
                  </div>
                  {result?.results[qi] ? <p className="mt-2 text-sm text-muted">{result.results[qi]!.why}</p> : null}
                </fieldset>
              </li>
            ))}
          </ol>
          {submit.error ? <div className="mt-3"><ErrorNote message={submit.error} /></div> : null}
          {result ? (
            <div role="status" className="mt-5 rounded-2xl bg-raised p-4 text-sm">
              <p className="font-semibold">You got {result.correct} of {result.total} ({result.score}%).</p>
              <p className="mt-1 text-muted">{result.note} Next review: {fmtDay(result.nextReviewAt)}.</p>
              <Button className="mt-3" onClick={() => { setResult(null); setAnswers(lesson.quiz!.map(() => null)); }}>Try again</Button>
            </div>
          ) : (
            <Button className="mt-5" variant="primary" onClick={() => void submit.run()} pending={submit.pending} disabled={answers.some((a) => a === null)}>
              Check answers
            </Button>
          )}
        </Card>
      ) : null}
    </article>
  );
}
