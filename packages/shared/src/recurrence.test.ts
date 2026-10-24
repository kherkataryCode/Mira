import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { describeRecurrence, nextOccurrence } from './recurrence.js';
import { atLocalTime, hasLocalTimePassed, localDate } from './time.js';

describe('nextOccurrence', () => {
  it('returns null for one-off', () => {
    expect(nextOccurrence(new Date(), { freq: 'none' }, 'UTC', new Date())).toBeNull();
  });

  it('keeps wall-clock time across a DST change (New York, Nov 2026)', () => {
    // 09:00 EDT on 2026-10-31 = 13:00Z; DST ends 2026-11-01.
    const anchor = new Date('2026-10-31T13:00:00Z');
    const next = nextOccurrence(anchor, { freq: 'daily' }, 'America/New_York', anchor)!;
    expect(DateTime.fromJSDate(next, { zone: 'America/New_York' }).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-11-01 09:00');
    expect(next.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('jumps far-past anchors forward efficiently', () => {
    const anchor = new Date('2020-01-01T03:30:00Z');
    const after = new Date('2026-10-24T10:00:00Z');
    const next = nextOccurrence(anchor, { freq: 'daily' }, 'Asia/Kolkata', after)!;
    expect(next.toISOString()).toBe('2026-10-25T03:30:00.000Z');
  });

  it('handles weekday sets', () => {
    // Friday 2026-10-23 09:00 IST
    const anchor = new Date('2026-10-23T03:30:00Z');
    const next = nextOccurrence(anchor, { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }, 'Asia/Kolkata', anchor)!;
    expect(DateTime.fromJSDate(next, { zone: 'Asia/Kolkata' }).weekday).toBe(1); // skips weekend
  });

  it('respects until', () => {
    const anchor = new Date('2026-10-01T00:00:00Z');
    expect(
      nextOccurrence(anchor, { freq: 'daily', until: '2026-10-02T00:00:00Z' }, 'UTC', new Date('2026-10-02T00:00:00Z')),
    ).toBeNull();
  });

  it('describes recurrences', () => {
    expect(describeRecurrence({ freq: 'weekly', byWeekday: [5, 4, 3, 2, 1] })).toBe('Weekdays');
    expect(describeRecurrence({ freq: 'daily', interval: 2 })).toBe('Every 2 days');
  });
});

describe('time helpers', () => {
  it('computes local dates and times', () => {
    const now = new Date('2026-10-24T20:00:00Z'); // 01:30 next day IST
    expect(localDate(now, 'Asia/Kolkata')).toBe('2026-10-25');
    expect(atLocalTime(now, 'Asia/Kolkata', '08:00').toISOString()).toBe('2026-10-25T02:30:00.000Z');
    expect(hasLocalTimePassed(now, 'Asia/Kolkata', '08:00')).toBe(false);
  });
});
