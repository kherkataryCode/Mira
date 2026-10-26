import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import type { Priority, Recurrence } from './schemas.js';

export interface ParsedEntry {
  /** "reminder" when the text explicitly asks to be reminded, otherwise "task". */
  kind: 'task' | 'reminder';
  title: string;
  /** ISO instant in UTC, or null when no date was found. */
  dueAt: string | null;
  /** True when a date was found but no time of day. */
  allDay: boolean;
  priority: Priority;
  recurrence: Recurrence;
  tags: string[];
  /** Human-readable reasons the user should double-check before saving. */
  ambiguities: string[];
  /** The fragment of the input recognised as a date/time, if any. */
  matchedDateText: string | null;
}

const WEEKDAYS: Record<string, number> = {
  monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7,
};

const REMINDER_PREFIX = /^(?:please\s+)?(?:remind\s+me\s+(?:to\s+|about\s+|that\s+)?|set\s+(?:a\s+)?reminder\s+(?:to\s+|for\s+)?)/i;
const TASK_PREFIX = /^(?:please\s+)?(?:add\s+(?:a\s+)?task\s+(?:to\s+)?|create\s+(?:a\s+)?task\s+(?:to\s+)?|todo:?\s+|i\s+need\s+to\s+)/i;

function detectRecurrence(text: string): { recurrence: Recurrence; matched: string | null } {
  const lower = text.toLowerCase();
  let m = /\b(every\s+day|daily|each\s+day)\b/.exec(lower);
  if (m) return { recurrence: { freq: 'daily' }, matched: m[0] };
  m = /\b(every\s+weekday|on\s+weekdays|weekdays)\b/.exec(lower);
  if (m) return { recurrence: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }, matched: m[0] };
  m = /\bevery\s+((?:mon|tue|tues|wed|thu|thurs|fri|sat|sun)[a-z]*(?:\s*(?:,|and)\s*(?:mon|tue|tues|wed|thu|thurs|fri|sat|sun)[a-z]*)*)\b/.exec(lower);
  if (m && m[1]) {
    const days = m[1]
      .split(/\s*(?:,|and)\s*/)
      .map((d) => WEEKDAYS[d.trim()])
      .filter((d): d is number => typeof d === 'number');
    if (days.length) return { recurrence: { freq: 'weekly', byWeekday: [...new Set(days)] }, matched: m[0] };
  }
  m = /\b(every\s+week|weekly)\b/.exec(lower);
  if (m) return { recurrence: { freq: 'weekly' }, matched: m[0] };
  m = /\b(every\s+month|monthly)\b/.exec(lower);
  if (m) return { recurrence: { freq: 'monthly' }, matched: m[0] };
  m = /\bevery\s+(\d{1,3})\s+(day|week|month)s?\b/.exec(lower);
  if (m && m[1] && m[2]) {
    const freq = m[2] === 'day' ? 'daily' : m[2] === 'week' ? 'weekly' : 'monthly';
    return { recurrence: { freq, interval: Number(m[1]) }, matched: m[0] };
  }
  return { recurrence: { freq: 'none' }, matched: null };
}

function detectPriority(text: string): { priority: Priority; matched: string | null } {
  const m = /\b(urgent(?:ly)?|asap|high\s+priority|important|low\s+priority)\b|!{2,}/i.exec(text);
  if (!m) return { priority: 'medium', matched: null };
  const v = m[0].toLowerCase();
  if (v.startsWith('urgent') || v === 'asap' || v.startsWith('!!')) return { priority: 'urgent', matched: m[0] };
  if (v.startsWith('low')) return { priority: 'low', matched: m[0] };
  return { priority: 'high', matched: m[0] };
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .replace(/\b(?:on|at|by|for)$/i, '')
    .trim();
  if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.slice(0, 200);
}

/**
 * Deterministically parses a natural-language task or reminder.
 * No LLM involved: dates come from chrono-node and are interpreted as wall-clock
 * time in the user's IANA timezone.
 */
