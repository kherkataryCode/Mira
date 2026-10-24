import { and, desc, eq, gte } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';
import { canonicalUrl, classifyImportance, dedupeNews, isMuted, plainExcerpt, titleFingerprint, type Preferences } from '@friday/shared';
import type { Db } from '../db/client.js';
import { newsItems, newsSources } from '../db/schema.js';
import { safeFetchText } from '../util/safe-fetch.js';

export interface FeedEntry {
  title: string;
  url: string;
  summary: string;
  publishedAt: Date | null;
}

/** Public RSS feeds offered as one-tap suggestions. Nothing is fetched until the user adds one. */
export const SUGGESTED_SOURCES = [
  { name: 'BBC News — Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'technology' },
  { name: 'BBC News — Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'business' },
  { name: 'BBC News — World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
  { name: 'Hacker News — Front page', url: 'https://hnrss.org/frontpage', category: 'technology' },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'cybersecurity' },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
});

const text = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && '#text' in v) return text((v as Record<string, unknown>)['#text']);
  return '';
};

const date = (v: unknown): Date | null => {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000 ? null : d;
};

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom. Untrusted input: only text is extracted. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const out: FeedEntry[] = [];
  const rssItems: any[] = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? [];
  for (const it of rssItems) {
    const link = Array.isArray(it.link) ? text(it.link[0]) : text(it.link);
    out.push({
      title: plainExcerpt(text(it.title), 300),
      url: link.trim(),
      summary: plainExcerpt(text(it.description ?? it['content:encoded'] ?? '')),
      publishedAt: date(it.pubDate ?? it['dc:date']),
    });
  }
  const entries: any[] = doc?.feed?.entry ?? [];
  for (const e of entries) {
    const links: any[] = e.link ?? [];
    const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
    out.push({
      title: plainExcerpt(text(e.title), 300),
      url: String(alt?.['@_href'] ?? '').trim(),
      summary: plainExcerpt(text(e.summary ?? e.content ?? '')),
      publishedAt: date(e.published ?? e.updated),
    });
  }
  return out.filter((e) => e.title && canonicalUrl(e.url)).slice(0, 100);
}

const MAX_SOURCES_PER_RUN = 15;

export interface CollectResult {
  sources: number;
  added: number;
  failures: number;
}

/** Fetches a user's enabled sources once. Called by the worker on schedule or by an explicit refresh. */
export async function collectNewsForUser(db: Db, userId: string, prefs: Preferences, now = new Date()): Promise<CollectResult> {
  const sources = await db
    .select()
    .from(newsSources)
    .where(and(eq(newsSources.userId, userId), eq(newsSources.enabled, true)))
    .limit(MAX_SOURCES_PER_RUN);
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const recent = await db
    .select({ canonicalUrl: newsItems.canonicalUrl, titleKey: newsItems.titleKey })
    .from(newsItems)
    .where(and(eq(newsItems.userId, userId), gte(newsItems.fetchedAt, since)))
    .orderBy(desc(newsItems.fetchedAt))
    .limit(2000);
  const seen = new Set<string>();
  for (const r of recent) {
    seen.add(r.canonicalUrl);
    if (r.titleKey) seen.add(`t:${r.titleKey}`);
  }

  let added = 0;
  let failures = 0;
  for (const source of sources) {
    // Back off sources that keep failing: retry at most once a day after 5 failures.
    if (source.consecutiveFailures >= 5 && source.lastFetchedAt && now.getTime() - source.lastFetchedAt.getTime() < 86_400_000) continue;
    try {
      const res = await safeFetchText(source.url, { etag: source.etag, lastModified: source.lastModified });
      if (!res.notModified) {
        const entries = dedupeNews(parseFeed(res.body), seen).filter(
          (e) => !isMuted(e.title, e.summary, prefs.news.mutedKeywords),
        );
        for (const e of entries) {
          const canon = canonicalUrl(e.url)!;
          const titleKey = titleFingerprint(e.title);
          seen.add(canon);
          if (titleKey) seen.add(`t:${titleKey}`);
          const inserted = await db
            .insert(newsItems)
            .values({
              userId,
              sourceId: source.id,
              sourceName: source.name,
              url: e.url,
              canonicalUrl: canon,
              titleKey,
              title: e.title,
              summary: e.summary,
              category: source.category,
              importance: classifyImportance(e.title, e.summary, e.publishedAt, prefs.news.keywords, now),
              publishedAt: e.publishedAt,
            })
            .onConflictDoNothing()
            .returning({ id: newsItems.id });
          added += inserted.length;
        }
      }
      await db
        .update(newsSources)
        .set({ lastFetchedAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0, etag: res.etag, lastModified: res.lastModified })
        .where(eq(newsSources.id, source.id));
    } catch (err) {
      failures++;
      await db
        .update(newsSources)
        .set({
          lastFetchedAt: now,
          lastError: (err instanceof Error ? err.message : 'Fetch failed').slice(0, 200),
          consecutiveFailures: source.consecutiveFailures + 1,
        })
        .where(eq(newsSources.id, source.id));
    }
  }
  return { sources: sources.length, added, failures };
}
