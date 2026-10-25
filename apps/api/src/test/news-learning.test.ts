import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, registerUser, type TestContext, type TestUser } from './helpers.js';
import { parseFeed } from '../services/news.js';
import { assertPublicHttpsUrl, isPrivateAddress } from '../util/safe-fetch.js';

let ctx: TestContext;
let u: TestUser;
beforeAll(async () => {
  ctx = await createTestApp();
  u = await registerUser(ctx.app, 'Learner');
});
afterAll(async () => closeTestApp(ctx));

describe('SSRF protection', () => {
  it('classifies private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });
  it('rejects unsafe URLs before any request', async () => {
    for (const url of ['http://example.com/feed', 'https://localhost/feed', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://user:pw@example.com/', 'https://example.com:8443/', 'file:///etc/passwd']) {
      await expect(assertPublicHttpsUrl(url), url).rejects.toThrow();
    }
  });
  it('refuses to add private feed sources', async () => {
    const r = await u.call({ method: 'POST', url: '/news/sources', payload: { name: 'Meta', url: 'https://169.254.169.254/feed' } });
    expect(r.statusCode).toBe(400);
    const h = await u.call({ method: 'POST', url: '/news/sources', payload: { name: 'Plain', url: 'http://example.com/feed' } });
    expect(h.statusCode).toBe(400);
  });
});

describe('feed parsing', () => {
  it('parses RSS and Atom and strips markup', () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Breaking: Thing &amp; stuff</title><link>https://a.example/1?utm_source=x</link><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;&lt;script&gt;bad()&lt;/script&gt;</description><pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate></item><item><title>No link</title></item></channel></rss>`;
    const items = parseFeed(rss);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Breaking: Thing & stuff');
    expect(items[0]!.summary).toBe('Hello world');
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Atom post</title><link rel="alternate" href="https://b.example/post"/><summary>S</summary><updated>2026-10-22T00:00:00Z</updated></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ title: 'Atom post', url: 'https://b.example/post' });
  });
  it('ignores javascript: links', () => {
    expect(parseFeed('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>')).toHaveLength(0);
  });
});

describe('news API', () => {
  it('starts every user with the default cybersecurity feeds, honestly marked as not yet fetched', async () => {
    const r = (await u.call({ method: 'GET', url: '/news' })).json();
    expect(r.items).toHaveLength(0);
    expect(r.status.sources).toBe(5);
    expect(r.status.stale).toBe(true);
    const s = (await u.call({ method: 'GET', url: '/news/sources' })).json();
    expect(s.sources.map((x: { name: string }) => x.name)).toContain('CISA — ICS Advisories');
    expect(s.suggestions.length).toBeGreaterThan(0);
  });
});

describe('learning', () => {
  it('hides quiz answers until submission, then schedules review', async () => {
    const list = (await u.call({ method: 'GET', url: '/learn/lessons' })).json();
    // Only the user's selected topics (default: cybersecurity + OT security).
    expect(list.lessons.length).toBeGreaterThanOrEqual(8);
    expect(new Set(list.lessons.map((l: { topic: string }) => l.topic))).toEqual(new Set(['cybersecurity', 'ot-security']));
    const id = list.featured.id;
    const detail = (await u.call({ method: 'GET', url: `/learn/lessons/${id}` })).json().lesson;
    expect(JSON.stringify(detail.quiz)).not.toMatch(/"answer"|"why"/);
    await u.call({ method: 'POST', url: `/learn/lessons/${id}/start` });
    const answers = detail.quiz.map(() => 0);
    const result = (await u.call({ method: 'POST', url: `/learn/lessons/${id}/quiz`, payload: { answers } })).json();
    expect(result.total).toBe(detail.quiz.length);
    expect(result.note).toMatch(/not mastery/);
    expect(new Date(result.nextReviewAt).getTime()).toBeGreaterThan(Date.now());
    const bad = await u.call({ method: 'POST', url: `/learn/lessons/${id}/quiz`, payload: { answers: [0] } });
    if (detail.quiz.length !== 1) expect(bad.statusCode).toBe(400);
    const saved = await u.call({ method: 'POST', url: `/learn/lessons/${id}/save`, payload: { saved: true } });
    expect(saved.json().saved).toBe(true);
    const savedList = (await u.call({ method: 'GET', url: '/learn/lessons?filter=saved' })).json().lessons;
    expect(savedList.map((l: { id: string }) => l.id)).toContain(id);
  });
});

describe('home, brief, preferences', () => {
  it('builds a brief only from real data', async () => {
    await u.call({ method: 'POST', url: '/tasks', payload: { title: 'Real task today', dueAt: new Date(Date.now() + 60_000).toISOString() } });
    const brief = (await u.call({ method: 'POST', url: '/briefs/generate' })).json().brief;
    expect(brief.generatedBy).toBe('deterministic');
    const tasks = brief.content.sections.find((s: { kind: string }) => s.kind === 'tasks');
    expect(tasks.lines.join(' ')).toContain('Real task today');
    const news = brief.content.sections.find((s: { kind: string }) => s.kind === 'news');
    expect(news.lines[0]).toMatch(/No important news/);
    const home = (await u.call({ method: 'GET', url: '/home' })).json();
    expect(home.brief.id).toBe(brief.id);
    expect(home.greeting).toMatch(/Learner/);
  });

  it('validates preference updates including timezone', async () => {
    expect((await u.call({ method: 'PATCH', url: '/preferences', payload: { timezone: 'Mars/Olympus' } })).statusCode).toBe(400);
    const ok = await u.call({ method: 'PATCH', url: '/preferences', payload: { timezone: 'Europe/London', verbosity: 'detailed' } });
    expect(ok.json().preferences.timezone).toBe('Europe/London');
    expect(ok.json().preferences.schedule.morningBrief).toBe('08:00');
  });
});
