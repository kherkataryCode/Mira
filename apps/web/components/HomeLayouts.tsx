'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AlarmClock, BookOpen, Bookmark, CalendarDays, Check, CheckSquare, Flame, Gauge, MapPin, Newspaper, Shuffle, Sparkles, Volume2, Zap } from 'lucide-react';
import { HOME_LAYOUTS, LEARNING_TOPICS, type HomeLayoutId } from '@friday/shared';
import type { Home, Lesson, Note } from '@/lib/types';
import { api } from '@/lib/api';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Art } from './Art';
import { Chip } from './ui';

/* ------------------------------------------------------------------ */
/* Layout choice: manual (locked), auto (stable per day), shuffle       */
/* ------------------------------------------------------------------ */

/** Auto mode: chosen from today's content and the date, so it doesn't change on every refresh. */
export function autoLayout(data: Home): HomeLayoutId {
  if (data.news.some((n) => n.exploitation === 'exploited')) return 'newspaper';
  if (data.events.length >= 3) return 'timeline';
  if (data.counts.openTasks >= 8) return 'command';
  const pool: HomeLayoutId[] = ['classic', 'magazine', 'bento', 'focus', 'knowledge'];
  const n = [...data.localDate].reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[n % pool.length]!;
}

export function LayoutBar({
  current,
  mode,
  density,
  onPick,
  onAuto,
  onShuffle,
  onDensity,
}: {
  current: HomeLayoutId;
  mode: 'manual' | 'auto';
  density: 'comfortable' | 'compact';
  onPick: (id: HomeLayoutId) => void;
  onAuto: (on: boolean) => void;
  onShuffle: () => void;
  onDensity: (d: 'comfortable' | 'compact') => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted">Layout</span>
        <select aria-label="Home layout" value={current} onChange={(e) => onPick(e.target.value as HomeLayoutId)} className="min-h-10 rounded-full border border-line bg-raised px-3 text-sm">
          {HOME_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label} — {l.blurb}</option>)}
        </select>
      </label>
      <Chip active={mode === 'auto'} onClick={() => onAuto(mode !== 'auto')}>Auto</Chip>
      <button type="button" onClick={onShuffle} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-muted hover:text-text">
        <Shuffle className="size-4" aria-hidden /> Shuffle
      </button>
      <button type="button" onClick={() => onDensity(density === 'compact' ? 'comfortable' : 'compact')} aria-pressed={density === 'compact'} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-muted hover:text-text">
        <Gauge className="size-4" aria-hidden /> {density === 'compact' ? 'Compact' : 'Comfortable'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared widgets (every layout is a view over the same /home data)     */
/* ------------------------------------------------------------------ */

function Panel({ title, icon, href, children, className = '', dense }: { title: string; icon?: ReactNode; href?: string; children: ReactNode; className?: string; dense?: boolean }) {
  return (
    <section aria-label={title} className={`rise min-w-0 rounded-3xl border border-line bg-surface ${dense ? 'p-3' : 'p-4 sm:p-5'} ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>
        {href ? <Link href={href} className="text-xs text-muted hover:text-text">Open →</Link> : null}
      </div>
      {children}
    </section>
  );
}

export function WordCard({ data, dense, className = '' }: { data: Home; dense?: boolean; className?: string }) {
  const w = data.word;
  const [status, setStatus] = useState(w.status);
  const [quiz, setQuiz] = useState<{ options: string[] } | null>(null);
  const [result, setResult] = useState<{ picked: number; answer: number } | null>(null);
  const [more, setMore] = useState(false);
  const [streak, setStreak] = useState(data.streak.days);

  const say = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(w.word));
  };
  const mark = async (s: 'saved' | 'known') => {
    const next = status === s ? 'none' : s;
    const r = await api.post<{ status: 'saved' | 'known' | null }>(`/words/${w.word}/status`, { status: next });
    setStatus(r.status);
    if (!data.streak.today && r.status) setStreak(data.streak.days + 1);
  };
  const startQuiz = async () => setQuiz((await api.get<{ quiz: { options: string[] } }>('/words/today')).quiz);
  const answer = async (i: number) => {
    // The server checks the answer and schedules the next review.
    const r = await api.post<{ answer: number }>(`/words/${w.word}/quiz`, { choice: i });
    setResult({ picked: i, answer: r.answer });
    if (!data.streak.today) setStreak(data.streak.days + 1);
  };

  return (
    <Panel title="Word of the day" icon={<BookOpen className="size-4 text-accent-text" aria-hidden />} dense={dense} className={className}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="display text-3xl">{w.word}</p>
        <button type="button" onClick={say} aria-label={`Pronounce ${w.word}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <Volume2 className="size-4" aria-hidden /> {w.ipa}
        </button>
        <span className="text-xs italic text-muted">{w.pos}</span>
      </div>
      <p className="mt-1 text-sm">{w.definition}</p>
      <p className="mt-1 text-sm italic text-muted">“{w.examples[0]}”</p>
      {more ? (
        <div className="mt-2 flex flex-col gap-1 text-sm">
          {w.examples.slice(1).map((e) => <p key={e} className="italic text-muted">“{e}”</p>)}
          <p><span className="font-semibold">Collocations:</span> {w.collocations.join(' · ')}</p>
          <p><span className="font-semibold">Usage:</span> {w.usage}</p>
        </div>
      ) : null}
      {quiz ? (
        <div className="mt-3 flex flex-col gap-1.5" role="group" aria-label="Which definition is right?">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Which definition is right?</p>
          {quiz.options.map((o, i) => {
            const state = result ? (i === result.answer ? 'border-positive text-positive' : i === result.picked ? 'border-accent text-accent-text' : 'opacity-60') : 'hover:border-muted';
            return (
              <button key={o} type="button" disabled={Boolean(result)} onClick={() => void answer(i)} className={`rounded-xl border border-line px-3 py-2 text-left text-sm ${state}`}>
                {o}
              </button>
            );
          })}
          {result ? <p role="status" className="text-sm">{result.picked === result.answer ? 'Correct! 🎉' : 'Not quite. The green one is right.'}</p> : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setMore((m) => !m)} className="rounded-full border border-line px-3 py-1.5 text-muted hover:text-text">{more ? 'Less' : 'More'}</button>
        {!quiz ? <button type="button" onClick={() => void startQuiz()} className="rounded-full border border-line px-3 py-1.5 text-muted hover:text-text">Quick quiz</button> : null}
        <button type="button" onClick={() => void mark('saved')} aria-pressed={status === 'saved'} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${status === 'saved' ? 'border-sand bg-sand text-on-panel' : 'border-line text-muted'}`}><Bookmark className="size-3.5" aria-hidden /> Save</button>
        <button type="button" onClick={() => void mark('known')} aria-pressed={status === 'known'} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${status === 'known' ? 'border-positive text-positive' : 'border-line text-muted'}`}><Check className="size-3.5" aria-hidden /> I know it</button>
        <span className="ml-auto inline-flex items-center gap-1 text-muted"><Flame className="size-3.5 text-accent-text" aria-hidden />{streak}-day streak</span>
      </div>
    </Panel>
  );
}

type Slot = { kind: 'event' | 'task' | 'reminder'; at: Date; title: string; sub?: string; allDay?: boolean };
function scheduleOf(data: Home): Slot[] {
  return [
    ...data.events.map((e): Slot => ({ kind: 'event', at: new Date(e.startAt), title: e.title, sub: e.location ?? undefined, allDay: e.allDay })),
    ...data.tasks.filter((t) => t.dueAt).map((t): Slot => ({ kind: 'task', at: new Date(t.dueAt!), title: t.title, sub: t.priority === 'high' || t.priority === 'urgent' ? t.priority : undefined })),
    ...data.reminders.filter((r) => r.nextOccurrenceAt && new Date(r.nextOccurrenceAt).toDateString() === new Date().toDateString()).map((r): Slot => ({ kind: 'reminder', at: new Date(r.nextOccurrenceAt!), title: r.title })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}
const SLOT_ICON = { event: CalendarDays, task: CheckSquare, reminder: AlarmClock } as const;
const slotTime = (s: Slot, tz: string) => (s.allDay ? 'All day' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(s.at));

export function ScheduleList({ data, limit = 8 }: { data: Home; limit?: number }) {
  const slots = scheduleOf(data).slice(0, limit);
  if (!slots.length) return <p className="text-sm text-muted">Nothing scheduled today. <Link href="/calendar" className="underline">Add an event</Link></p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {slots.map((s, i) => {
        const Icon = SLOT_ICON[s.kind];
        return (
          <li key={i} className="flex min-w-0 items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted">{slotTime(s, data.timezone)}</span>
            <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{s.title}</span>
            {s.sub ? <span className="hidden truncate text-xs text-muted sm:inline">· {s.sub}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function NewsList({ data, limit = 5, withSummary }: { data: Home; limit?: number; withSummary?: boolean }) {
  if (!data.news.length) return <p className="text-sm text-muted">No important cyber news from your sources right now.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {data.news.slice(0, limit).map((n) => (
        <li key={n.id} className="min-w-0 text-sm">
          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline">{n.title}</a>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {n.exploitation === 'exploited' ? <span className="inline-flex items-center gap-0.5 text-accent-text"><Flame className="size-3" aria-hidden />Exploited ·</span> : null}
            {n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}
          </p>
          {withSummary ? <p className="mt-0.5 line-clamp-2 text-muted">{n.brief || n.summary}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function TodoList({ data, limit = 5 }: { data: Home; limit?: number }) {
  const todos = data.tasks.length ? data.tasks : data.upNext;
  if (!todos.length) return <p className="text-sm text-muted">Nothing on your list.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {todos.slice(0, limit).map((t) => (
        <li key={t.id} className="flex min-w-0 justify-between gap-2">
          <span className="truncate">{t.title}</span>
          <span className="shrink-0 text-xs text-muted">{t.dueAt ? fmtDateTime(t.dueAt, data.timezone) : '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function ConceptBlock({ data }: { data: Home }) {
  if (!data.lesson) return <p className="text-sm text-muted">All lessons in your topics are done.</p>;
  return (
    <Link href={`/learn/${data.lesson.id}`} className="block">
      <p className="text-xs uppercase tracking-wide text-muted">{data.lesson.topic} · {data.lesson.minutes} min</p>
      <p className="display text-xl">{data.lesson.title}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{data.lesson.summary}</p>
      <p className="mt-1 text-sm font-semibold text-accent-text">Learn in 5 minutes →</p>
    </Link>
  );
}

const BriefMe = () => (
  <Link href="/chat?brief=1" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent">
    <Sparkles className="size-4" aria-hidden /> Brief me
  </Link>
);

/* ------------------------------------------------------------------ */
/* Layouts                                                              */
/* ------------------------------------------------------------------ */

function Header({ data, children }: { data: Home; children?: ReactNode }) {
  return (
    <header className="rise mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display display-lg">{data.greeting}</h1>
        <p className="text-sm text-muted">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: data.timezone }).format(new Date())}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children ?? <BriefMe />}</div>
    </header>
  );
}

function Magazine({ data, dense }: { data: Home; dense: boolean }) {
  const [lead, ...rest] = data.news;
  return (
    <div>
      <Header data={data} />
      <div className={`grid ${dense ? 'gap-3' : 'gap-4'} lg:grid-cols-3`}>
        <article className="rise relative min-h-72 overflow-hidden rounded-3xl border border-line lg:col-span-2">
          <Art seed={lead?.title.length ?? 11} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-5 text-white sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{lead?.exploitation === 'exploited' ? 'Actively exploited' : 'Cover story'}</p>
            {lead ? (
              <a href={lead.url} target="_blank" rel="noopener noreferrer nofollow" className="display mt-1 text-[clamp(1.6rem,1rem+2.4vw,2.8rem)] leading-tight hover:underline">{lead.title}</a>
            ) : (
              <p className="display mt-1 text-3xl">A quiet day in cyber</p>
            )}
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/85">{lead ? lead.brief || lead.summary : 'No important stories from your sources right now.'}</p>
            {lead ? <p className="mt-1 text-xs text-white/70">{lead.sourceName} · {relativeTime(lead.publishedAt ?? lead.fetchedAt)}</p> : null}
          </div>
        </article>
        <div className="flex flex-col gap-4">
          <Panel title="Concept of the day" dense={dense}><ConceptBlock data={data} /></Panel>
          <WordCard data={data} dense={dense} />
        </div>
        {rest.slice(0, 3).map((n, i) => (
          <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer nofollow" className={`tile rise rise-${i + 1} overflow-hidden rounded-3xl border border-line bg-surface`}>
            <Art seed={n.title.length + i} className="h-28 w-full" />
            <div className="p-4">
              <p className="text-xs text-muted">{n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}</p>
              <p className="display mt-1 text-lg leading-snug">{n.title}</p>
            </div>
          </a>
        ))}
        <Panel title="Today" icon={<CalendarDays className="size-4" aria-hidden />} href="/calendar" dense={dense}><ScheduleList data={data} /></Panel>
        <Panel title="To-dos" icon={<CheckSquare className="size-4" aria-hidden />} href="/tasks" dense={dense}><TodoList data={data} /></Panel>
      </div>
    </div>
  );
}

function Timeline({ data, dense }: { data: Home; dense: boolean }) {
  const slots = scheduleOf(data);
  const now = Date.now();
  return (
    <div>
      <Header data={data} />
      <div className={`grid ${dense ? 'gap-3' : 'gap-4'} lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`}>
        <section aria-label="Your day" className="rise rounded-3xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold">Your day</h2>
          {slots.length ? (
            <ol className="relative ml-3 border-l-2 border-line">
              {slots.map((s, i) => {
                const Icon = SLOT_ICON[s.kind];
                const past = s.at.getTime() < now;
                return (
                  <li key={i} className={`relative mb-4 pl-6 ${past ? 'opacity-60' : ''}`}>
                    <span className={`absolute -left-[11px] top-0.5 grid size-5 place-items-center rounded-full border-2 border-bg ${s.kind === 'event' ? 'bg-accent' : s.kind === 'task' ? 'bg-sand' : 'bg-positive'}`}><Icon className="size-2.5 text-bg" aria-hidden /></span>
                    <p className="text-xs font-semibold text-muted">{slotTime(s, data.timezone)}</p>
                    <p className="font-medium">{s.title}</p>
                    {s.sub ? <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" aria-hidden />{s.sub}</p> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nothing on the clock today. <Link href="/calendar" className="underline">Plan something</Link>.</p>
          )}
        </section>
        <div className="flex flex-col gap-4">
          <Panel title="Top stories" icon={<Newspaper className="size-4" aria-hidden />} href="/news" dense={dense}><NewsList data={data} limit={3} /></Panel>
          <WordCard data={data} dense={dense} />
        </div>
      </div>
    </div>
  );
}

function Bento({ data, dense }: { data: Home; dense: boolean }) {
  return (
    <div>
      <Header data={data} />
      <div className={`grid auto-rows-[minmax(8rem,auto)] ${dense ? 'gap-3' : 'gap-4'} sm:grid-cols-2 lg:grid-cols-4`}>
        <Panel title="Top stories" icon={<Newspaper className="size-4" aria-hidden />} href="/news" dense={dense} className="sm:col-span-2 lg:row-span-2"><NewsList data={data} limit={4} withSummary /></Panel>
        <section aria-label="Open to-dos" className="rise flex flex-col justify-between rounded-3xl bg-accent p-4 text-on-accent">
          <CheckSquare className="size-5" aria-hidden />
          <div><p className="display text-5xl">{data.counts.openTasks}</p><p className="text-sm">open to-dos</p></div>
        </section>
        <section aria-label="Learning streak" className="rise flex flex-col justify-between rounded-3xl bg-panel p-4 text-on-panel">
          <Flame className="size-5" aria-hidden />
          <div><p className="display text-5xl">{data.streak.days}</p><p className="text-sm">day learning streak</p></div>
        </section>
        <Panel title="Today" icon={<CalendarDays className="size-4" aria-hidden />} href="/calendar" dense={dense} className="sm:col-span-2"><ScheduleList data={data} limit={5} /></Panel>
        <WordCard data={data} dense={dense} className="sm:col-span-2" />
        <Panel title="Concept" dense={dense} className="sm:col-span-2"><ConceptBlock data={data} /></Panel>
      </div>
    </div>
  );
}

function Focus({ data }: { data: Home }) {
  const todos = (data.tasks.length ? data.tasks : data.upNext).slice(0, 3);
  const next = scheduleOf(data).find((s) => s.at.getTime() >= Date.now());
  return (
    <div className="mx-auto max-w-2xl pt-6">
      <p className="rise text-sm text-muted">{data.greeting}</p>
      <h1 className="display rise mt-1 text-4xl">Three things today.</h1>
      <ol className="mt-6 flex flex-col gap-3">
        {todos.length ? todos.map((t, i) => (
          <li key={t.id} className={`rise rise-${i + 1} flex items-center gap-4 rounded-2xl border border-line bg-surface p-4`}>
            <span className="display text-3xl text-accent-text">{i + 1}</span>
            <div className="min-w-0"><p className="font-medium">{t.title}</p><p className="text-xs text-muted">{t.dueAt ? fmtDateTime(t.dueAt, data.timezone) : 'No due date'}</p></div>
          </li>
        )) : <li className="text-muted">Nothing on your list. Enjoy the focus.</li>}
      </ol>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rise rounded-2xl border border-line p-4"><p className="text-xs uppercase tracking-wide text-muted">Next up</p><p className="mt-1 font-medium">{next ? `${slotTime(next, data.timezone)} · ${next.title}` : 'Nothing else scheduled'}</p></div>
        <div className="rise rounded-2xl border border-line p-4"><p className="text-xs uppercase tracking-wide text-muted">Word of the day</p><p className="display mt-1 text-xl">{data.word.word}</p><p className="text-sm text-muted">{data.word.definition}</p></div>
      </div>
      <div className="mt-6 flex justify-center"><BriefMe /></div>
    </div>
  );
}

function Command({ data, dense }: { data: Home; dense: boolean }) {
  const exploited = data.news.filter((n) => n.exploitation === 'exploited');
  const stats: { label: string; value: number | string; tone?: string; href: string }[] = [
    { label: 'Open to-dos', value: data.counts.openTasks, href: '/tasks' },
    { label: 'Due today', value: data.counts.tasksToday, href: '/tasks' },
    { label: 'Events today', value: data.events.length, href: '/calendar' },
    { label: 'Reminders', value: data.reminders.length, href: '/reminders' },
    { label: 'Exploited stories', value: exploited.length, tone: exploited.length ? 'text-accent-text' : '', href: '/news' },
    { label: 'Reviews due', value: data.counts.reviewsDue, href: '/learn' },
    { label: 'Streak', value: `${data.streak.days}d`, href: '/learn' },
  ];
  return (
    <div>
      <Header data={data} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rise rounded-2xl border border-line bg-surface p-3 hover:border-muted">
            <p className={`display text-3xl ${s.tone ?? ''}`}>{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Link>
        ))}
      </div>
      <div className={`grid ${dense ? 'gap-2' : 'gap-3'} md:grid-cols-2 xl:grid-cols-3`}>
        <Panel title="Alerts" icon={<Zap className="size-4 text-accent-text" aria-hidden />} href="/news" dense>
          {exploited.length ? <NewsList data={{ ...data, news: exploited }} limit={4} /> : <p className="text-sm text-muted">No actively exploited issues in your feeds.</p>}
        </Panel>
        <Panel title="Schedule" icon={<CalendarDays className="size-4" aria-hidden />} href="/calendar" dense><ScheduleList data={data} limit={10} /></Panel>
        <Panel title="Priorities" icon={<CheckSquare className="size-4" aria-hidden />} href="/tasks" dense><TodoList data={data} limit={8} /></Panel>
        <Panel title="All stories" icon={<Newspaper className="size-4" aria-hidden />} href="/news" dense className="xl:col-span-2"><NewsList data={data} limit={5} /></Panel>
        <WordCard data={data} dense />
      </div>
    </div>
  );
}

function Knowledge({ data, dense }: { data: Home; dense: boolean }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [words, setWords] = useState<{ word: string; status: string; due: boolean }[]>([]);
  useEffect(() => {
    void api.get<{ lessons: Lesson[] }>('/learn/lessons').then((r) => setLessons(r.lessons)).catch(() => setLessons([]));
    void api.get<{ notes: Note[] }>('/notes').then((r) => setNotes(r.notes.slice(0, 6))).catch(() => undefined);
    void api.get<{ words: { word: string; status: string; due: boolean }[] }>('/words').then((r) => setWords(r.words)).catch(() => undefined);
  }, []);
  const topics = LEARNING_TOPICS.filter((t) => (lessons ?? []).some((l) => l.topic === t.id));
  return (
    <div>
      <Header data={data} />
      <div className={`grid ${dense ? 'gap-3' : 'gap-4'} lg:grid-cols-3`}>
        <section aria-label="Knowledge map" className="rise rounded-3xl border border-line bg-surface p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Your topics</h2>
          {!lessons ? <p className="text-sm text-muted">Loading…</p> : null}
          <div className="flex flex-col gap-4">
            {topics.map((t, ti) => (
              <div key={t.id}>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><span className={`size-2.5 rounded-full ${['bg-accent', 'bg-sand', 'bg-positive', 'bg-sage'][ti % 4]}`} />{t.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lessons!.filter((l) => l.topic === t.id).map((l) => (
                    <Link
                      key={l.id}
                      href={`/learn/${l.id}`}
                      className={`rounded-full border px-3 py-1 text-xs ${l.progress?.status === 'completed' ? 'border-positive/60 text-positive' : l.progress ? 'border-sand text-sand' : 'border-line text-muted hover:text-text'}`}
                    >
                      {l.progress?.status === 'completed' ? '✓ ' : ''}{l.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="flex flex-col gap-4">
          <Panel title="Saved words" icon={<Bookmark className="size-4" aria-hidden />} dense={dense}>
            {words.length ? <div className="flex flex-wrap gap-1.5">{words.map((w) => <span key={w.word} className={`rounded-full border px-2.5 py-0.5 text-xs ${w.due ? 'border-accent text-accent-text' : 'border-line'}`}>{w.word}{w.due ? ' · review' : ''}</span>)}</div> : <p className="text-sm text-muted">Save today’s word to start your list.</p>}
          </Panel>
          <Panel title="Recent notes" href="/notes" dense={dense}>
            {notes.length ? <ul className="flex flex-col gap-1 text-sm">{notes.map((n) => <li key={n.id} className="truncate">{n.title}</li>)}</ul> : <p className="text-sm text-muted">No notes yet.</p>}
          </Panel>
          <WordCard data={data} dense={dense} />
        </div>
      </div>
    </div>
  );
}

export function AltLayout({ id, data, dense }: { id: Exclude<HomeLayoutId, 'classic' | 'newspaper'>; data: Home; dense: boolean }) {
  switch (id) {
    case 'magazine':
      return <Magazine data={data} dense={dense} />;
    case 'timeline':
      return <Timeline data={data} dense={dense} />;
    case 'bento':
      return <Bento data={data} dense={dense} />;
    case 'focus':
      return <Focus data={data} />;
    case 'command':
      return <Command data={data} dense={dense} />;
    case 'knowledge':
      return <Knowledge data={data} dense={dense} />;
  }
}

