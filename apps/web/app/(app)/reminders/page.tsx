'use client';
import { useState, type FormEvent } from 'react';
import { BellRing, Check, Clock, Info, Trash2 } from 'lucide-react';
import type { Recurrence } from '@friday/shared';
import type { Reminder } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { fmtDateTime, fromLocalInput, relativeTime } from '@/lib/format';
import { Badge, Button, Card, Chip, Empty, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';
import { useSession } from '@/components/AppShell';

const REPEAT: Record<string, Recurrence> = {
  none: { freq: 'none' },
  daily: { freq: 'daily' },
  weekdays: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] },
  weekly: { freq: 'weekly' },
  monthly: { freq: 'monthly' },
};

function DeliveryBadge({ r }: { r: Reminder }) {
  if (r.status === 'completed') return <Badge tone="positive">Completed</Badge>;
  if (r.status === 'dismissed') return <Badge>Dismissed</Badge>;
  if (r.deliveryState === 'delivered') return <Badge tone="positive">Delivered</Badge>;
  return <Badge tone="demo">Scheduled</Badge>;
}

function ReminderRow({ r, timezone, onChange }: { r: Reminder; timezone?: string; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const ld = r.lastDelivery;
  return (
    <li className="flex flex-col gap-2 border-b border-line/70 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-green/30 text-positive"><BellRing className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-muted">
            {fmtDateTime(r.nextOccurrenceAt ?? r.anchorAt, timezone)} · {r.recurrenceLabel ?? 'Once'}
            {r.advanceMinutes ? ` · ${r.advanceMinutes} min early` : ''}
          </p>
          {r.nextFireAt && r.nextOccurrenceAt && new Date(r.nextFireAt).getTime() > new Date(r.nextOccurrenceAt).getTime() ? (
            <p className="text-xs text-muted">Snoozed until {fmtDateTime(r.nextFireAt, timezone)}</p>
          ) : null}
          {ld ? (
            <p className="text-xs text-muted">
              Last delivery: {ld.channel === 'push' ? 'push' : 'in-app'} {ld.status} {relativeTime(ld.createdAt)}{ld.error ? ` — ${ld.error}` : ''}
            </p>
          ) : null}
        </div>
        <DeliveryBadge r={r} />
      </div>
      {r.status === 'active' ? (
        <div className="flex flex-wrap gap-2 pl-13">
          <Button className="!min-h-10" disabled={busy} onClick={() => void act(() => api.post(`/reminders/${r.id}/snooze`, { minutes: 10 }))}><Clock className="size-4" aria-hidden /> 10 min</Button>
          <Button className="!min-h-10" disabled={busy} onClick={() => void act(() => api.post(`/reminders/${r.id}/snooze`, { minutes: 60 }))}>1 hour</Button>
          <Button className="!min-h-10" disabled={busy} onClick={() => void act(() => api.post(`/reminders/${r.id}/dismiss`))}>Dismiss</Button>
          <Button className="!min-h-10" disabled={busy} onClick={() => void act(() => api.post(`/reminders/${r.id}/complete`))}><Check className="size-4" aria-hidden /> Complete</Button>
          <IconButton
            label={`Delete ${r.title}`}
            disabled={busy}
            onClick={() => window.confirm(`Delete reminder "${r.title}"?`) && void act(() => api.del(`/reminders/${r.id}`))}
          >
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </div>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
    </li>
  );
}

export default function RemindersPage() {
  const { prefs } = useSession();
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading, reload } = useResource<{ reminders: Reminder[] }>(showAll ? '/reminders?status=all' : '/reminders');
  const [title, setTitle] = useState('');
  const [at, setAt] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [advance, setAdvance] = useState(0);
  const create = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const remindAt = fromLocalInput(at);
    if (!remindAt) throw new Error('Pick a date and time.');
    await api.post('/reminders', { title, remindAt, recurrence: REPEAT[repeat], advanceMinutes: advance });
    setTitle('');
    setAt('');
    setRepeat('none');
    setAdvance(0);
    reload();
  });

  return (
    <div>
      <PageHeader title="Reminders" subtitle={`Timezone: ${prefs?.timezone ?? '…'} — change it in Settings.`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-3 flex gap-2">
            <Chip active={!showAll} onClick={() => setShowAll(false)}>Active</Chip>
            <Chip active={showAll} onClick={() => setShowAll(true)}>All</Chip>
          </div>
          {error ? <ErrorNote message={error} onRetry={reload} /> : null}
          {loading && !data ? <Loading /> : null}
          {data && data.reminders.length === 0 ? <Empty title="No reminders" body="Create one here, or say “Remind me to…” in Chat." /> : null}
          {data && data.reminders.length > 0 ? (
            <Card>
              <ul>{data.reminders.map((r) => <ReminderRow key={r.id} r={r} timezone={prefs?.timezone} onChange={reload} />)}</ul>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-base font-semibold">New reminder</h2>
            <form onSubmit={(e) => void create.run(e)} className="flex flex-col gap-3">
              <Field label="What"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={inputClass} /></Field>
              <Field label="When" hint="Device local time"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required className={inputClass} /></Field>
              <Field label="Repeat">
                <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass}>
                  <option value="none">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Notify early">
                <select value={advance} onChange={(e) => setAdvance(Number(e.target.value))} className={inputClass}>
                  <option value={0}>At the time</option>
                  <option value={5}>5 minutes before</option>
                  <option value={15}>15 minutes before</option>
                  <option value={60}>1 hour before</option>
                </select>
              </Field>
              {create.error ? <ErrorNote message={create.error} /> : null}
              <Button type="submit" variant="primary" pending={create.pending}>Create reminder</Button>
            </form>
          </Card>
          <Card>
            <p className="flex items-center gap-2 text-sm font-semibold"><Info className="size-4" aria-hidden /> How delivery works</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
              <li>The background worker checks for due reminders every minute and records each delivery — reminders don&apos;t depend on an AI model.</li>
              <li>On the web, delivered reminders appear in the bell inbox. Phone alerts come from the Mira iOS app once notifications are allowed and server push is configured.</li>
              <li>Delivery can be late if the worker or host is asleep (e.g. free hosting tiers). Status above shows what actually happened.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
