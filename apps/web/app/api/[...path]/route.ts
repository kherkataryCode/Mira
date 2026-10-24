import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to the Fastify API, resolved at runtime (unlike next.config rewrites,
 * which are fixed at build time). Streams both directions so chat NDJSON stays live.
 * Only allow-listed headers cross the boundary.
 */
export const dynamic = 'force-dynamic';

const REQUEST_HEADERS = ['content-type', 'cookie', 'x-friday-csrf', 'origin', 'user-agent', 'accept', 'x-request-id'];
const RESPONSE_HEADERS = ['content-type', 'set-cookie', 'cache-control', 'content-disposition', 'x-request-id', 'retry-after', 'x-accel-buffering'];

function apiBase(): string {
  // Render's private network exposes the API as host:port (render.yaml fromService hostport).
  const hostport = process.env.API_INTERNAL_HOSTPORT;
  if (hostport) return `http://${hostport}`;
  return (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

/** The client IP as seen by the platform's edge proxy (right-most X-Forwarded-For entry). */
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (path.some((seg) => seg === '..' || seg.includes('\\'))) return new Response('Bad path', { status: 400 });
  const target = `${apiBase()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ip = clientIp(req);
  if (ip) headers.set('x-forwarded-for', ip);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      signal: req.signal,
      cache: 'no-store',
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: 'upstream_unavailable', message: 'Friday is temporarily unreachable. Please try again.' }, { status: 502 });
  }

  const out = new Headers();
  for (const h of RESPONSE_HEADERS) {
    if (h === 'set-cookie') {
      for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
    } else {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
