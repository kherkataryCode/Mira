'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Bold, Code, Download, Eye, Heading1, Heading2, Italic, Link2, List, ListOrdered, Minus, PenLine, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import type { Note } from '@/lib/types';
import { api } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { Art } from '@/components/Art';
import { Markdown } from '@/components/Markdown';
import { Button, Empty, ErrorNote, IconButton, Loading, PageHeader, Skeleton, inputClass } from '@/components/ui';

const TEMPLATES: { id: string; label: string; title: string; body: string }[] = [
  { id: 'blank', label: 'Blank', title: '', body: '' },
  {
    id: 'study',
    label: 'Study notes',
    title: 'Study notes: ',
    body: '# Topic\n\n## Key idea\n\nOne or two sentences in my own words.\n\n## How it works\n\n- Step one\n- Step two\n\n## Example\n\n## Questions to revisit\n\n1. \n',
  },
  {
    id: 'incident',
    label: 'Incident report',
    title: 'Incident: ',
    body: '# Incident summary\n\n**Date:** \n**Severity:** \n**Status:** Investigating\n\n## What happened\n\n## Impact\n\n- Systems affected:\n- Users affected:\n\n## Timeline\n\n1. \n\n## Actions taken\n\n- \n\n## Follow-ups\n\n- [ ] \n',
  },
  {
    id: 'meeting',
    label: 'Meeting notes',
    title: 'Meeting: ',
    body: '# Meeting\n\n**Attendees:** \n\n## Agenda\n\n1. \n\n## Notes\n\n## Decisions\n\n- \n\n## Action items\n\n- \n',
  },
];

function slug(s: string) {
  return (s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'note').slice(0, 60);
}

