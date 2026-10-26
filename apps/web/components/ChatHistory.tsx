'use client';
import { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, CalendarDays, CheckSquare, Download, Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Chip, IconButton, Loading, inputClass } from './ui';

export interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
  kind?: 'chat' | 'daily';
  localDate?: string | null;
  pinned?: boolean;
  folder?: string | null;
  archived?: boolean;
  preview?: string | null;
}

/** Search, pin, rename, archive, export and multi-select over the user's conversations. */
export function ChatHistory({ currentId, onOpen, onRemoved }: { currentId: string | null; onOpen: (id: string) => void; onRemoved: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ conversations: ConversationRow[] }>(`/chat/conversations?archived=${archived ? 1 : 0}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`);
      setRows(r.conversations);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [archived, debounced]);
  useEffect(() => void load(), [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api.patch(`/chat/conversations/${id}`, body).catch((e: unknown) => setError(errorMessage(e)));
    void load();
  };
  const rename = (c: ConversationRow) => {
    const title = window.prompt('Rename conversation', c.title)?.trim();
    if (title) void patch(c.id, { title: title.slice(0, 120) });
  };
  const bulk = async (action: 'archive' | 'unarchive' | 'delete', ids = [...selected]) => {
    if (!ids.length) return;
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} conversation${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await api.post('/chat/conversations/bulk', { ids, action });
      if (action !== 'unarchive') onRemoved(ids);
      setSelected(new Set());
      setSelecting(false);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mb-2 flex max-h-[55dvh] flex-col rounded-2xl border border-line bg-raised p-2">
      <div className="flex flex-wrap items-center gap-2 p-1">
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Search conversations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and messages" className={`${inputClass} !min-h-10 pl-9`} />
        </label>
        <Chip active={archived} onClick={() => { setArchived((a) => !a); setSelected(new Set()); }}>Archived</Chip>
        <Chip active={selecting} onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}>Select</Chip>
      </div>
      {selecting ? (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1 text-xs">
          <span className="text-muted">{selected.size} selected</span>
          <button type="button" onClick={() => setSelected(new Set(rows?.map((r) => r.id)))} className="underline">All</button>
          <button type="button" disabled={!selected.size} onClick={() => void bulk(archived ? 'unarchive' : 'archive')} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 disabled:opacity-40">
            {archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />} {archived ? 'Restore' : 'Archive'}
          </button>
          <button type="button" disabled={!selected.size} onClick={() => void bulk('delete')} className="inline-flex items-center gap-1 rounded-full border border-accent/60 px-3 py-1 text-accent-text disabled:opacity-40">
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="px-2 text-xs text-accent-text">{error}</p> : null}
      <div className="min-h-0 overflow-y-auto scrollbar-thin">
        {!rows ? <Loading /> : rows.length === 0 ? <p className="p-2 text-sm text-muted">{debounced ? 'No matches.' : archived ? 'Nothing archived.' : 'No conversations yet.'}</p> : null}
        <ul>
          {rows?.map((c) => (
            <li key={c.id} className={`flex items-start gap-1 rounded-xl ${c.id === currentId ? 'bg-surface' : ''}`}>
              {selecting ? (
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.title}`} className="ml-2 mt-3.5 size-4 shrink-0 accent-[var(--accent)]" />
              ) : null}
              <button onClick={() => (selecting ? toggle(c.id) : onOpen(c.id))} className="min-h-11 min-w-0 flex-1 px-2 py-1.5 text-left">
                <span className={`block truncate text-sm ${c.id === currentId ? 'font-semibold' : ''}`}>
                  {c.pinned ? <Pin className="mr-1 inline size-3.5 align-[-2px] text-sand" aria-label="Pinned" /> : null}
                  {c.kind === 'daily' ? <CalendarDays className="mr-1 inline size-4 align-[-2px] text-accent-text" aria-label="Daily briefing" /> : null}
                  {c.title} <span className="text-xs font-normal text-muted">· {relativeTime(c.updatedAt)}</span>
                </span>
                {c.preview ? <span className="block truncate text-xs text-muted">{c.preview}</span> : null}
              </button>
              {!selecting ? (
                <div className="flex shrink-0">
                  <IconButton label={c.pinned ? `Unpin ${c.title}` : `Pin ${c.title}`} className="!size-9" onClick={() => void patch(c.id, { pinned: !c.pinned })}>
                    {c.pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
                  </IconButton>
                  <IconButton label={`Rename ${c.title}`} className="!size-9" onClick={() => rename(c)}><Pencil className="size-4" aria-hidden /></IconButton>
                  <a href={`/api/chat/conversations/${c.id}/export`} aria-label={`Export ${c.title}`} title="Export as Markdown" className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text">
                    <Download className="size-4" aria-hidden />
                  </a>
                  <IconButton label={archived ? `Restore ${c.title}` : `Archive ${c.title}`} className="!size-9" onClick={() => void bulk(archived ? 'unarchive' : 'archive', [c.id])}>
                    {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                  </IconButton>
                  <IconButton label={`Delete conversation ${c.title}`} className="!size-9" onClick={() => void bulk('delete', [c.id])}><Trash2 className="size-4" aria-hidden /></IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {selecting ? null : <p className="flex items-center gap-1 px-2 pt-1 text-[0.7rem] text-muted"><CheckSquare className="size-3" aria-hidden />Tip: “Select” lets you archive or delete several at once.</p>}
    </div>
  );
}
