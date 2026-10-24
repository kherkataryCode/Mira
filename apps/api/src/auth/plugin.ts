import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { sessions, users } from '../db/schema.js';
import { HttpError, forbidden, unauthorized } from '../util/errors.js';
import { hashToken } from './tokens.js';

export const SESSION_COOKIE = 'friday_session';
export const CSRF_HEADER = 'x-friday-csrf';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'member';
  sessionId: string;
  via: 'cookie' | 'bearer';
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOUCH_INTERVAL_MS = 5 * 60_000;

export function authUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('user', null);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const cookie = req.cookies[SESSION_COOKIE] ?? null;
    const token = bearer || cookie;
    if (!token || token.length > 200) throw unauthorized();
    const via = bearer ? 'bearer' : 'cookie';

    // Cookie sessions are ambient credentials, so state-changing requests must
    // carry a custom header (forces a CORS preflight) and an allowed Origin.
    if (via === 'cookie' && UNSAFE.has(req.method)) {
      if (req.headers[CSRF_HEADER] !== '1') throw new HttpError(403, 'csrf', 'Missing CSRF header');
      const origin = req.headers.origin;
      if (origin && !app.config.webOrigins.includes(origin)) throw new HttpError(403, 'csrf', 'Origin not allowed');
    }

    const now = new Date();
    const rows = await app.db
      .select({
        sessionId: sessions.id,
        lastUsedAt: sessions.lastUsedAt,
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .limit(1);
    const row = rows[0];
    if (!row) throw unauthorized();

    if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await app.db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, row.sessionId));
    }
    req.user = {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      sessionId: row.sessionId,
      via,
    };
  });

  app.decorate('requireOwner', async (req: FastifyRequest) => {
    if (authUser(req).role !== 'owner') throw forbidden();
  });
}