export function parseNaturalEntry(text: string, timezone: string, now: Date = new Date()): ParsedEntry {
  const input = text.trim().slice(0, 500);
  const ambiguities: string[] = [];
  const kind: ParsedEntry['kind'] = REMINDER_PREFIX.test(input) ? 'reminder' : 'task';
  let body = input.replace(REMINDER_PREFIX, '').replace(TASK_PREFIX, '');

  const tags = [...body.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,32})/gu)].map((m) => m[1] as string);
  body = body.replace(/(?:^|\s)#[\p{L}\p{N}_-]{1,32}/gu, ' ');

  const rec = detectRecurrence(body);
  if (rec.matched) body = body.replace(new RegExp(rec.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  const pri = detectPriority(body);
  if (pri.matched) body = body.replace(pri.matched, ' ');

  // chrono reads components in the host timezone, so hand it the user's
  // wall-clock "now" expressed as a host-local Date and rebuild in the user zone.
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const wallNow = new Date(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const results = chrono.parse(body, wallNow, { forwardDate: true });
  const hit = results[0];

  let dueAt: string | null = null;
  let allDay = false;
  let matchedDateText: string | null = null;

  if (hit) {
    matchedDateText = hit.text;
    const s = hit.start;
    const hourKnown = s.isCertain('hour');
    const dt = DateTime.fromObject(
      {
        year: s.get('year') ?? local.year,
        month: s.get('month') ?? local.month,
        day: s.get('day') ?? local.day,
        hour: hourKnown ? (s.get('hour') ?? 9) : 9,
        minute: hourKnown ? (s.get('minute') ?? 0) : 0,
      },
      { zone: timezone },
    );
    if (dt.isValid) {
      dueAt = dt.toUTC().toISO();
      allDay = !hourKnown;
      if (!hourKnown) ambiguities.push('No time given — defaulted to 9:00 AM.');
      if (hourKnown && !s.isCertain('meridiem') && (s.get('hour') ?? 0) <= 12 && !/\d{1,2}:\d{2}/.test(hit.text)) {
        ambiguities.push(`"${hit.text}" could be AM or PM — please confirm.`);
      }
      if (dt.toMillis() < now.getTime()) ambiguities.push('That time is in the past.');
    }
    body = body.slice(0, hit.index) + ' ' + body.slice(hit.index + hit.text.length);
  } else if (kind === 'reminder') {
    ambiguities.push('No date or time found — pick when to be reminded.');
  }

  if (rec.recurrence.freq !== 'none' && !dueAt) {
    // A recurring entry without an explicit start begins at the next 9:00 local.
    let start = local.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    if (start <= local) start = start.plus({ days: 1 });
    dueAt = start.toUTC().toISO();
    ambiguities.push('No start time given — starting at the next 9:00 AM.');
  }

  const title = cleanTitle(body) || cleanTitle(input) || 'Untitled';
  return {
    kind,
    title,
    dueAt,
    allDay,
    priority: pri.priority,
    recurrence: rec.recurrence,
    tags: [...new Set(tags)],
    ambiguities,
    matchedDateText,
  };
}

const EVENT_INTENT = /^(?:please\s+)?(?:(?:schedule|book|add|create|set\s+up|put)\s+(?:a\s+|an\s+)?(?:meeting|event|call|appointment|session|sync)|(?:meeting|call|appointment|sync|lunch|dinner)\s+with)\b/i;

export interface ParsedEvent {
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  recurrence: Recurrence;
  ambiguities: string[];
}

/** "Meeting with Raj tomorrow 3pm for 30 minutes" → an event. Null when the text is not about an event. */
export function parseEventIntent(text: string, timezone: string, now: Date = new Date()): ParsedEvent | null {
  if (!EVENT_INTENT.test(text.trim())) return null;
  const dur = /\bfor\s+(\d{1,3})\s*(min(?:ute)?s?|h(?:ou)?rs?|hours?)\b/i.exec(text);
  const minutes = dur ? Number(dur[1]) * (/^h/i.test(dur[2]!) ? 60 : 1) : 60;
  const cleaned = text.replace(/\bfor\s+\d{1,3}\s*(?:min(?:ute)?s?|h(?:ou)?rs?|hours?)\b/i, '');
  const p = parseNaturalEntry(cleaned, timezone, now);
  const title = p.title.replace(/^(?:schedule|book|add|create|set\s+up|put)\s+(?:a\s+|an\s+)?/i, '').replace(/^\w/, (c) => c.toUpperCase());
  const ambiguities = [...p.ambiguities];
  if (!p.dueAt) ambiguities.push('No date or time found — pick one.');
  const start = p.dueAt;
  const end = start ? new Date(new Date(start).getTime() + (p.allDay ? 86_400_000 - 60_000 : minutes * 60_000)).toISOString() : null;
  return { title: title || 'Event', startAt: start, endAt: end, allDay: p.allDay, recurrence: p.recurrence, ambiguities };
}
