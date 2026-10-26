'use client';
import { useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import type { ParsedEntry, ParsedEvent } from '@friday/shared';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, ErrorNote, inputClass } from './ui';
import { EntryConfirm, type Draft } from './EntryConfirm';

/** Natural-language entry → deterministic preview → explicit confirm. */
export function QuickAdd({ onSaved, placeholder = 'e.g. Remind me to call the dentist tomorrow at 5 PM' }: { onSaved: () => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const parse = useAction(async (t: string) => {
    const res = await api.post<{ preview: ParsedEntry; event: ParsedEvent | null }>('/parse', { text: t });
    const p = res.preview;
    const ev = res.event;
    if (ev) return setDraft({ kind: 'event', title: ev.title, dueAt: ev.startAt, endAt: ev.endAt, priority: 'medium', recurrence: ev.recurrence, ambiguities: ev.ambiguities });
    setDraft({ kind: p.kind, title: p.title, dueAt: p.dueAt, priority: p.priority, recurrence: p.recurrence, tags: p.tags, ambiguities: p.ambiguities });
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void parse.run(text.trim());
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="quick-add">Add a task or reminder in plain words</label>
        <input id="quick-add" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={500} className={inputClass} />
        <Button type="submit" variant="panel" pending={parse.pending} disabled={!text.trim()}>
          <Sparkles className="size-4" aria-hidden /> <span className="hidden sm:inline">Preview</span>
        </Button>
      </form>
      {parse.error ? <ErrorNote message={parse.error} /> : null}
      {flash ? <p role="status" className="text-sm text-positive">{flash}</p> : null}
      {draft ? (
        <EntryConfirm
          key={JSON.stringify(draft)}
          draft={draft}
          onCancel={() => setDraft(null)}
          onDone={(msg) => {
            setDraft(null);
            setText('');
            setFlash(msg);
            onSaved();
          }}
        />
      ) : null}
    </div>
  );
}
