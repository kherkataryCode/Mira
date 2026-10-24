import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, freshIp, registerUser, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => closeTestApp(ctx));

describe('authentication', () => {
  it('registers, logs in, and rejects bad passwords with a generic error', async () => {
    const u = await registerUser(ctx.app, 'Alice');
    const ok = await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: u.email, password: 'correct horse battery staple', client: 'mobile' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTypeOf('string');

    const bad = await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: u.email, password: 'wrong', client: 'mobile' } });
    const missing = await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: 'nobody@example.test', password: 'wrong', client: 'mobile' } });
    expect(bad.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(bad.json().message).toBe(missing.json().message);
  });

  it('rejects weak passwords and unknown fields', async () => {
    const weak = await ctx.app.inject({ method: 'POST', url: '/auth/register', remoteAddress: freshIp(), payload: { email: 'w@example.test', password: 'short', displayName: 'W' } });
    expect(weak.statusCode).toBe(400);
    const extra = await ctx.app.inject({ method: 'POST', url: '/auth/register', remoteAddress: freshIp(), payload: { email: 'x@example.test', password: 'long enough password', displayName: 'X', role: 'owner' } });
    expect(extra.statusCode).toBe(400);
  });

  it('locks the account after repeated failures', async () => {
    const u = await registerUser(ctx.app, 'Lockme');
    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: u.email, password: 'nope', client: 'mobile' } });
    }
    const correct = await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: u.email, password: 'correct horse battery staple', client: 'mobile' } });
    expect(correct.statusCode).toBe(401);
  });

  it('rate limits login attempts per IP', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: ip, payload: { email: 'rl@example.test', password: 'x', client: 'mobile' } });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('revokes sessions: logout and revoke-others invalidate tokens', async () => {
    const u = await registerUser(ctx.app, 'Sess');
    const second = (await ctx.app.inject({ method: 'POST', url: '/auth/login', remoteAddress: freshIp(), payload: { email: u.email, password: 'correct horse battery staple', client: 'mobile' } })).json().token as string;
    const list = await u.call({ method: 'GET', url: '/auth/sessions' });
    expect(list.json().sessions).toHaveLength(2);

    const revoked = await u.call({ method: 'POST', url: '/auth/sessions/revoke-others' });
    expect(revoked.json().revoked).toBe(1);
    const stale = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${second}` } });
    expect(stale.statusCode).toBe(401);

    await u.call({ method: 'POST', url: '/auth/logout' });
    expect((await u.call({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const u = await registerUser(ctx.app, 'Expire');
    await ctx.handle.pool.query("update sessions set expires_at = now() - interval '1 minute' where user_id = $1", [u.id]);
    expect((await u.call({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
  });

  it('web cookie sessions require the CSRF header and an allowed origin on mutations', async () => {
    const email = `cookie-${Date.now()}@example.test`;
    const reg = await ctx.app.inject({ method: 'POST', url: '/auth/register', remoteAddress: freshIp(), payload: { email, password: 'correct horse battery staple', displayName: 'Cookie' } });
    const setCookie = String(reg.headers['set-cookie']);
    expect(setCookie).toMatch(/friday_session=.*HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(reg.json().token).toBeUndefined();
    const cookie = setCookie.split(';')[0]!;

    const noHeader = await ctx.app.inject({ method: 'POST', url: '/tasks', headers: { cookie }, payload: { title: 'x' } });
    expect(noHeader.statusCode).toBe(403);
    const badOrigin = await ctx.app.inject({ method: 'POST', url: '/tasks', headers: { cookie, 'x-friday-csrf': '1', origin: 'https://evil.example' }, payload: { title: 'x' } });
    expect(badOrigin.statusCode).toBe(403);
    const good = await ctx.app.inject({ method: 'POST', url: '/tasks', headers: { cookie, 'x-friday-csrf': '1', origin: 'http://localhost:3000' }, payload: { title: 'x' } });
    expect(good.statusCode).toBe(201);
    const read = await ctx.app.inject({ method: 'GET', url: '/tasks', headers: { cookie } });
    expect(read.statusCode).toBe(200);
  });

  it('deletes the account and all its data after password confirmation', async () => {
    const u = await registerUser(ctx.app, 'Leaver');
    await u.call({ method: 'POST', url: '/tasks', payload: { title: 'to be deleted' } });
    const wrong = await u.call({ method: 'POST', url: '/account/delete', payload: { password: 'nope', confirm: 'DELETE' } });
    expect(wrong.statusCode).toBe(401);
    const ok = await u.call({ method: 'POST', url: '/account/delete', payload: { password: 'correct horse battery staple', confirm: 'DELETE' } });
    expect(ok.statusCode).toBe(200);
    const rows = await ctx.handle.pool.query('select count(*)::int as n from tasks where user_id = $1', [u.id]);
    expect(rows.rows[0].n).toBe(0);
    expect((await u.call({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
  });
});

describe('hardening', () => {
  it('sets security headers and request ids', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it('rejects oversized bodies', async () => {
    const u = await registerUser(ctx.app, 'Big');
    const r = await u.call({ method: 'POST', url: '/notes', payload: { title: 'big', body: 'x'.repeat(70_000) } });
    expect(r.statusCode).toBe(413);
  });

  it('treats malformed ids as not found without leaking database errors', async () => {
    const u = await registerUser(ctx.app, 'Malformed');
    const r = await u.call({ method: 'GET', url: '/tasks/not-a-uuid' });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toMatch(/syntax|postgres|uuid/i);
  });

  it('denies CORS for unknown origins', async () => {
    const r = await ctx.app.inject({ method: 'OPTIONS', url: '/tasks', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});
