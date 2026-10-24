import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, registerUser, type TestContext, type TestUser } from './helpers.js';

let ctx: TestContext;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  ctx = await createTestApp({ env: { OWNER_EMAIL: 'owner@example.test' } });
  alice = await registerUser(ctx.app, 'Alice');
  bob = await registerUser(ctx.app, 'Bob');
});
afterAll(async () => closeTestApp(ctx));

const future = () => new Date(Date.now() + 86_400_000).toISOString();

describe('data isolation between two users', () => {
  it('tasks', async () => {
    const t = (await alice.call({ method: 'POST', url: '/tasks', payload: { title: 'Alice private task' } })).json().task;
    expect((await bob.call({ method: 'GET', url: `/tasks/${t.id}` })).statusCode).toBe(404);
    expect((await bob.call({ method: 'PATCH', url: `/tasks/${t.id}`, payload: { title: 'pwned' } })).statusCode).toBe(404);
    expect((await bob.call({ method: 'DELETE', url: `/tasks/${t.id}` })).statusCode).toBe(404);
    const bobList = (await bob.call({ method: 'GET', url: '/tasks?status=all' })).json().tasks;
    expect(bobList.find((x: { id: string }) => x.id === t.id)).toBeUndefined();
    expect((await alice.call({ method: 'GET', url: `/tasks/${t.id}` })).json().task.title).toBe('Alice private task');
  });

  it('cannot attach to another user\'s project', async () => {
    const p = (await alice.call({ method: 'POST', url: '/projects', payload: { name: 'Secret' } })).json().project;
    const r = await bob.call({ method: 'POST', url: '/tasks', payload: { title: 'x', projectId: p.id } });
    expect(r.statusCode).toBe(400);
  });

  it('reminders', async () => {
    const r = (await alice.call({ method: 'POST', url: '/reminders', payload: { title: 'A', remindAt: future() } })).json().reminder;
    for (const path of ['snooze', 'dismiss', 'complete']) {
      const res = await bob.call({ method: 'POST', url: `/reminders/${r.id}/${path}`, payload: path === 'snooze' ? { minutes: 5 } : {} });
      expect(res.statusCode).toBe(404);
    }
    expect((await bob.call({ method: 'DELETE', url: `/reminders/${r.id}` })).statusCode).toBe(404);
  });

  it('notes', async () => {
    const n = (await alice.call({ method: 'POST', url: '/notes', payload: { title: 'Diary', body: 'secret' } })).json().note;
    expect((await bob.call({ method: 'PATCH', url: `/notes/${n.id}`, payload: { body: 'x' } })).statusCode).toBe(404);
    const search = (await bob.call({ method: 'GET', url: '/notes?q=secret' })).json().notes;
    expect(search).toHaveLength(0);
  });

  it('conversations', async () => {
    const res = await alice.call({ method: 'POST', url: '/chat/send', payload: { content: 'hello', clientMessageId: 'iso-test-00001' } });
    const conversationId = res.body.split('\n').filter(Boolean).map((l) => JSON.parse(l))[0].conversationId;
    expect((await bob.call({ method: 'GET', url: `/chat/conversations/${conversationId}` })).statusCode).toBe(404);
    const hijack = await bob.call({ method: 'POST', url: '/chat/send', payload: { conversationId, content: 'hi', clientMessageId: 'iso-test-00002' } });
    expect(hijack.statusCode).toBe(404);
  });

  it('export contains only the requesting user\'s data', async () => {
    const exp = (await bob.call({ method: 'GET', url: '/account/export' })).json();
    expect(exp.user.id).toBe(bob.id);
    const json = JSON.stringify(exp);
    expect(json).not.toContain('Alice private task');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('tokenHash');
  });

  it('cannot revoke another user\'s session', async () => {
    const sessions = (await alice.call({ method: 'GET', url: '/auth/sessions' })).json().sessions;
    expect((await bob.call({ method: 'DELETE', url: `/auth/sessions/${sessions[0].id}` })).statusCode).toBe(404);
  });

  it('system health is owner-only and contains no secrets', async () => {
    expect((await bob.call({ method: 'GET', url: '/system/health' })).statusCode).toBe(403);
    await ctx.handle.pool.query("update users set role = 'owner' where id = $1", [alice.id]);
    const h = await alice.call({ method: 'GET', url: '/system/health' });
    expect(h.statusCode).toBe(200);
    expect(h.body).not.toMatch(/postgres:\/\/|sk-|password/i);
    expect(h.json().disclaimer).toMatch(/not a guarantee/);
  });

  it('requires authentication everywhere', async () => {
    for (const url of ['/home', '/tasks', '/reminders', '/notes', '/news', '/learn/lessons', '/preferences', '/chat/conversations', '/account/export']) {
      expect((await ctx.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });
});
