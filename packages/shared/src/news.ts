export type NewsImportance = 'breaking' | 'important' | 'relevant' | 'background';

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|cmpid$)/i;

/** Canonical URL used for de-duplication: lowercase host, no fragment or tracking params. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return null;
  }
}

/** Normalised title fingerprint so the same story from two feeds collapses. */
export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12)
    .join(' ');
}

export interface DedupableItem {
  url: string;
  title: string;
}

/** Keeps the first occurrence of each story by canonical URL or title fingerprint. */
export function dedupeNews<T extends DedupableItem>(items: T[], seen: Iterable<string> = []): T[] {
  const keys = new Set(seen);
  const out: T[] = [];
  for (const item of items) {
    const urlKey = canonicalUrl(item.url);
    const titleKey = titleFingerprint(item.title);
    if (!urlKey || keys.has(urlKey) || (titleKey && keys.has(`t:${titleKey}`))) continue;
    keys.add(urlKey);
    if (titleKey) keys.add(`t:${titleKey}`);
    out.push(item);
  }
  return out;
}

const BREAKING = /\b(breaking|just in|live updates?)\b/i;

/**
 * Deterministic importance classification — no LLM call per item.
 * Keywords the user follows raise relevance; muted keywords are filtered out upstream.
 */
export function classifyImportance(
  title: string,
  summary: string,
  publishedAt: Date | null,
  keywords: string[],
  now: Date = new Date(),
): NewsImportance {
  const text = `${title} ${summary}`.toLowerCase();
  const ageHours = publishedAt ? (now.getTime() - publishedAt.getTime()) / 3_600_000 : Infinity;
  const hits = keywords.filter((k) => k && text.includes(k.toLowerCase())).length;
  if (BREAKING.test(title) && ageHours < 6) return 'breaking';
  if (hits >= 2 || (hits >= 1 && ageHours < 12)) return 'important';
  if (hits >= 1 || ageHours < 24) return 'relevant';
  return 'background';
}

export function isMuted(title: string, summary: string, muted: string[]): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  return muted.some((m) => m && text.includes(m.toLowerCase()));
}

/** Strips HTML tags/entities and trims to a short plain-text excerpt. */
export function plainExcerpt(html: string, max = 280): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