function downloadMarkdown(title: string, body: string) {
  const text = body.trimStart().startsWith('#') ? body : `# ${title}\n\n${body}`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(title)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain-text preview for cards: drop markdown syntax. */
function plain(md: string) {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`]|\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*[-\d.]+\s/gm, '• ').trim();
}

type Action = { label: string; icon: ReactNode; apply: (sel: string) => { text: string; block?: boolean } };
const ACTIONS: Action[] = [
  { label: 'Heading 1', icon: <Heading1 className="size-4" />, apply: (s) => ({ text: `# ${s || 'Heading'}`, block: true }) },
  { label: 'Heading 2', icon: <Heading2 className="size-4" />, apply: (s) => ({ text: `## ${s || 'Section'}`, block: true }) },
  { label: 'Bold', icon: <Bold className="size-4" />, apply: (s) => ({ text: `**${s || 'bold'}**` }) },
  { label: 'Italic', icon: <Italic className="size-4" />, apply: (s) => ({ text: `_${s || 'italic'}_` }) },
  { label: 'Bulleted list', icon: <List className="size-4" />, apply: (s) => ({ text: (s || 'Item').split('\n').map((l) => `- ${l}`).join('\n'), block: true }) },
  { label: 'Numbered list', icon: <ListOrdered className="size-4" />, apply: (s) => ({ text: (s || 'Item').split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'), block: true }) },
  { label: 'Code block', icon: <Code className="size-4" />, apply: (s) => ({ text: `\`\`\`\n${s || 'code'}\n\`\`\``, block: true }) },
  { label: 'Link', icon: <Link2 className="size-4" />, apply: (s) => ({ text: `[${s || 'link text'}](https://)` }) },
  { label: 'Divider', icon: <Minus className="size-4" />, apply: () => ({ text: '---', block: true }) },
];

function DocEditor({ note, initial, onClose, onSaved }: { note: Note | null; initial?: { title: string; body: string }; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(note?.title ?? initial?.title ?? '');
  const [body, setBody] = useState(note?.body ?? initial?.body ?? '');
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (a: Action) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const { text, block } = a.apply(body.slice(start, end));
    const before = body.slice(0, start);
    const pre = block && before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const post = block ? '\n\n' : '';
    const next = `${before}${pre}${text}${post}${body.slice(end)}`;
    setBody(next.slice(0, 20000));
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + pre.length + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const save = useAction(async (e?: FormEvent) => {
    e?.preventDefault();
    const payload = { title: title.trim() || 'Untitled document', body, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), pinned };
    if (note) await api.patch(`/notes/${note.id}`, payload);
    else await api.post('/notes', payload);
    onSaved();
    onClose();
  });
  const remove = useAction(async () => {
    if (!note || !window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    await api.del(`/notes/${note.id}`);
    onSaved();
    onClose();
  });

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const preview = (
    <div className="min-h-[40dvh] rounded-2xl border border-line bg-surface p-4 text-sm">
      {body.trim() ? <Markdown text={body} /> : <p className="text-muted">Nothing to preview yet.</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={note ? 'Edit document' : 'New document'}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={(e) => void save.run(e)}
        className="safe-bottom mira-pop absolute inset-0 flex flex-col gap-3 overflow-y-auto bg-raised p-4 sm:inset-4 sm:rounded-3xl sm:border sm:border-line sm:p-5 lg:inset-x-[8%]"
      >
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Untitled document"
            aria-label="Title"
            className="display min-w-0 flex-1 bg-transparent text-2xl outline-none placeholder:text-muted/60 sm:text-3xl"
          />
          <IconButton type="button" label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-surface p-1">
          {ACTIONS.map((a) => (
            <IconButton key={a.label} type="button" label={a.label} className="!size-9" onClick={() => { setMode('write'); apply(a); }}>
              {a.icon}
            </IconButton>
          ))}
          <div className="flex-1" />
          <div className="flex rounded-full bg-raised p-0.5 lg:hidden" role="tablist" aria-label="Editor mode">
            {(['write', 'preview'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold ${mode === m ? 'bg-panel text-on-panel' : 'text-muted'}`}>
                {m === 'write' ? <PenLine className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} {m === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={20000}
            aria-label="Document (Markdown)"
            placeholder={'# Start writing\n\nUse the toolbar or Markdown: **bold**, _italic_, - lists, ## headings'}
            className={`${inputClass} min-h-[40dvh] flex-1 py-3 font-mono text-[15px] leading-relaxed ${mode === 'preview' ? 'hidden lg:block' : ''}`}
          />
          <div className={mode === 'write' ? 'hidden lg:block' : ''}>{preview}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" aria-label="Tags" className={`${inputClass} !min-h-10 max-w-xs`} />
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-5 accent-[var(--accent)]" /> Pin
          </label>
          <span className="text-xs text-muted">{words} words · {body.length.toLocaleString()}/20,000</span>
        </div>
        {save.error || remove.error ? <ErrorNote message={(save.error ?? remove.error)!} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" pending={save.pending}>Save</Button>
          <Button type="button" onClick={() => downloadMarkdown(title || 'Untitled document', body)} disabled={!body.trim()}>
            <Download className="size-4" aria-hidden /> Download .md
          </Button>
          {note ? <Button type="button" variant="danger" onClick={() => void remove.run()} pending={remove.pending}><Trash2 className="size-4" aria-hidden /> Delete</Button> : null}
        </div>
      </form>
    </div>
  );
}

export default function NotesPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editing, setEditing] = useState<Note | { template: string } | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useResource<{ notes: Note[] }>(`/notes${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`);

  const start = (id: string) => {
    setMenu(false);
    setEditing({ template: id });
  };
  const draft = editing && 'template' in editing ? TEMPLATES.find((t) => t.id === editing.template)! : null;

  return (
    <div>
      <PageHeader
        title="Notes & docs"
        subtitle="Write simple Markdown documents. Preview them, keep them private, download them as .md."
        actions={
          <div className="relative">
            <Button variant="primary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><Plus className="size-4" aria-hidden /> New document</Button>
            {menu ? (
              <ul className="mira-pop absolute right-0 top-12 z-20 w-52 rounded-2xl border border-line bg-raised p-1 shadow-xl">
                {TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => start(t.id)} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-surface">{t.label}</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        }
      />
      <label className="relative mb-4 block">
        <span className="sr-only">Search notes</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className={`${inputClass} pl-9`} />
      </label>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 !rounded-3xl" />)}</div>
      ) : null}
      {loading && data ? <Loading label="Searching" /> : null}
      {data && data.notes.length === 0 ? (
        <Empty
          title={debounced ? 'No matching notes' : 'No documents yet'}
          body={debounced ? undefined : 'Start from a template: study notes, an incident report or meeting notes.'}
          action={debounced ? undefined : <Button onClick={() => start('study')}>Start with study notes</Button>}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.notes.map((n, i) => (
          <article key={n.id} className={`tile rise rise-${(i % 4) + 1} flex flex-col overflow-hidden rounded-3xl border border-line bg-surface`}>
            <button type="button" onClick={() => setEditing(n)} className="flex flex-1 flex-col text-left">
              <div className="relative h-16 shrink-0"><Art seed={n.title.length + i * 3} className="h-full w-full" /></div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start gap-2">
                  <p className="display flex-1 text-lg leading-tight">{n.title}</p>
                  {n.pinned ? <Pin className="size-4 text-sand" aria-label="Pinned" /> : null}
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-muted">{plain(n.body) || 'Empty document'}</p>
                <p className="mt-auto pt-3 text-xs text-muted">{n.tags.map((t) => `#${t}`).join(' ')} {n.tags.length ? '·' : ''} {relativeTime(n.updatedAt)}</p>
              </div>
            </button>
            <div className="flex border-t border-line">
              <button type="button" onClick={() => downloadMarkdown(n.title, n.body)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 text-xs font-semibold text-muted hover:text-text">
                <Download className="size-4" aria-hidden /> Download .md
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing ? (
        <DocEditor
          key={'id' in editing ? editing.id : `new-${draft?.id}`}
          note={'id' in editing ? editing : null}
          initial={draft ?? undefined}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}
