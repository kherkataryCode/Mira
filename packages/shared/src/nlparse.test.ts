import { describe, expect, it } from 'vitest';
import { parseNaturalEntry } from './nlparse.js';

// 2026-10-24 15:30 in Asia/Kolkata (UTC+5:30)
const NOW = new Date('2026-10-24T10:00:00Z');

describe('parseNaturalEntry', () => {
  it('parses the spec example into a reminder in the user timezone', () => {
    const r = parseNaturalEntry('Remind me to call the dentist tomorrow at 5 PM', 'Asia/Kolkata', NOW);
    expect(r.kind).toBe('reminder');
    expect(r.title).toBe('Call the dentist');
    expect(r.dueAt).toBe('2026-10-25T11:30:00.000Z'); // 17:00 IST
    expect(r.ambiguities).toEqual([]);
  });

  it('interprets the same words differently per timezone', () => {
    const r = parseNaturalEntry('call mom tomorrow at 6pm', 'America/New_York', NOW);
    expect(r.kind).toBe('task');
    expect(r.dueAt).toBe('2026-10-25T22:00:00.000Z'); // 18:00 EDT
  });

  it('flags AM/PM ambiguity', () => {
    const r = parseNaturalEntry('team meeting tomorrow at 9', 'Asia/Kolkata', NOW);
    expect(r.ambiguities.some((a) => a.includes('AM or PM'))).toBe(true);
  });

  it('defaults date-only entries to 9:00 and says so', () => {
    const r = parseNaturalEntry('pay electricity bill on friday', 'Asia/Kolkata', NOW);
    expect(r.allDay).toBe(true);
    expect(r.title).toBe('Pay electricity bill');
    expect(r.ambiguities[0]).toMatch(/9:00/);
  });

  it('extracts recurrence, priority and tags', () => {
    const r = parseNaturalEntry('add task review firewall every monday at 10am urgent #work', 'Asia/Kolkata', NOW);
    expect(r.recurrence).toEqual({ freq: 'weekly', byWeekday: [1] });
    expect(r.priority).toBe('urgent');
    expect(r.tags).toEqual(['work']);
    expect(r.title).toBe('Review firewall');
  });

  it('asks for a time when a reminder has none', () => {
    const r = parseNaturalEntry('remind me to stretch', 'Asia/Kolkata', NOW);
    expect(r.dueAt).toBeNull();
    expect(r.ambiguities.length).toBeGreaterThan(0);
  });

  it('starts recurring entries without a time at the next 9:00', () => {
    const r = parseNaturalEntry('drink water daily', 'Asia/Kolkata', NOW);
    expect(r.recurrence.freq).toBe('daily');
    expect(r.dueAt).toBe('2026-10-25T03:30:00.000Z');
  });
});
