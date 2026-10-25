'use client';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, Bookmark, BookmarkCheck, EyeOff, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { NewsItem } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { Badge, Button, Card, Chip, Empty, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';

interface NewsResponse {
  items: NewsItem[];
  status: { sources: number; failingSources: number; lastSuccessAt: string | null; stale: boolean };
}
interface Source {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}
interface SourcesResponse {
  sources: Source[];
  suggestions: { name: string; url: string; category: string }[];
}

const FILTERS = [
  { id: '', label: 'Cybersecurity' },
  { id: 'importance=breaking', label: 'Breaking' },
  { id: 'importance=important', label: 'Important' },
  { id: 'importance=relevant', label: 'Relevant' },
  { id: 'importance=background', label: 'Background' },
  { id: 'saved=true', label: 'Saved' },
  { id: 'scope=all', label: 'Everything fetched' },
];

const IMPORTANCE_TONE = { breaking: 'accent', important: 'demo', relevant: 'positive', background: 'neutral' } as const;

function NewsCard({ item, onChange }: { item: NewsItem; onChange: () => void }) {
  const [saved, setSaved] = useState(item.saved);
  const [error, setError] = useState<string | null>(null);
  const feedback = async (body: { saved?: boolean; hidden?: boolean }) => {
    try {
      await api.post(`/news/${item.id}/feedback`, body);
      if (body.saved !== undefined) setSaved(body.saved);
      if (body.hidden) onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <li className="flex flex-col gap-2 border-b border-line/70 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone={IMPORTANCE_TONE[item.importance]}>{item.importance}</Badge>
        {item.exploitation === 'exploited' ? <Badge tone="accent">Exploited in the wild</Badge> : item.exploitation === 'proof-of-concept' ? <Badge tone="demo">Public PoC</Badge> : null}
        {item.isDemo ? <Badge tone="demo">Demo sample — not real news</Badge> : null}
        <span>{item.sourceName}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.publishedAt ?? item.fetchedAt}>{item.publishedAt ? relativeTime(item.publishedAt) : `fetched ${relativeTime(item.fetchedAt)}`}</time>
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="display text-xl hover:underline">
        {item.title} <ExternalLink className="inline size-4 align-baseline text-muted" aria-label="(opens source in a new tab)" />
      </a>
      {item.summary ? <p className="text-sm text-muted">{item.summary}</p> : null}
      <div className="flex gap-1">
        <IconButton label={saved ? 'Unsave' : 'Save'} onClick={() => void feedback({ saved: !saved })} aria-pressed={saved}>
          {saved ? <BookmarkCheck className="size-4 text-sand" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </IconButton>
        <IconButton label="Hide this story" onClick={() => void feedback({ hidden: true })}>
          <EyeOff className="size-4" aria-hidden />
        </IconButton>
      </div>
      {error ? <ErrorNote message={error} /> : null}
    </li>
  );
}

function SourcesPanel({ onChanged }: { onChanged: () => void }) {
  const { data, error, loading, reload } = useResource<SourcesResponse>('/news/sources');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('general');
  const add = useAction(async (body: { name: string; url: string; category: string }) => {
    await api.post('/news/sources', body);
    reload();
    onChanged();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run({ name, url, category }).then(() => {
      setName('');
      setUrl('');
    });
  };
  const toggle = async (s: Source) => {
    await api.patch(`/news/sources/${s.id}`, { enabled: !s.enabled }).catch(() => undefined);
    reload();
  };
  const remove = async (s: Source) => {
    if (!window.confirm(`Remove "${s.name}" and its stories?`)) return;
    await api.del(`/news/sources/${s.id}`).catch(() => undefined);
    reload();
    onChanged();
  };

  return (
    <Card className="min-w-0">
      <h2 className="mb-1 text-base font-semibold">Your sources</h2>
      <p className="mb-3 text-xs text-muted">Mira reads the public RSS/Atom feeds you choose, on your schedule, and links back to the original articles.</p>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      <ul className="flex flex-col gap-2">
        {data?.sources.map((s) => (
          <li key={s.id} className="rounded-2xl bg-raised p-3 text-sm">
            <div className="flex items-center gap-2">
              <label className="flex min-h-11 flex-1 items-center gap-2">
                <input type="checkbox" checked={s.enabled} onChange={() => void toggle(s)} className="size-5 accent-[var(--accent)]" />
                <span className="font-medium">{s.name}</span>
              </label>
              <IconButton label={`Remove ${s.name}`} onClick={() => void remove(s)}><Trash2 className="size-4" aria-hidden /></IconButton>
            </div>
            <p className="truncate text-xs text-muted">{s.url}</p>
            {s.lastError ? <p className="text-xs text-accent-text">Last fetch failed: {s.lastError}</p> : s.lastSuccessAt ? <p className="text-xs text-muted">Updated {relativeTime(s.lastSuccessAt)}</p> : <p className="text-xs text-muted">Not fetched yet</p>}
          </li>
        ))}
      </ul>
      {data?.suggestions.length ? (
        <div className="mt-4">
          <p className="eyebrow mb-2">Suggestions</p>
          <ul className="flex flex-col gap-1">
            {data.suggestions.map((s) => (
              <li key={s.url}>
                <button onClick={() => void add.run(s)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-raised">
                  <Plus className="size-4 text-muted" aria-hidden /> {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        <p className="eyebrow">Add a feed</p>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputClass} /></Field>
        <Field label="Feed URL" hint="Must be https://"><input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required placeholder="https://example.com/feed.xml" className={inputClass} /></Field>
        <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} className={inputClass} /></Field>
        {add.error ? <ErrorNote message={add.error} /> : null}
        <Button type="submit" pending={add.pending}>Add source</Button>
      </form>
    </Card>
  );
}

export default function NewsPage() {
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useResource<NewsResponse>(`/news${filter ? `?${filter}` : ''}`);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const refresh = useAction(async () => {
    const r = await api.post<{ sources: number; added: number; failures: number }>('/news/refresh');
    setRefreshNote(`Checked ${r.sources} source(s): ${r.added} new ${r.added === 1 ? 'story' : 'stories'}${r.failures ? `, ${r.failures} failed` : ''}.`);
    reload();
  });

  return (
    <div>
      <PageHeader
        title="News"
        subtitle="Cybersecurity news from the sources you follow — always linked to the original."
        actions={<Button onClick={() => void refresh.run()} pending={refresh.pending}><RefreshCw className="size-4" aria-hidden /> Check now</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {FILTERS.map((f) => <Chip key={f.label} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
          </div>
          {refresh.error ? <ErrorNote message={refresh.error} /> : null}
          {refreshNote ? <p role="status" className="mb-2 text-sm text-muted">{refreshNote}</p> : null}
          {data?.status.stale ? (
            <div role="status" className="mb-3 flex items-center gap-2 rounded-2xl border border-sand/40 bg-sand/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-sand" aria-hidden />
              News may be out of date — last successful update {data.status.lastSuccessAt ? relativeTime(data.status.lastSuccessAt) : 'never'}.
              {data.status.failingSources ? ` ${data.status.failingSources} source(s) are failing.` : ''}
            </div>
          ) : null}
          {error ? <ErrorNote message={error} onRetry={reload} /> : null}
          {loading && !data ? <Loading /> : null}
          {data && data.items.length === 0 ? (
            <Empty
              title={data.status.sources === 0 ? 'Choose your sources' : 'No stories here yet'}
              body={data.status.sources === 0 ? 'Add a feed or pick a suggestion. Mira never invents news.' : 'Mira checks your sources at your scheduled times, or tap “Check now”.'}
            />
          ) : null}
          {data && data.items.length > 0 ? (
            <Card><ul>{data.items.map((n) => <NewsCard key={n.id} item={n} onChange={reload} />)}</ul></Card>
          ) : null}
        </div>
        <SourcesPanel onChanged={reload} />
      </div>
    </div>
  );
}
