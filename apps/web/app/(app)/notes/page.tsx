'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Pin, Plus, Search, Trash2, X } from 'lucide-react';
import type { Note } from '@/lib/types';
import { api } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { Button, Card, Empty, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';

function NoteEditor({ note, onClose, onSaved }: { note: Note | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const payload = { title, body, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), pinned };
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
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={note ? 'Edit note' : 'New note'}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <form onSubmit={(e) => void save.run(e)} className="safe-bottom absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl border-t border-line bg-raised p-5 md:inset-y-0 md:left-auto md:right-0 md:w-[32rem] md:rounded-none md:border-l">
        <div className="flex items-center justify-between">
          <h2 className="display display-md">{note ? 'Edit note' : 'New note'}</h2>
          <IconButton type="button" label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={inputClass} /></Field>
        <Field label="Note"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} maxLength={20000} className={`${inputClass} py-2`} /></Field>
        <Field label="Tags" hint="Comma separated"><input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-5 accent-[var(--accent)]" /> Pin to top
        </label>
        {save.error || remove.error ? <ErrorNote message={(save.error ?? remove.error)!} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" pending={save.pending}>Save</Button>
          {note ? <Button type="button" variant="danger" onClick={() => void remove.run()} pending={remove.pending}><Trash2 className="size-4" aria-hidden /> Delete</Button> : null}
        </div>
      </form>
    </div>
  );
}

export default function NotesPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useResource<{ notes: Note[] }>(`/notes${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`);

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Your personal knowledge — private, searchable, exportable."
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> New note</Button>}
      />
      <label className="relative mb-4 block">
        <span className="sr-only">Search notes</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className={`${inputClass} pl-9`} />
      </label>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.notes.length === 0 ? <Empty title={debounced ? 'No matching notes' : 'No notes yet'} body={debounced ? undefined : 'Capture ideas, checklists and things to remember.'} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.notes.map((n) => (
          <button key={n.id} onClick={() => setEditing(n)} className="text-left">
            <Card className="h-full transition hover:border-muted">
              <div className="flex items-start gap-2">
                <p className="display flex-1 text-lg">{n.title}</p>
                {n.pinned ? <Pin className="size-4 text-sand" aria-label="Pinned" /> : null}
              </div>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{n.body || 'Empty note'}</p>
              <p className="mt-3 text-xs text-muted">{n.tags.map((t) => `#${t}`).join(' ')} {n.tags.length ? '·' : ''} {relativeTime(n.updatedAt)}</p>
            </Card>
          </button>
        ))}
      </div>
      {editing ? <NoteEditor note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </div>
  );
}
