import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { DEFAULT_PREFERENCES, deleteAccountSchema, loginSchema, registerSchema } from '@friday/shared';
import { sessions, users } from '../db/schema.js';
import { burnVerify, hashPassword, verifyPassword } from '../auth/password.js';
import { hashToken, newSessionToken } from '../auth/tokens.js';
import { SESSION_COOKIE, authUser } from '../auth/plugin.js';
import { HttpError, conflict, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { savePreferences } from '../services/prefs.js';
import { audit } from '../services/audit.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = new HttpError(401, 'invalid_credentials', 'Invalid email or password');

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authLimit = { config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } };

  async function startSession(reply: FastifyReply, userId: string, client: 'web' | 'mobile', userAgent?: string) {
    const token = newSessionToken();
    const ttlMs = app.config.SESSION_TTL_DAYS * 86_400_000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await app.db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      client,
      userAgent: userAgent?.slice(0, 200) ?? null,
      expiresAt,
    });
    if (client === 'web') {
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: app.config.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });
      return { expiresAt: expiresAt.toISOString() };
    }
    // Mobile stores the token in the iOS Keychain via SecureStore.
    return { token, expiresAt: expiresAt.toISOString() };
  }

  app.post('/auth/register', authLimit, async (req, reply) => {
    if (!app.config.ALLOW_REGISTRATION) throw new HttpError(403, 'registration_closed', 'Registration is disabled');
    const body = parse(registerSchema, req.body);
    const passwordHash = await hashPassword(body.password);
    const [{ count } = { count: 0 }] = await app.db.select({ count: sql<number>`count(*)::int` }).from(users);
    const isOwner = app.config.OWNER_EMAIL ? app.config.OWNER_EMAIL.toLowerCase() === body.email : count === 0;
    const inserted = await app.db
      .insert(users)
      .values({ email: body.email, passwordHash, displayName: body.displayName, role: isOwner ? 'owner' : 'member' })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    const user = inserted[0];
    if (!user) throw conflict('An account with that email already exists');
    await savePreferences(app.db, user.id, { ...DEFAULT_PREFERENCES, timezone: body.timezone ?? DEFAULT_PREFERENCES.timezone });
    await audit(app.db, { userId: user.id, action: 'auth.register', ip: req.ip });
    const client = req.headers['x-friday-client'] === 'mobile' ? 'mobile' : 'web';
    const session = await startSession(reply, user.id, client, req.headers['user-agent']);
    return reply.code(201).send({ user: { id: user.id, email: body.email, displayName: body.displayName }, ...session });
  });

  app.post('/auth/login', authLimit, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const rows = await app.db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const user = rows[0];
    if (!user) {
      await burnVerify(body.password);
      throw GENERIC_LOGIN_ERROR;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await burnVerify(body.password);
      await audit(app.db, { userId: user.id, action: 'auth.login_locked', ip: req.ip });
      throw GENERIC_LOGIN_ERROR;
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      const failed = user.failedLogins + 1;
      await app.db
        .update(users)
        .set({
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        })
        .where(eq(users.id, user.id));
      await audit(app.db, { userId: user.id, action: 'auth.login_failed', ip: req.ip });
      throw GENERIC_LOGIN_ERROR;
    }
    await app.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await audit(app.db, { userId: user.id, action: 'auth.login', meta: { client: body.client }, ip: req.ip });
    const session = await startSession(reply, user.id, body.client, req.headers['user-agent']);
    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, ...session };
  });

  app.post('/auth/logout', { preHandler: app.authenticate }, async (req, reply) => {
    const me = authUser(req);
    await app.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, me.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const me = authUser(req);
    return { user: { id: me.id, email: me.email, displayName: me.displayName, role: me.role } };
  });

  app.get('/auth/sessions', { preHandler: app.authenticate }, async (req) => {
    const me = authUser(req);
    const rows = await app.db
      .select({
        id: sessions.id,
        client: sessions.client,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, me.id), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(50);
    return { sessions: rows.map((s) => ({ ...s, current: s.id === me.sessionId })) };
  });

  app.delete<{ Params: { id: string } }>('/auth/sessions/:id', { preHandler: app.authenticate }, async (req) => {
    const me = authUser(req);
    const updated = await app.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, me.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (!updated.length) throw notFound('Session');
    await audit(app.db, { userId: me.id, action: 'auth.session_revoked', target: req.params.id, ip: req.ip });
    return { ok: true };
  });

  app.post('/auth/sessions/revoke-others', { preHandler: app.authenticate }, async (req) => {
    const me = authUser(req);
    const updated = await app.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, me.id), ne(sessions.id, me.sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    await audit(app.db, { userId: me.id, action: 'auth.sessions_revoked_others', meta: { count: updated.length }, ip: req.ip });
    return { revoked: updated.length };
  });

  app.post('/account/delete', { preHandler: app.authenticate, ...authLimit }, async (req, reply) => {
    const me = authUser(req);
    const body = parse(deleteAccountSchema, req.body);
    const rows = await app.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1);
    if (!rows[0] || !(await verifyPassword(rows[0].hash, body.password))) {
      throw new HttpError(401, 'invalid_credentials', 'Password is incorrect');
    }
    // All user-owned rows cascade on delete; audit rows keep a null user id.
    await audit(app.db, { userId: me.id, action: 'account.deleted', ip: req.ip });
    await app.db.delete(users).where(eq(users.id, me.id));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
