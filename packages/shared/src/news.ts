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

/* ---------- cybersecurity relevance ---------- */

const CYBER_STRONG = [
  'vulnerability', 'vulnerabilities', 'cve-', 'exploit', 'exploited', 'zero-day', '0-day', 'ransomware', 'malware',
  'advisory', 'patch', 'security update', 'remote code execution', 'rce', 'privilege escalation', 'authentication bypass',
  'backdoor', 'botnet', 'phishing', 'breach', 'threat actor', 'apt', 'cisa', 'cert-in', 'ncsc', 'ics', 'scada', 'plc',
  'operational technology', 'industrial control', 'hmi', 'denial of service', 'data leak', 'spyware', 'supply chain attack',
];
const CYBER_WEAK = ['security', 'cyber', 'hacker', 'hacked', 'attack', 'firewall', 'encryption', 'credential', 'patched', 'flaw', 'bug bounty'];
const OT_TERMS = ['ics', 'scada', 'plc', 'hmi', 'operational technology', 'industrial', 'modbus', 'dnp3', 'iec 62443', 'pipeline', 'substation', 'rtu'];

function countTerms(text: string, terms: string[]): number {
  return terms.reduce((n, t) => n + (new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}`, 'i').test(text) ? 1 : 0), 0);
}

/**
 * 0–100 score of how relevant a story is to cybersecurity (and OT when the user follows it).
 * Deterministic, so filtering never depends on an AI call.
 */
export function cyberRelevance(title: string, summary: string, opts: { keywords?: string[]; otFocus?: boolean } = {}): number {
  const text = `${title} ${summary}`.toLowerCase();
  const strong = countTerms(text, CYBER_STRONG);
  const weak = countTerms(text, CYBER_WEAK);
  const ot = countTerms(text, OT_TERMS);
  const kw = (opts.keywords ?? []).filter((k) => k && text.includes(k.toLowerCase())).length;
  const titleBoost = countTerms(title.toLowerCase(), CYBER_STRONG) > 0 ? 15 : 0;
  const score = strong * 18 + weak * 6 + kw * 6 + titleBoost + (opts.otFocus ? ot * 10 : ot * 4);
  return Math.max(0, Math.min(100, score));
}

/** Minimum relevance for a story to appear in a cybersecurity briefing. */
export const CYBER_RELEVANCE_THRESHOLD = 30;

export type ExploitationStatus = 'exploited' | 'proof-of-concept' | 'not-reported';

/** What the source text itself says about exploitation. Never inferred beyond the text. */
export function exploitationStatus(text: string): ExploitationStatus {
  const t = text.toLowerCase();
  if (/(actively|being|has been|have been|were|was|under active)\s+exploit|exploited in the wild|in-the-wild exploitation|known exploited|added to (the )?kev/.test(t)) return 'exploited';
  if (/proof[- ]of[- ]concept|\bpoc\b|exploit code (is |has been )?(publicly )?(available|released)|public exploit/.test(t)) return 'proof-of-concept';
  return 'not-reported';
}

export const EXPLOITATION_LABEL: Record<ExploitationStatus, string> = {
  exploited: 'Reported as exploited in the wild (per source)',
  'proof-of-concept': 'Public proof-of-concept reported (per source)',
  'not-reported': 'No exploitation reported in the source',
};

/** Requests for an on-demand daily briefing typed in chat. */
const BRIEFING_INTENT =
  /\b(daily|today'?s|morning|evening|my)\s+(summary|briefing|brief|digest|update)\b|^(give me|prepare|create|make|send|show)( me)?( a| the| my| today'?s)?\s+(summary|briefing|brief|digest)\b|^\/?(brief|briefing|summary|digest)$/i;

export function isBriefingRequest(text: string): boolean {
  return BRIEFING_INTENT.test(text.trim());
}
