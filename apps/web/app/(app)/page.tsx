'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Sparkles, BookOpen, Bell, CheckSquare, ChevronDown, ChevronUp, EyeOff, MessageCircle, Mic, Newspaper, RefreshCw, Settings2 } from 'lucide-react';
import type { WidgetId } from '@friday/shared';
import type { Home } from '@/lib/types';
import { api } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Art } from '@/components/Art';
import { Badge, Button, Card, Empty, ErrorNote, IconButton, Loading, SectionHeader } from '@/components/ui';
import { TaskItem } from '@/components/TaskItem';
import { QuickAdd } from '@/components/QuickAdd';
import { useSession } from '@/components/AppShell';

const WIDGET_LABEL: Record<WidgetId, string> = {
  brief: 'Daily brief',
  tasks: "Today's tasks",
  reminders: 'Next reminders',
  learning: 'Learning',
  news: 'Top news',
  quickActions: 'Quick add',
};

export default function HomePage() {
  const { data, error, loading, reload } = useResource<Home>('/home');
  const { prefs, setPrefs } = useSession();
  const [customizing, setCustomizing] = useState(false);
  const router = useRouter();
  const briefingNow = useAction(async () => {
    const r = await api.post<{ conversationId: string }>('/briefings/now', {});
    router.push(`/chat?c=${r.conversationId}`);
  });
  const regen = useAction(async () => {
    await api.post('/briefs/generate');
    reload();
  });

  if (loading && !data) return <Loading label="Preparing your day" />;
  if (error && !data) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return null;

  const order = data.dashboard.order.filter((w) => !data.dashboard.hidden.includes(w));
  const tz = data.timezone;
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date());

  const saveLayout = async (next: { order: WidgetId[]; hidden: WidgetId[] }) => {
    if (!prefs) return;
    const res = await api.patch<{ preferences: typeof prefs }>('/preferences', { dashboard: next });
    setPrefs(res.preferences);
    reload();
  };
  const move = (w: WidgetId, dir: -1 | 1) => {
    const o = [...data.dashboard.order];
    const i = o.indexOf(w);
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    void saveLayout({ order: o, hidden: data.dashboard.hidden });
  };

  const widgets: Record<WidgetId, React.ReactNode> = {
    brief: (
      <section key="brief" className="relative overflow-hidden rounded-[2rem] border border-line md:col-span-2">
        <Art seed={2} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/10" />
        <div className="relative flex min-h-[13rem] flex-col justify-end gap-3 p-5 text-cream sm:min-h-[15rem] sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow !text-cream/80">Daily brief</p>
            {data.brief ? <Badge tone="demo">{data.brief.generatedBy === 'ai' ? 'AI-written' : 'From your data'}</Badge> : null}
          </div>
          <h2 className="display display-xl max-w-xl">{data.brief ? data.brief.content.headline : 'Your brief is not ready yet'}</h2>
          {data.brief ? (
            <ul className="grid max-w-2xl gap-1 text-sm text-cream/90 sm:grid-cols-2">
              {data.brief.content.sections.map((s) => (
                <li key={s.kind}><span className="font-semibold">{s.title}:</span> {s.lines[0]}</li>
              ))}
            </ul>
          ) : (
            <p className="max-w-lg text-sm text-cream/85">Your morning brief is generated at {prefs?.schedule.morningBrief ?? '08:00'} by the background worker. You can also create one now.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="panel" onClick={() => void regen.run()} pending={regen.pending}>
              <RefreshCw className="size-4" aria-hidden /> {data.brief ? 'Refresh brief' : 'Generate brief'}
            </Button>
            <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/40 px-4 text-sm font-semibold">
              Ask Mira <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {regen.error ? <p role="alert" className="text-sm text-cream">{regen.error}</p> : null}
        </div>
      </section>
    ),
    tasks: (
      <Card key="tasks">
        <SectionHeader title={`Today's tasks · ${data.counts.tasksToday}`} href="/tasks" />
        {data.tasks.length ? (
          <ul>{data.tasks.map((t) => <TaskItem key={t.id} task={t} timezone={tz} onChange={reload} />)}</ul>
        ) : (
          <Empty title="Nothing due today" body="Add something below, or enjoy the space." />
        )}
      </Card>
    ),
    reminders: (
      <Card key="reminders">
        <SectionHeader title="Next reminders" href="/reminders" />
        {data.reminders.length ? (
          <ul className="flex flex-col gap-2">
            {data.reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-raised p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-green/30 text-positive"><Bell className="size-4" aria-hidden /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted">{fmtDateTime(r.nextOccurrenceAt, tz)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No upcoming reminders" />
        )}
      </Card>
    ),
    learning: (
      <Card key="learning" className="overflow-hidden !p-0">
        {data.lesson ? (
          <Link href={`/learn/${data.lesson.id}`} className="block">
            <div className="relative h-32"><Art seed={data.lesson.artSeed} className="h-full w-full" /></div>
            <div className="p-4">
              <p className="eyebrow">{data.lesson.topic} · {data.lesson.minutes} min</p>
              <p className="display display-md mt-1">{data.lesson.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{data.lesson.summary}</p>
              <p className="mt-2 text-sm font-semibold text-accent-text">{data.lesson.status === 'started' ? 'Continue' : 'Start lesson'} →</p>
            </div>
          </Link>
        ) : (
          <div className="p-4"><Empty title="All caught up" body="You've completed the lessons in your topics." /></div>
        )}
        {data.counts.reviewsDue ? <p className="border-t border-line px-4 py-2 text-xs text-muted">{data.counts.reviewsDue} lesson(s) due for review</p> : null}
      </Card>
    ),
    news: (
      <Card key="news">
        <SectionHeader title="Top news" href="/news" />
        {data.news.length ? (
          <ul className="flex flex-col gap-3">
            {data.news.map((n) => (
              <li key={n.id} className="text-sm">
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline">{n.title}</a>
                <p className="text-xs text-muted">
                  {n.isDemo ? 'Demo sample · ' : ''}{n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No news yet" body="Add sources you trust and Mira will check them on your schedule." action={<Link href="/news" className="text-sm font-semibold underline">Choose sources</Link>} />
        )}
      </Card>
    ),
    quickActions: (
      <Card key="quickActions" className="md:col-span-2">
        <SectionHeader title="Quick add" />
        <QuickAdd onSaved={reload} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { href: '/tasks', label: 'Tasks', icon: CheckSquare },
            { href: '/reminders', label: 'Reminders', icon: Bell },
            { href: '/learn', label: 'Learn', icon: BookOpen },
            { href: '/news', label: 'News', icon: Newspaper },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-14 items-center gap-2 rounded-2xl bg-panel px-3 text-sm font-semibold text-on-panel">
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </Card>
    ),
  };

  return (
    <div className="pt-5">
      <header className="compact-landscape mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display display-xl">{data.greeting}</h1>
          {briefingNow.error ? <p role="alert" className="text-sm text-accent-text">{briefingNow.error}</p> : null}
          <p className="hide-short mt-1 text-sm text-muted">{dateLabel} · {data.counts.tasksToday} tasks · {data.counts.reminders} reminders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="panel" onClick={() => void briefingNow.run()} pending={briefingNow.pending}>
            <Sparkles className="size-4" aria-hidden /> Today’s briefing
          </Button>
          <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">
            <Mic className="size-4" aria-hidden /> Talk to Mira
          </Link>
          <IconButton label="Customize dashboard" onClick={() => setCustomizing((c) => !c)} aria-expanded={customizing}>
            <Settings2 className="size-5" aria-hidden />
          </IconButton>
        </div>
      </header>

      {customizing ? (
        <Card className="mb-4">
          <SectionHeader title="Customize dashboard" />
          <ul className="flex flex-col gap-1">
            {data.dashboard.order.map((w, i) => {
              const hidden = data.dashboard.hidden.includes(w);
              return (
                <li key={w} className="flex items-center gap-2 text-sm">
                  <span className={`flex-1 ${hidden ? 'text-muted line-through' : ''}`}>{WIDGET_LABEL[w]}</span>
                  <IconButton label={`Move ${WIDGET_LABEL[w]} up`} disabled={i === 0} onClick={() => move(w, -1)}><ChevronUp className="size-4" /></IconButton>
                  <IconButton label={`Move ${WIDGET_LABEL[w]} down`} disabled={i === data.dashboard.order.length - 1} onClick={() => move(w, 1)}><ChevronDown className="size-4" /></IconButton>
                  <IconButton
                    label={hidden ? `Show ${WIDGET_LABEL[w]}` : `Hide ${WIDGET_LABEL[w]}`}
                    onClick={() => void saveLayout({ order: data.dashboard.order, hidden: hidden ? data.dashboard.hidden.filter((h) => h !== w) : [...data.dashboard.hidden, w] })}
                  >
                    <EyeOff className={`size-4 ${hidden ? 'text-accent-text' : ''}`} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">{order.map((w) => widgets[w])}</div>
      <p className="mt-6 text-center text-xs text-muted">
        Times shown in {tz}. Next brief at {prefs?.schedule.morningBrief ?? '08:00'}. <Link href="/chat" className="inline-flex items-center gap-1 underline"><MessageCircle className="size-3" aria-hidden />Chat</Link>
      </p>
    </div>
  );
}
