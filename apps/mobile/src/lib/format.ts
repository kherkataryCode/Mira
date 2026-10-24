export function fmtDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(d);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(d);
  return `${day} · ${time}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  const days = Math.round(hours / 24);
  return days > 0 ? `${days}d ago` : `in ${-days}d`;
}

export function recurrenceLabel(r: { freq: string; byWeekday?: number[] | undefined }): string {
  if (r.freq === 'none') return 'Once';
  if (r.freq === 'weekly' && r.byWeekday?.length === 5) return 'Weekdays';
  return r.freq[0]!.toUpperCase() + r.freq.slice(1);
}
