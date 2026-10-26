'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, LayoutGrid, Sparkles, X } from 'lucide-react';
import type { Home, NewsItem, Reminder, Task } from '@/lib/types';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Art } from './Art';

/**
 * Home as a newspaper front page. Everything is laid out from data already on /home:
 * no AI calls, headlines for to-dos and reminders are written by simple rules.
 */

const EXPLOIT_KICKER: Record<string, string> = { exploited: 'Actively exploited', 'proof-of-concept': 'Exploit code public' };

type Story =
  | { kind: 'news'; item: NewsItem }
  | { kind: 'concept'; lesson: NonNullable<Home['lesson']> }
  | { kind: 'tasks'; items: Task[]; open: number }
  | { kind: 'reminders'; items: Reminder[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const titleCase = (s: string) => s.replace(/\b([a-z])(\w*)/g, (_, a: string, b: string) => (['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'for', 'at'].includes(a + b) ? a + b : a.toUpperCase() + b));

function tasksHeadline(items: Task[], open: number) {
  if (!open) return 'Desk Clear: Not a Single To-Do Remains';
  const lead = items[0] ? titleCase(clip(items[0].title, 40)) : '';
  if (open >= 5) return `${open} To-Dos Pile Up; ${lead} Tops the Agenda`;
  return open === 1 ? `Lone Task Stands: ${lead}` : `${open} Tasks Await; ${lead} Leads the Charge`;
}

function remindersHeadline(items: Reminder[], tz: string) {
  if (!items.length) return 'Calendar Quiet as Reminders Take a Day Off';
  const r = items[0]!;
  const at = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(r.nextOccurrenceAt ?? Date.now()));
  return `${titleCase(clip(r.title, 40))} at ${at}, Sources Confirm`;
}

/** Full-screen reader for whatever part of the page was tapped. */
function Reader({ story, tz, onClose }: { story: Story; tz: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  let kicker = '';
  let headline = '';
  let body: ReactNode = null;
  let seed = 4;
  if (story.kind === 'news') {
    const n = story.item;
    kicker = EXPLOIT_KICKER[n.exploitation ?? ''] ?? 'Cybersecurity';
    headline = n.title;
    seed = n.title.length;
    body = (
      <>
        <p className="np-byline">{n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}</p>
        <p className="np-dropcap">{n.brief || n.summary || 'The source did not include a summary. Read the full story at the source.'}</p>
        {n.affected ? <p><strong>Affected:</strong> {n.affected}</p> : null}
        {n.action ? <p><strong>What to do:</strong> {n.action}</p> : null}
        <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="np-cta">Read at {n.sourceName} <ArrowUpRight className="size-4" aria-hidden /></a>
      </>
    );
  } else if (story.kind === 'concept') {
    const l = story.lesson;
    kicker = `Concept of the Day · ${l.topic}`;
    headline = l.title;
    seed = l.artSeed;
    body = (
      <>
        <p className="np-byline">A {l.minutes}-minute read</p>
        <p className="np-dropcap">{l.summary}</p>
        <blockquote className="np-pull">“{l.takeaway}”</blockquote>
        <Link href={`/learn/${l.id}`} className="np-cta">Continue on page B1: the full lesson <ArrowUpRight className="size-4" aria-hidden /></Link>
      </>
    );
  } else if (story.kind === 'tasks') {
    kicker = 'To-Do Dispatch';
    headline = tasksHeadline(story.items, story.open);
    body = (
      <>
        <ul className="np-list">
          {story.items.map((t) => <li key={t.id}><strong>{t.title}</strong><span>{t.dueAt ? fmtDateTime(t.dueAt, tz) : 'No deadline'}{t.priority === 'high' || t.priority === 'urgent' ? ` · ${t.priority}` : ''}</span></li>)}
        </ul>
        {!story.items.length ? <p>Nothing on the list. Enjoy the quiet edition.</p> : null}
        <Link href="/tasks" className="np-cta">All to-dos <ArrowUpRight className="size-4" aria-hidden /></Link>
      </>
    );
  } else {
    kicker = 'Reminders';
    headline = remindersHeadline(story.items, tz);
    body = (
      <>
        <ul className="np-list">
          {story.items.map((r) => <li key={r.id}><strong>{r.title}</strong><span>{fmtDateTime(r.nextOccurrenceAt, tz)}</span></li>)}
        </ul>
        {!story.items.length ? <p>No reminders scheduled.</p> : null}
        <Link href="/reminders" className="np-cta">All reminders <ArrowUpRight className="size-4" aria-hidden /></Link>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={headline}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <article className="paper mira-pop safe-bottom absolute inset-0 overflow-y-auto p-5 sm:inset-x-[max(1rem,calc(50%-22rem))] sm:inset-y-6 sm:rounded-sm sm:p-8">
        <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--np-ink)] pb-2">
          <p className="np-kicker">{kicker}</p>
          <button ref={closeRef} onClick={onClose} aria-label="Close story" className="-mr-2 -mt-2 grid size-11 place-items-center rounded-full hover:bg-black/5"><X className="size-5" /></button>
        </div>
        <h2 className="np-headline mt-3 text-[clamp(1.8rem,1.2rem+3vw,3rem)]">{headline}</h2>
        {story.kind === 'news' || story.kind === 'concept' ? <Art seed={seed} className="np-photo mt-4 aspect-[16/7] w-full" /> : null}
        <div className="np-body mt-4 flex flex-col gap-3">{body}</div>
      </article>
    </div>
  );
}

function Hit({ story, label, className = '', onOpen, children }: { story: Story; label: string; className?: string; onOpen: (s: Story) => void; children: ReactNode }) {
  return <button type="button" onClick={() => onOpen(story)} aria-label={label} className={`np-hit text-left ${className}`}>{children}</button>;
}

export function Newspaper({ data, onClassic, children }: { data: Home; onClassic: () => void; children?: ReactNode }) {
  const [open, setOpen] = useState<Story | null>(null);
  const tz = data.timezone;
  const now = new Date();
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(now);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const [lead, ...rest] = data.news;
  const todos = data.tasks.length ? data.tasks : data.upNext;

  return (
    <div className="pt-4 pb-4">
      <div className="paper rise rounded-sm p-4 shadow-2xl sm:p-7">
        {/* Masthead */}
        <header className="text-center">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--np-ink)] pb-1 text-[0.65rem] uppercase tracking-[0.18em] sm:text-xs">
            <span>Vol. I · No. {dayOfYear}</span>
            <span className="hidden sm:inline">“All the threats fit to print”</span>
            <span>Price: one coffee</span>
          </div>
          <h1 className="np-masthead my-2">The Mira Times</h1>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-y-2 border-double border-[var(--np-ink)] py-1.5 text-xs uppercase tracking-[0.14em]">
            <span>{date}</span>
            <span aria-hidden>·</span>
            <span>{data.greeting}</span>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href="/chat?brief=1" className="np-button np-button-solid"><Sparkles className="size-4" aria-hidden /> Brief me</Link>
            <button type="button" onClick={onClassic} className="np-button"><LayoutGrid className="size-4" aria-hidden /> Classic view</button>
          </div>
        </header>

        {/* Front page */}
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8 lg:border-r lg:border-[var(--np-rule)] lg:pr-5">
            {lead ? (
              <Hit onOpen={setOpen} story={{ kind: 'news', item: lead }} label={`Read: ${lead.title}`}>
                <p className="np-kicker">{EXPLOIT_KICKER[lead.exploitation ?? ''] ?? 'Top story'}</p>
                <h2 className="np-headline mt-1 text-[clamp(1.9rem,1.1rem+3.4vw,3.4rem)]">{lead.title}</h2>
                <Art seed={lead.title.length} className="np-photo mt-3 aspect-[16/8] w-full" />
                <p className="np-byline mt-2">{lead.sourceName} · {relativeTime(lead.publishedAt ?? lead.fetchedAt)}</p>
                <p className="np-dropcap mt-1 line-clamp-5 sm:columns-2 sm:gap-6">{lead.brief || lead.summary}</p>
              </Hit>
            ) : (
              <div>
                <p className="np-kicker">Top story</p>
                <h2 className="np-headline mt-1 text-[clamp(1.9rem,1.1rem+3.4vw,3.4rem)]">Quiet Day on the Cyber Front</h2>
                <Art seed={21} className="np-photo mt-3 aspect-[16/8] w-full" />
                <p className="mt-2">None of your sources reported anything important in the last three days. <Link href="/news" className="underline">Check the news desk</Link>.</p>
              </div>
            )}

            {rest.length ? (
              <div className="mt-5 grid gap-4 border-t-2 border-[var(--np-ink)] pt-3 sm:grid-cols-2">
                {rest.map((n, i) => (
                  <Hit onOpen={setOpen} key={n.id} story={{ kind: 'news', item: n }} label={`Read: ${n.title}`} className={i % 2 ? 'sm:border-l sm:border-[var(--np-rule)] sm:pl-4' : ''}>
                    <p className="np-kicker">{EXPLOIT_KICKER[n.exploitation ?? ''] ?? n.sourceName}</p>
                    <h3 className="np-headline mt-1 text-xl">{n.title}</h3>
                    <p className="mt-1 line-clamp-3 text-sm">{n.brief || n.summary}</p>
                  </Hit>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="lg:col-span-4">
            {data.lesson ? (
              <Hit onOpen={setOpen} story={{ kind: 'concept', lesson: data.lesson }} label={`Read concept: ${data.lesson.title}`} className="block border-y-4 border-double border-[var(--np-ink)] py-3">
                <p className="np-kicker">Concept of the Day</p>
                <h2 className="np-headline mt-1 text-3xl">{data.lesson.title}</h2>
                <Art seed={data.lesson.artSeed} variant="square" className="np-photo mt-3 aspect-[4/3] w-full" />
                <p className="np-dropcap mt-2 line-clamp-4 text-sm">{data.lesson.summary}</p>
                <blockquote className="np-pull mt-2 line-clamp-3">“{data.lesson.takeaway}”</blockquote>
                <p className="mt-2 text-xs uppercase tracking-widest">Continued on B1 →</p>
              </Hit>
            ) : (
              <div className="border-y-4 border-double border-[var(--np-ink)] py-3">
                <p className="np-kicker">Concept of the Day</p>
                <h2 className="np-headline mt-1 text-3xl">Scholar Completes Entire Curriculum</h2>
                <p className="mt-2 text-sm">Every lesson in your topics is done. <Link href="/settings" className="underline">Add a topic</Link> to keep going.</p>
              </div>
            )}
          </aside>
        </div>

        {/* To-dos and reminders as headline boxes */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Hit onOpen={setOpen} story={{ kind: 'tasks', items: todos, open: data.counts.openTasks }} label="Open to-dos" className="np-box">
            <p className="np-kicker">To-Do Dispatch</p>
            <h3 className="np-headline mt-1 text-2xl">{tasksHeadline(todos, data.counts.openTasks)}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {todos.slice(0, 3).map((t) => <li key={t.id} className="flex justify-between gap-3 border-b border-dotted border-[var(--np-rule)] pb-1"><span className="truncate">{t.title}</span><span className="shrink-0 opacity-70">{t.dueAt ? fmtDateTime(t.dueAt, tz) : '—'}</span></li>)}
            </ul>
          </Hit>
          <Hit onOpen={setOpen} story={{ kind: 'reminders', items: data.reminders }} label="Open reminders" className="np-box">
            <p className="np-kicker">Reminders</p>
            <h3 className="np-headline mt-1 text-2xl">{remindersHeadline(data.reminders, tz)}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {data.reminders.slice(0, 3).map((r) => <li key={r.id} className="flex justify-between gap-3 border-b border-dotted border-[var(--np-rule)] pb-1"><span className="truncate">{r.title}</span><span className="shrink-0 opacity-70">{fmtDateTime(r.nextOccurrenceAt, tz)}</span></li>)}
            </ul>
          </Hit>
          <Link href="/calendar" className="np-box np-hit block">
            <p className="np-kicker">Today’s Schedule</p>
            <h3 className="np-headline mt-1 text-2xl">{data.events.length ? `${data.events.length} Engagement${data.events.length === 1 ? '' : 's'} on the Books` : 'Diary Wide Open Today'}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {data.events.slice(0, 3).map((e) => <li key={`${e.id}${e.startAt}`} className="flex justify-between gap-3 border-b border-dotted border-[var(--np-rule)] pb-1"><span className="truncate">{e.title}</span><span className="shrink-0 opacity-70">{e.allDay ? 'All day' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(e.startAt))}</span></li>)}
            </ul>
          </Link>
          <div className="np-box">
            <p className="np-kicker">Word of the Day</p>
            <h3 className="np-headline mt-1 text-3xl">{data.word.word}</h3>
            <p className="text-xs italic opacity-70">{data.word.pos} · {data.word.ipa}</p>
            <p className="mt-1 text-sm">{data.word.definition}</p>
            <p className="mt-1 text-sm italic opacity-80">“{data.word.examples[0]}”</p>
          </div>
        </div>
      </div>
      {children}
      {open ? <Reader story={open} tz={tz} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
