import { DateTime } from 'luxon';
import type { Recurrence } from './schemas.js';

/**
 * Next occurrence strictly after `after`, computed in local wall-clock time so
 * a daily 09:00 reminder stays at 09:00 across DST changes.
 * `anchor` is the first scheduled occurrence and supplies the time of day.
 */
export function nextOccurrence(
  anchor: Date,
  recurrence: Recurrence,
  timezone: string,
  after: Date,
): Date | null {
  if (recurrence.freq === 'none') return null;
  const base = DateTime.fromJSDate(anchor, { zone: timezone });
  const afterMs = after.getTime();
  const interval = Math.max(1, recurrence.interval ?? 1);
  const until = recurrence.until ? new Date(recurrence.until).getTime() : null;

  const withinUntil = (d: DateTime) => until === null || d.toMillis() <= until;

  if (recurrence.freq === 'weekly' && recurrence.byWeekday && recurrence.byWeekday.length > 0) {
    const days = new Set(recurrence.byWeekday);
    // Walk day by day from the later of anchor/after; bounded to ~2 years.
    let cursor = DateTime.max(base, DateTime.fromJSDate(after, { zone: timezone }).set({
      hour: base.hour,
      minute: base.minute,
      second: 0,
      millisecond: 0,
    }));
    for (let i = 0; i < 7 * 105; i++) {
      const weeksFromAnchor = Math.floor(cursor.startOf('week').diff(base.startOf('week'), 'weeks').weeks);
      if (
        cursor.toMillis() > afterMs &&
        days.has(cursor.weekday) &&
        weeksFromAnchor % interval === 0
      ) {
        return withinUntil(cursor) ? cursor.toJSDate() : null;
      }
      cursor = cursor.plus({ days: 1 });
    }
    return null;
  }

  const unit = recurrence.freq === 'daily' ? 'days' : recurrence.freq === 'weekly' ? 'weeks' : 'months';
  if (base.toMillis() > afterMs) return withinUntil(base) ? base.toJSDate() : null;
  // Jump close to the target, then step; avoids long loops for old anchors.
  const elapsed = DateTime.fromJSDate(after, { zone: timezone }).diff(base, unit).get(unit);
  let n = Math.max(0, Math.floor(elapsed / interval) - 1);
  for (let i = 0; i < 1000; i++, n++) {
    const candidate = base.plus({ [unit]: n * interval });
    if (candidate.toMillis() > afterMs) return withinUntil(candidate) ? candidate.toJSDate() : null;
  }
  return null;
}

export function describeRecurrence(r: Recurrence): string {
  if (r.freq === 'none') return 'Once';
  const every = (r.interval ?? 1) > 1 ? `Every ${r.interval} ` : 'Every ';
  if (r.freq === 'daily') return (r.interval ?? 1) > 1 ? `${every}days` : 'Daily';
  if (r.freq === 'monthly') return (r.interval ?? 1) > 1 ? `${every}months` : 'Monthly';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (r.byWeekday?.length) {
    const sorted = [...r.byWeekday].sort((a, b) => a - b);
    if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
    return `${(r.interval ?? 1) > 1 ? every + 'weeks on ' : 'Weekly on '}${sorted.map((d) => names[d - 1]).join(', ')}`;
  }
  return (r.interval ?? 1) > 1 ? `${every}weeks` : 'Weekly';
}
