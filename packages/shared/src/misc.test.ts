import { describe, expect, it } from 'vitest';
import { canonicalUrl, classifyImportance, dedupeNews, plainExcerpt } from './news.js';
import { qualityFromScore, scheduleReview, INITIAL_REVIEW_STATE } from './srs.js';
import { redactObject, redactString } from './redact.js';
import { preferencesSchema, taskCreateSchema } from './schemas.js';
import { DEFAULT_PREFERENCES } from './defaults.js';

describe('news', () => {
  it('canonicalises URLs and strips tracking', () => {
    expect(canonicalUrl('https://WWW.Example.com/a/?utm_source=x&id=2#frag')).toBe('https://example.com/a?id=2');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });
  it('dedupes by URL and title', () => {
    const items = [
      { url: 'https://a.com/x?utm_medium=1', title: 'Global markets rally after inflation data' },
      { url: 'https://a.com/x', title: 'Different' },
      { url: 'https://b.com/y', title: 'Global markets rally after inflation data!' },
      { url: 'https://c.com/z', title: 'Something new' },
    ];
    expect(dedupeNews(items).map((i) => i.url)).toEqual(['https://a.com/x?utm_medium=1', 'https://c.com/z']);
  });
  it('classifies importance deterministically', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    expect(classifyImportance('Breaking: outage', '', new Date('2026-10-24T09:00:00Z'), [], now)).toBe('breaking');
    expect(classifyImportance('Old story', '', new Date('2026-10-01T00:00:00Z'), [], now)).toBe('background');
    expect(classifyImportance('AI chips', 'security', new Date('2026-10-01T00:00:00Z'), ['ai', 'security'], now)).toBe('important');
  });
  it('produces plain excerpts', () => {
    expect(plainExcerpt('<p>Hello&nbsp;<b>world</b><script>x()</script></p>')).toBe('Hello world');
  });
});

describe('srs', () => {
  it('grows intervals on success and resets on failure', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const a = scheduleReview(INITIAL_REVIEW_STATE, 5, now);
    const b = scheduleReview(a, 5, now);
    const c = scheduleReview(b, 4, now);
    expect([a.intervalDays, b.intervalDays]).toEqual([1, 6]);
    expect(c.intervalDays).toBeGreaterThan(6);
    expect(scheduleReview(c, 1, now).intervalDays).toBe(1);
    expect(qualityFromScore(3, 3)).toBe(5);
  });
});

describe('redaction', () => {
  it('removes secrets and sensitive keys', () => {
    expect(redactString('key sk-ant-api03-abcdefghijklmnop and postgres://u:p@h/db')).toBe('key [REDACTED] and [REDACTED]');
    expect(redactObject({ password: 'x', nested: { authorization: 'Bearer abc', ok: 1 } })).toEqual({
      password: '[REDACTED]',
      nested: { authorization: '[REDACTED]', ok: 1 },
    });
  });
});

describe('schemas', () => {
  it('accepts the default preferences', () => {
    expect(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true);
  });
  it('rejects unknown keys (mass assignment)', () => {
    expect(taskCreateSchema.safeParse({ title: 'x', userId: 'someone-else' }).success).toBe(false);
  });
  it('rejects bad timezones', () => {
    expect(preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, timezone: 'Mars/Base' }).success).toBe(false);
  });
});
