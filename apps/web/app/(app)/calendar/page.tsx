'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { AlarmClock, CalendarClock, ChevronLeft, ChevronRight, MapPin, Plus, Repeat, Trash2, Users, X } from 'lucide-react';
import type { CalendarEvent, CalendarRange, Recurrence } from '@/lib/types';
import { api, errorMessage } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { Button, Chip, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';
import { QuickAdd } from '@/components/QuickAdd';

type View = 'day' | 'week' | 'month' | 'agenda';
type Item =
  | { type: 'event'; id: string; title: string; start: Date; end: Date; allDay: boolean; ev: CalendarEvent }
  | { type: 'task'; id: string; title: string; start: Date; done: boolean; priority: string }
  | { type: 'reminder'; id: string; title: string; start: Date };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayKey = (d: Date) => startOfDay(d).toDateString();

function rangeFor(view: View, cursor: Date): [Date, Date] {
  if (view === 'day') return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === 'week') return [startOfWeek(cursor), addDays(startOfWeek(cursor), 7)];
  if (view === 'agenda') return [startOfDay(cursor), addDays(startOfDay(cursor), 14)];
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const from = startOfWeek(first);
  return [from, addDays(from, 42)];
}

function toItems(r: CalendarRange): Item[] {
  return [
    ...r.events.map((e): Item => ({ type: 'event', id: `${e.id}@${e.startAt}`, title: e.title, start: new Date(e.startAt), end: new Date(e.endAt), allDay: e.allDay, ev: e })),
    ...r.tasks.map((t): Item => ({ type: 'task', id: t.id, title: t.title, start: new Date(t.dueAt), done: t.status === 'done', priority: t.priority })),
    ...r.reminders.map((m): Item => ({ type: 'reminder', id: m.id, title: m.title, start: new Date(m.at) })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

const DOT: Record<Item['type'], string> = { event: 'bg-accent', task: 'bg-sand', reminder: 'bg-positive' };

function EventForm({ event, day, onClose, onSaved }: { event: CalendarEvent | null; day: Date | null; onClose: () => void; onSaved: (note?: string) => void }) {
  const nextHalfHour = new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000);
  const nineAm = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9) : null;
  const base = nineAm && nineAm > nextHalfHour ? nineAm : nextHalfHour;
  const [title, setTitle] = useState(event?.title ?? '');
  const [start, setStart] = useState(toLocalInput(event?.startAt ?? base.toISOString()));
  const [end, setEnd] = useState(toLocalInput(event?.endAt ?? new Date(base.getTime() + 3_600_000).toISOString()));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [attendees, setAttendees] = useState(event?.attendees.join(', ') ?? '');
  const [freq, setFreq] = useState<Recurrence['freq']>(event?.recurrence.freq ?? 'none');
  const [remind, setRemind] = useState('15');

  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const startAt = fromLocalInput(start);
    const endAt = fromLocalInput(end);
    if (!startAt || !endAt) throw new Error('Pick a start and end.');
    const body = {
      title,
      startAt,
      endAt,
      allDay,
      location: location.trim() || null,
      notes: notes.trim() || null,
      attendees: attendees.split(',').map((a) => a.trim()).filter(Boolean),
      recurrence: { freq },
    };
    const res = event
      ? await api.patch<{ conflicts: { title: string }[]; reminderSkipped?: boolean }>(`/events/${event.id}`, body)
      : await api.post<{ conflicts: { title: string }[]; reminderSkipped?: boolean }>('/events', { ...body, reminderMinutes: remind === 'none' ? null : Number(remind) });
    const extras = [res.conflicts.length ? `Heads up: overlaps ${res.conflicts.map((c) => c.title).join(', ')}.` : '', res.reminderSkipped ? 'No reminder was set because that time has already passed.' : ''].filter(Boolean);
    onSaved(['Saved.', ...extras].join(' '));
  });
  const remove = useAction(async () => {
    if (!event || !window.confirm(`Delete "${event.title}"${event.recurring ? ' and all its repeats' : ''}?`)) return;
    await api.del(`/events/${event.id}`);
    onSaved('Event deleted.');
  });

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={event ? 'Edit event' : 'New event'}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <form onSubmit={(e) => void save.run(e)} className="safe-bottom mira-pop absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-3xl border-t border-line bg-raised p-5 md:inset-y-0 md:left-auto md:right-0 md:w-[30rem] md:rounded-none md:border-l">
        <div className="flex items-center justify-between">
          <h2 className="display display-md">{event ? 'Edit event' : 'New event'}</h2>
          <IconButton type="button" label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className={inputClass} /></Field>
          <Field label="Ends"><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required className={inputClass} /></Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-5 accent-[var(--accent)]" /> All day</label>
        <Field label="Location or meeting link"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} className={inputClass} /></Field>
        <Field label="Attendees" hint="Comma separated"><input value={attendees} onChange={(e) => setAttendees(e.target.value)} className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Repeats">
            <select value={freq} onChange={(e) => setFreq(e.target.value as Recurrence['freq'])} className={inputClass}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          {!event ? (
            <Field label="Remind me" hint="Adds one linked reminder">
              <select value={remind} onChange={(e) => setRemind(e.target.value)} className={inputClass}>
                <option value="none">No reminder</option>
                <option value="0">At start</option>
                <option value="10">10 min before</option>
                <option value="15">15 min before</option>
                <option value="30">30 min before</option>
                <option value="60">1 hour before</option>
              </select>
            </Field>
          ) : null}
        </div>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} className={`${inputClass} py-2`} /></Field>
        {save.error || remove.error ? <ErrorNote message={(save.error ?? remove.error)!} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" pending={save.pending}>Save</Button>
          {event ? <Button type="button" variant="danger" onClick={() => void remove.run()} pending={remove.pending}><Trash2 className="size-4" aria-hidden /> Delete</Button> : null}
        </div>
      </form>
    </div>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [data, setData] = useState<CalendarRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; day: Date | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [from, to] = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<CalendarRange>(`/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => void load(), [load]);

  const items = useMemo(() => (data ? toItems(data) : []), [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) m.set(dayKey(it.start), [...(m.get(dayKey(it.start)) ?? []), it]);
    return m;
  }, [items]);

  const step = (dir: -1 | 1) =>
    setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === 'day' ? 1 : view === 'week' ? 7 : 14))));

  const completeTask = async (id: string, done: boolean) => {
    await api.patch(`/tasks/${id}`, { status: done ? 'done' : 'open' }).catch((e: unknown) => setError(errorMessage(e)));
    void load();
  };
  const postponeTask = async (id: string, start: Date) => {
    await api.patch(`/tasks/${id}`, { dueAt: addDays(start, 1).toISOString() }).catch((e: unknown) => setError(errorMessage(e)));
    setNote('Moved to tomorrow.');
    void load();
  };
  // Drag-and-drop rescheduling (one-off events and tasks), keeping the time of day.
  const onDrop = async (e: DragEvent, day: Date) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const it = items.find((x) => x.id === raw);
    if (!it || sameDay(it.start, day)) return;
    const shift = startOfDay(day).getTime() - startOfDay(it.start).getTime();
    try {
      if (it.type === 'event') await api.patch(`/events/${it.ev.id}`, { startAt: new Date(it.start.getTime() + shift).toISOString() });
      else if (it.type === 'task') await api.patch(`/tasks/${it.id}`, { dueAt: new Date(it.start.getTime() + shift).toISOString() });
      setNote(`Moved “${it.title}”.`);
    } catch (err) {
      setError(errorMessage(err));
    }
    void load();
  };

  const label =
    view === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'day'
        ? cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
        : `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const row = (it: Item, compact = false) => {
    const draggable = (it.type === 'event' && !it.ev.recurring) || it.type === 'task';
    const common = `flex min-w-0 items-center gap-1.5 rounded-lg text-left ${compact ? 'px-1.5 py-0.5 text-[0.72rem]' : 'px-2 py-1.5 text-sm'} hover:bg-surface`;
    const when = it.type === 'event' && it.allDay ? 'All day' : time(it.start);
    const drag = draggable ? { draggable: true, onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/plain', it.id) } : {};
    if (it.type === 'event') {
      return (
        <button key={it.id} type="button" {...drag} onClick={() => setEditing({ event: it.ev, day: null })} className={`${common} w-full`} aria-label={`Event: ${it.title}, ${when}`}>
          <span className={`size-2 shrink-0 rounded-full ${DOT.event}`} aria-hidden />
          <span className="shrink-0 text-muted">{when}</span>
          <span className="truncate font-medium">{it.title}</span>
          {!compact && it.ev.recurring ? <Repeat className="size-3 shrink-0 text-muted" aria-label="Repeats" /> : null}
          {!compact && it.ev.location ? <span className="hidden items-center gap-1 truncate text-xs text-muted sm:flex"><MapPin className="size-3" aria-hidden />{it.ev.location}</span> : null}
          {!compact && it.ev.attendees.length ? <span className="hidden items-center gap-1 text-xs text-muted sm:flex"><Users className="size-3" aria-hidden />{it.ev.attendees.length}</span> : null}
        </button>
      );
    }
    if (it.type === 'task') {
      return (
        <div key={it.id} {...drag} className={common}>
          <input type="checkbox" checked={it.done} onChange={(e) => void completeTask(it.id, e.target.checked)} aria-label={`Complete ${it.title}`} className="size-4 shrink-0 accent-[var(--accent)]" />
          <span className="shrink-0 text-muted">{time(it.start)}</span>
          <span className={`truncate ${it.done ? 'text-muted line-through' : ''}`}>{it.title}</span>
          {!compact && !it.done ? <button type="button" onClick={() => void postponeTask(it.id, it.start)} className="ml-auto shrink-0 text-xs text-muted underline">Postpone</button> : null}
        </div>
      );
    }
    return (
      <Link key={it.id} href="/reminders" className={common}>
        <AlarmClock className="size-3.5 shrink-0 text-positive" aria-hidden />
        <span className="shrink-0 text-muted">{time(it.start)}</span>
        <span className="truncate">{it.title}</span>
      </Link>
    );
  };

  const today = new Date();
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={`Events, due tasks and reminders in one place. Times in ${tzName}.`}
        actions={<Button variant="primary" onClick={() => setEditing({ event: null, day: cursor })}><Plus className="size-4" aria-hidden /> New event</Button>}
      />
      <div className="mb-4"><QuickAdd onSaved={() => void load()} placeholder="e.g. Meeting with Raj tomorrow at 3pm for 30 min" /></div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <IconButton label="Previous" onClick={() => step(-1)}><ChevronLeft className="size-5" /></IconButton>
          <Button variant="ghost" onClick={() => setCursor(new Date())}>Today</Button>
          <IconButton label="Next" onClick={() => step(1)}><ChevronRight className="size-5" /></IconButton>
        </div>
        <h2 className="display min-w-0 flex-1 text-xl" aria-live="polite">{label}</h2>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Calendar view">
          {(['day', 'week', 'month', 'agenda'] as const).map((v) => (
            <Chip key={v} active={view === v} onClick={() => setView(v)}>{v[0]!.toUpperCase() + v.slice(1)}</Chip>
          ))}
        </div>
      </div>
      {note ? <p role="status" className="mb-2 text-sm text-positive">{note}</p> : null}
      {error ? <div className="mb-3"><ErrorNote message={error} onRetry={() => void load()} /></div> : null}
      {loading && !data ? <Loading label="Loading calendar" /> : null}
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="flex items-center gap-1"><span className={`size-2 rounded-full ${DOT.event}`} />Events</span>
        <span className="flex items-center gap-1"><span className={`size-2 rounded-full ${DOT.task}`} />Tasks due</span>
        <span className="flex items-center gap-1"><span className={`size-2 rounded-full ${DOT.reminder}`} />Reminders</span>
      </div>

      {view === 'month' ? (
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-surface text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => addDays(from, i)).map((d) => {
              const list = byDay.get(dayKey(d)) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div
                  key={d.toISOString()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void onDrop(e, d)}
                  className={`min-h-20 min-w-0 border-b border-r border-line p-1 sm:min-h-28 ${inMonth ? '' : 'bg-surface/40 text-muted'}`}
                >
                  <button type="button" onClick={() => { setCursor(d); setView('day'); }} className={`mb-0.5 grid size-7 place-items-center rounded-full text-xs ${sameDay(d, today) ? 'bg-accent font-bold text-on-accent' : 'hover:bg-raised'}`} aria-label={`Open ${d.toDateString()}`}>
                    {d.getDate()}
                  </button>
                  <div className="hidden flex-col sm:flex">
                    {list.slice(0, 3).map((it) => row(it, true))}
                    {list.length > 3 ? <span className="px-1 text-[0.7rem] text-muted">+{list.length - 3} more</span> : null}
                  </div>
                  {list.length ? <div className="flex gap-0.5 px-1 sm:hidden">{list.slice(0, 4).map((it) => <span key={it.id} className={`size-1.5 rounded-full ${DOT[it.type]}`} />)}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === 'week' ? (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(dayKey(d)) ?? [];
            return (
              <section key={d.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => void onDrop(e, d)} className={`min-w-0 rounded-2xl border p-2 ${sameDay(d, today) ? 'border-accent/60' : 'border-line'} bg-surface`} aria-label={d.toDateString()}>
                <button type="button" onClick={() => setEditing({ event: null, day: d })} className="mb-1 flex w-full items-baseline justify-between px-1 text-left" title="Add an event this day">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className={`display text-xl ${sameDay(d, today) ? 'text-accent-text' : ''}`}>{d.getDate()}</span>
                </button>
                <div className="flex flex-col">{list.length ? list.map((it) => row(it, true)) : <p className="px-1 py-2 text-xs text-muted">Free</p>}</div>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === 'day' || view === 'agenda' ? (
        <div className="flex flex-col gap-3">
          {(view === 'day' ? [startOfDay(cursor)] : Array.from({ length: 14 }, (_, i) => addDays(from, i))).map((d) => {
            const list = byDay.get(dayKey(d)) ?? [];
            if (view === 'agenda' && !list.length) return null;
            return (
              <section key={d.toISOString()} className="rounded-2xl border border-line bg-surface p-3" aria-label={d.toDateString()}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="size-4 text-muted" aria-hidden />
                  {d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {sameDay(d, today) ? <span className="text-xs text-accent-text">Today</span> : null}
                </h3>
                {list.length ? <div className="flex flex-col">{list.map((it) => row(it))}</div> : <p className="text-sm text-muted">Nothing scheduled.</p>}
              </section>
            );
          })}
          {view === 'agenda' && !items.length && !loading ? <p className="text-sm text-muted">Nothing in the next two weeks.</p> : null}
        </div>
      ) : null}

      {editing ? (
        <EventForm
          event={editing.event}
          day={editing.day}
          onClose={() => setEditing(null)}
          onSaved={(n) => {
            setEditing(null);
            setNote(n ?? null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
