'use client';
import { useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { describeRecurrence } from '@friday/shared';
import type { Task } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { IconButton } from './ui';

const PRIORITY_DOT: Record<Task['priority'], string> = {
  urgent: 'bg-vermilion',
  high: 'bg-vermilion/80',
  medium: 'bg-sand',
  low: 'bg-sage',
};

export function TaskItem({ task, timezone, onChange, onOpen, showDelete }: { task: Task; timezone?: string; onChange: () => void; onOpen?: (t: Task) => void; showDelete?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = task.status === 'done';
  const overdue = !done && task.dueAt && new Date(task.dueAt).getTime() < Date.now();

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/tasks/${task.id}`, { status: done ? 'open' : 'done' });
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.del(`/tasks/${task.id}`);
      onChange();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <li className="group flex items-start gap-1 border-b border-line/70 py-1 last:border-0">
      <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={toggle}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className="size-5 cursor-pointer rounded accent-[var(--accent)]"
        />
      </label>
      <button type="button" onClick={() => onOpen?.(task)} className="min-h-11 min-w-0 flex-1 py-2 text-left" disabled={!onOpen}>
        <p className={`truncate text-sm font-medium ${done ? 'text-muted line-through' : ''}`}>{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className={`inline-block size-2 rounded-full ${PRIORITY_DOT[task.priority]}`} aria-hidden />
          <span className={overdue ? 'text-accent-text' : ''}>{task.dueAt ? fmtDateTime(task.dueAt, timezone) : 'No date'}</span>
          {task.priority === 'high' || task.priority === 'urgent' ? <span className="text-accent-text capitalize">{task.priority}</span> : null}
          {task.recurrence.freq !== 'none' ? (
            <span className="inline-flex items-center gap-1"><Repeat className="size-3" aria-hidden />{describeRecurrence(task.recurrence)}</span>
          ) : null}
          {task.tags.map((t) => <span key={t}>#{t}</span>)}
        </p>
        {error ? <p role="alert" className="text-xs text-accent-text">{error}</p> : null}
      </button>
      {showDelete ? (
        <IconButton label={`Delete ${task.title}`} onClick={remove} disabled={busy}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      ) : null}
    </li>
  );
}
