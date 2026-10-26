'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, Clock } from 'lucide-react';
import type { Lesson } from '@/lib/types';
import { useResource } from '@/lib/hooks';
import { Art } from '@/components/Art';
import { Badge, Chip, Empty, ErrorNote, Loading, PageHeader } from '@/components/ui';
import { WordReview } from '@/components/WordReview';

interface LearnIndex {
  featured: Lesson | null;
  continueLearning: Lesson[];
  lessons: Lesson[];
  topics: string[];
}

function LessonCard({ l }: { l: Lesson }) {
  return (
    <Link href={`/learn/${l.id}`} className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-muted">
      <div className="relative h-28"><Art seed={l.artSeed} className="h-full w-full" /></div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="eyebrow">{l.topic}</p>
        <p className="display text-xl">{l.title}</p>
        <p className="line-clamp-2 text-sm text-muted">{l.summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{l.minutes} min</span>
          <span className="capitalize">{l.level}</span>
          {l.progress?.status === 'completed' ? <Badge tone="positive">Done{l.progress.lastScore !== null ? ` · ${l.progress.lastScore}%` : ''}</Badge> : null}
          {l.progress?.status === 'started' ? <Badge tone="demo">In progress</Badge> : null}
          {l.progress?.saved ? <Bookmark className="size-3.5 text-sand" aria-label="Saved" /> : null}
        </div>
      </div>
    </Link>
  );
}

export default function LearnPage() {
  const [tab, setTab] = useState<'foryou' | 'topics' | 'saved' | 'history'>('foryou');
  const [topic, setTopic] = useState<string | null>(null);
  const query = tab === 'saved' ? '?filter=saved' : tab === 'history' ? '?filter=history' : tab === 'topics' && topic ? `?topic=${encodeURIComponent(topic)}` : '';
  const { data, error, loading, reload } = useResource<LearnIndex>(`/learn/lessons${query}`);
  const review = useResource<{ due: Lesson[] }>('/learn/review');

  return (
    <div>
      <PageHeader title="Learn" subtitle="Bite-sized lessons with spaced review. A few minutes a day adds up." />
      <WordReview />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="group" aria-label="Learning views">
        <Chip active={tab === 'foryou'} onClick={() => setTab('foryou')}>For you</Chip>
        <Chip active={tab === 'topics'} onClick={() => setTab('topics')}>Topics</Chip>
        <Chip active={tab === 'saved'} onClick={() => setTab('saved')}>Saved</Chip>
        <Chip active={tab === 'history'} onClick={() => setTab('history')}>History</Chip>
      </div>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}

      {data && tab === 'foryou' && data.featured ? (
        <Link href={`/learn/${data.featured.id}`} className="relative mb-6 block overflow-hidden rounded-[2rem] border border-line">
          <Art seed={data.featured.artSeed} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
          <div className="relative flex min-h-[14rem] flex-col justify-end gap-2 p-6 text-cream sm:min-h-[18rem] sm:p-8">
            <p className="eyebrow !text-cream/80">{data.featured.topic} · {data.featured.minutes} min read</p>
            <p className="display display-xl max-w-lg">{data.featured.title}</p>
            <p className="max-w-md text-sm text-cream/85">{data.featured.summary}</p>
            <span className="mt-2 inline-flex min-h-11 w-fit items-center rounded-full bg-panel px-5 text-sm font-semibold text-on-panel">
              {data.featured.progress?.status === 'started' ? 'Continue' : 'Read'} →
            </span>
          </div>
        </Link>
      ) : null}

      {tab === 'foryou' && review.data && review.data.due.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold">Due for review</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{review.data.due.map((l) => <LessonCard key={l.id} l={l} />)}</div>
        </section>
      ) : null}

      {data && tab === 'foryou' && data.continueLearning.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold">Continue learning</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.continueLearning.map((l) => <LessonCard key={l.id} l={l} />)}</div>
        </section>
      ) : null}

      {data && tab === 'topics' ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip active={!topic} onClick={() => setTopic(null)}>All</Chip>
          {data.topics.map((t) => <Chip key={t} active={topic === t} onClick={() => setTopic(t)}><span className="capitalize">{t}</span></Chip>)}
        </div>
      ) : null}

      {data ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">{tab === 'saved' ? 'Saved lessons' : tab === 'history' ? 'Your history' : 'All lessons'}</h2>
          {data.lessons.length === 0 ? (
            <Empty title={tab === 'saved' ? 'Nothing saved yet' : 'Nothing here yet'} body={tab === 'saved' ? 'Tap Save on any lesson to keep it here.' : undefined} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.lessons.map((l) => <LessonCard key={l.id} l={l} />)}</div>
          )}
        </section>
      ) : null}
    </div>
  );
}
