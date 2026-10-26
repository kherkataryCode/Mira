'use client';
import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { describeRecurrence, type Recurrence } from '@friday/shared';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { Button, ErrorNote, Field, inputClass } from './ui';

export interface Draft {
  kind: 'task' | 'reminder' | 'event';
  title: string;
  dueAt: string | null;
  /** Events only. */
  endAt?: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recurrence: Recurrence;
  tags?: string[];
  ambiguities: string[];
}

/**
 * Editable preview of a parsed task/reminder. Nothing is saved until the user presses
 * Confirm; ambiguous dates/times are called out so the user can fix them first.
 */
export function EntryConfirm({ draft, onDone, onCancel, compact }: { draft: Draft; onDone: (msg: string) => void; onCancel?: () => void; compact?: boolean }) {
  const [kind, setKind] = useState(draft.kind);
  const [title, setTitle] = useState(draft.title);
  const [when, setWhen] = useState(toLocalInput(draft.dueAt));
  const [until, setUntil] = useState(toLocalInput(draft.endAt ?? (draft.dueAt ? new Date(new Date(draft.dueAt).getTime() + 3_600_000).toISOString() : null)));
  const [priority, setPriority] = useState(draft.priority);
  const [acknowledged, setAcknowledged] = useState(draft.ambiguities.length === 0);
  const save = useAction(async () => {
    const at = fromLocalInput(when);
    if (kind === 'event') {
      const end = fromLocalInput(until);
      if (!at || !end) throw new Error('Pick a start and end time for the event.');
      const res = await api.post<{ conflicts: { title: string }[] }>('/events', { title, startAt: at, endAt: end, recurrence: draft.recurrence });
      onDone(`Event added to your calendar: ${title}${res.conflicts.length ? ` — note: overlaps ${res.conflicts.map((c) => c.title).join(', ')}` : ''}`);
      return;
    }
    if (kind === 'reminder') {
      if (!at) throw new Error('Pick a date and time for the reminder.');
      await api.post('/reminders', { title, remindAt: at, recurrence: draft.recurrence });
      onDone(`Reminder set: ${title}`);
    } else {
      await api.post('/tasks', { title, dueAt: at, priority, tags: draft.tags ?? [], recurrence: draft.recurrence });
      onDone(`Task added: ${title}`);
    }
  });

  return (
    <div className={`rounded-2xl border border-line bg-raised ${compact ? 'p-3' : 'p-4'} text-sm`}>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Type">
        {(['task', 'reminder', 'event'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-11 rounded-full border px-4 capitalize ${kind === k ? 'border-sand bg-sand font-semibold text-on-panel' : 'border-line text-muted'}`}
          >
            {k}
          </button>
        ))}
        {draft.recurrence.freq !== 'none' ? <span className="text-xs text-muted">Repeats: {describeRecurrence(draft.recurrence)}</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />
        </Field>
        <Field label={kind === 'reminder' ? 'Remind me at' : kind === 'event' ? 'Starts' : 'Due'} hint="Shown in this device's local time">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
        {kind === 'event' ? (
          <Field label="Ends">
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
          </Field>
        ) : null}
        {kind === 'task' ? (
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Draft['priority'])} className={inputClass}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        ) : null}
      </div>
      {draft.ambiguities.length ? (
        <div className="mt-3 rounded-xl border border-sand/40 bg-sand/10 p-3">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-sand" aria-hidden /> Please check
          </p>
          <ul className="ml-6 mt-1 list-disc text-muted">
            {draft.ambiguities.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <label className="mt-2 flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            The details above are correct
          </label>
        </div>
      ) : null}
      {save.error ? <div className="mt-3"><ErrorNote message={save.error} /></div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void save.run()} pending={save.pending} disabled={!acknowledged || !title.trim()}>
          <Check className="size-4" aria-hidden /> Confirm
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            <X className="size-4" aria-hidden /> Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
