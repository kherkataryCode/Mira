export function fmtTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function fmtDay(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tz = timeZone;
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(x);
  const today = key(new Date());
  const tomorrow = key(new Date(Date.now() + 86_400_000));
  const yesterday = key(new Date(Date.now() - 86_400_000));
  const k = key(d);
  if (k === today) return 'Today';
  if (k === tomorrow) return 'Tomorrow';
  if (k === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(d);
}

export function fmtDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return 'No date';
  return `${fmtDay(iso, timeZone)} · ${fmtTime(iso, timeZone)}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  const days = Math.round(hours / 24);
  return days > 0 ? `${days}d ago` : `in ${-days}d`;
}

/** Converts an ISO instant to the value format of <input type="datetime-local">. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
