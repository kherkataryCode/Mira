import { lookup } from 'node:dns/promises';
import net from 'node:net';

/**
 * Outbound fetch for untrusted, user-supplied URLs (news feeds).
 * Blocks SSRF targets: non-HTTPS, credentials in URL, private/loopback/link-local/
 * metadata addresses (checked after DNS resolution), redirects (re-validated manually),
 * oversized bodies and slow responses.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata']);

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

export class UnsafeUrlError extends Error {}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https:// URLs are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('Credentials in URLs are not allowed');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Only the default HTTPS port is allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Host is not allowed');
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError('Host resolves to a private or reserved address');
  }
  return url;
}

export interface SafeFetchResult {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

export async function safeFetchText(
  raw: string,
  opts: { timeoutMs?: number; maxBytes?: number; etag?: string | null; lastModified?: string | null } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicHttpsUrl(current);
    const headers: Record<string, string> = {
      'user-agent': 'MiraAssistant/0.1 (+personal news reader; respects robots and rate limits)',
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
    };
    if (opts.etag) headers['if-none-match'] = opts.etag;
    if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;
    const res = await fetch(url, { redirect: 'manual', headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      if (!loc) throw new Error(`Redirect without location (${res.status})`);
      current = new URL(loc, url).toString();
      continue;
    }
    if (res.status === 304) {
      await res.body?.cancel();
      return { status: 304, body: '', etag: opts.etag ?? null, lastModified: opts.lastModified ?? null, notModified: true };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Feed responded with HTTP ${res.status}`);
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new Error('Feed is too large');
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Feed is too large');
      }
      chunks.push(value);
    }
    return {
      status: res.status,
      body: Buffer.concat(chunks).toString('utf8'),
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      notModified: false,
    };
  }
  throw new Error('Too many redirects');
}
