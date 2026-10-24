import { DateTime, IANAZone } from 'luxon';

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

/** Parses "HH:mm" into hour/minute; throws on malformed input. */
export function parseHm(hm: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  if (!m) throw new Error(`Invalid time "${hm}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Local calendar date (yyyy-MM-dd) of an instant in a timezone. */
export function localDate(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate() ?? '';
}

/**
 * The UTC instant at which `hm` occurs on the local date of `instant` in `timezone`.
 * Luxon shifts non-existent local times (DST gaps) forward.
 */
export function atLocalTime(instant: Date, timezone: string, hm: string): Date {
  const { hour, minute } = parseHm(hm);
  return DateTime.fromJSDate(instant, { zone: timezone })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

/** True once the local wall-clock time `hm` has passed today in `timezone`. */
export function hasLocalTimePassed(now: Date, timezone: string, hm: string): boolean {
  return now.getTime() >= atLocalTime(now, timezone, hm).getTime();
}

export function startOfLocalDay(instant: Date, timezone: string): Date {
  return DateTime.fromJSDate(instant, { zone: timezone }).startOf('day').toJSDate();
}
