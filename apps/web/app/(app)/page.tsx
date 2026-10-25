'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlarmClock, ArrowRight, BookOpen, CheckSquare, Flame, MessageCircle, Newspaper, Sparkles } from 'lucide-react';
import type { Home } from '@/lib/types';
import { useResource } from '@/lib/hooks';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Art, MiraFace } from '@/components/Art';
import { Card, ErrorNote, Skeleton } from '@/components/ui';
import { QuickAdd } from '@/components/QuickAdd';

function Tile({
  title,
  href,
  seed,
  icon,
  count,
  caption,
  footer,
  delay,
  children,
}: {
  title: string;
  href: string;
  seed: number;
  icon: ReactNode;
  count: ReactNode;
  caption: string;
  footer: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`tile rise rise-${delay} flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface`}>
      <Link href={href} className="wiggle-hover relative block h-24 shrink-0 sm:h-28">
        <Art seed={seed} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2 text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-full bg-white/20 backdrop-blur">{icon}</span>
            {title}
          </span>
          <span className="display text-4xl leading-none">{count}</span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{caption}</p>
        <div className="flex-1 text-sm">{children}</div>
        <Link href={href} className="mt-1 inline-flex min-h-9 items-center gap-1 self-start text-sm font-semibold text-accent-text hover:underline">
          {footer} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

const Line = ({ children }: { children: ReactNode }) => <li className="flex min-w-0 items-start gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-text" aria-hidden />{children}</li>;

function HomeSkeleton() {
  return (
    <div className="pt-5" role="status" aria-label="Preparing your day">
      <Skeleton className="mb-2 h-10 w-64" />
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 !rounded-3xl" />)}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data, error, loading, reload } = useResource<Home>('/home');

  if (loading && !data) return <HomeSkeleton />;
  if (error && !data) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return null;

  const tz = data.timezone;
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date());
  const todos = data.tasks.length ? data.tasks.slice(0, 3) : data.upNext;
  const open = data.counts.openTasks;

  return (
    <div className="pt-5">
      <header className="compact-landscape rise mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <MiraFace size={52} />
          <div className="min-w-0">
            <h1 className="display display-lg">{data.greeting}</h1>
            <p className="hide-short text-sm text-muted">{dateLabel}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/chat?brief=1" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent shadow-lg shadow-accent/20 transition hover:brightness-110 sm:flex-none">
            <Sparkles className="size-4" aria-hidden /> Brief me
          </Link>
          <Link href="/chat" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line px-5 text-sm font-semibold hover:border-muted sm:flex-none">
            <MessageCircle className="size-4" aria-hidden /> Talk to Mira
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          title="To-dos"
          href="/tasks"
          seed={5}
          icon={<CheckSquare className="size-4" aria-hidden />}
          count={open}
          caption={open ? `${open} remaining · ${data.counts.tasksToday} due today` : 'All clear'}
          footer="Open to-dos"
          delay={1}
        >
          {todos.length ? (
            <ul className="flex flex-col gap-1.5">
              {todos.map((t) => (
                <Line key={t.id}>
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium">{t.title}</span>
                    <span className="text-xs text-muted">{t.dueAt ? fmtDateTime(t.dueAt, tz) : 'No due date'}{t.priority === 'high' || t.priority === 'urgent' ? ` · ${t.priority}` : ''}</span>
                  </span>
                </Line>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nothing on your list. Add one below 👇</p>
          )}
        </Tile>

        <Tile
          title="Reminders"
          href="/reminders"
          seed={10}
          icon={<AlarmClock className="size-4" aria-hidden />}
          count={data.reminders.length}
          caption={data.reminders.length ? 'Coming up' : 'Nothing scheduled'}
          footer="All reminders"
          delay={2}
        >
          {data.reminders.length ? (
            <ul className="flex flex-col gap-1.5">
              {data.reminders.map((r) => (
                <Line key={r.id}>
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium">{r.title}</span>
                    <span className="text-xs text-muted">{fmtDateTime(r.nextOccurrenceAt, tz)}</span>
                  </span>
                </Line>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No upcoming reminders.</p>
          )}
        </Tile>

        <Tile
          title="Cyber news"
          href="/news"
          seed={9}
          icon={<Newspaper className="size-4" aria-hidden />}
          count={data.news.length}
          caption={data.news.length ? 'Top stories · last 3 days' : 'Quiet out there'}
          footer="All cyber news"
          delay={3}
        >
          {data.news.length ? (
            <ul className="flex flex-col gap-1.5">
              {data.news.map((n) => (
                <Line key={n.id}>
                  <span className="min-w-0">
                    <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="line-clamp-2 font-medium hover:underline">{n.title}</a>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {n.exploitation === 'exploited' ? <><Flame className="size-3 text-accent-text" aria-hidden /><span className="text-accent-text">Exploited</span> ·</> : null}
                      {n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}
                    </span>
                  </span>
                </Line>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No important cyber news from your sources right now.</p>
          )}
        </Tile>

        <Tile
          title="Learning"
          href={data.lesson ? `/learn/${data.lesson.id}` : '/learn'}
          seed={data.lesson?.artSeed ?? 3}
          icon={<BookOpen className="size-4" aria-hidden />}
          count={data.lesson ? `${data.lesson.minutes}′` : '✓'}
          caption={data.lesson ? `Next up · ${data.lesson.topic}` : 'All caught up'}
          footer={data.lesson ? (data.lesson.status === 'started' ? 'Continue lesson' : 'Start lesson') : 'Browse lessons'}
          delay={4}
        >
          {data.lesson ? (
            <>
              <p className="display text-lg leading-tight">{data.lesson.title}</p>
              <p className="mt-1 line-clamp-2 text-muted">{data.lesson.summary}</p>
            </>
          ) : (
            <p className="text-muted">You’ve finished the lessons in your topics.</p>
          )}
          {data.counts.reviewsDue ? <p className="mt-2 text-xs text-muted">{data.counts.reviewsDue} due for review</p> : null}
        </Tile>
      </div>

      <Card className="rise mt-4">
        <QuickAdd onSaved={reload} />
      </Card>
    </div>
  );
}
