import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, ndjson, registerUser, type TestContext, type TestUser } from './helpers.js';
import { scripted } from './fake-providers.js';

let ctx: TestContext;
let u: TestUser;
const anthropic = scripted('anthropic', [{ text: 'Sure thing' }, { fail: 'transient' }, { fail: 'transient' }, { text: 'Recovered reply' }]);

beforeAll(async () => {
  ctx = await createTestApp({ env: { DEMO_MODE: 'false' }, adapters: [anthropic] });
  u = await registerUser(ctx.app, 'Chatter');
});
afterAll(async () => closeTestApp(ctx));

describe('chat', () => {
  let conversationId = '';
  let failedId = '';

  it('streams a reply and persists both messages', async () => {
    const res = await u.call({ method: 'POST', url: '/chat/send', payload: { content: 'Hello Mira', clientMessageId: 'chat-test-0001' } });
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const events = ndjson(res.body);
    expect(events[0]!.type).toBe('meta');
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe('Sure thing ');
    expect(events.at(-1)).toMatchObject({ type: 'done', provider: 'anthropic' });
    conversationId = events[0]!.conversationId!;
    const convo = (await u.call({ method: 'GET', url: `/chat/conversations/${conversationId}` })).json();
    expect(convo.messages.map((m: { role: string; status: string }) => `${m.role}:${m.status}`)).toEqual(['user:complete', 'assistant:complete']);
  });

  it('does not store a resent message twice', async () => {
    const res = await u.call({ method: 'POST', url: '/chat/send', payload: { conversationId, content: 'Hello Mira', clientMessageId: 'chat-test-0001' } });
    expect(res.statusCode).toBe(409);
  });

  it('reports provider failures as a recoverable error and persists it', async () => {
    const res = await u.call({ method: 'POST', url: '/chat/send', payload: { conversationId, content: 'Second', clientMessageId: 'chat-test-0002' } });
    const events = ndjson(res.body);
    const err = events.at(-1)!;
    expect(err).toMatchObject({ type: 'error', code: 'transient' });
    failedId = events[0]!.assistantMessageId!;
    const convo = (await u.call({ method: 'GET', url: `/chat/conversations/${conversationId}` })).json();
    const failed = convo.messages.find((m: { id: string }) => m.id === failedId);
    expect(failed.status).toBe('error');
    // The user's message was not dropped.
    expect(convo.messages.some((m: { content: string }) => m.content === 'Second')).toBe(true);
  });

  it('retries a failed reply in place', async () => {
    const res = await u.call({ method: 'POST', url: `/chat/messages/${failedId}/retry` });
    const events = ndjson(res.body);
    expect(events.at(-1)!.type).toBe('done');
    const convo = (await u.call({ method: 'GET', url: `/chat/conversations/${conversationId}` })).json();
    const retried = convo.messages.find((m: { id: string }) => m.id === failedId);
    expect(retried.status).toBe('complete');
    expect(retried.content).toContain('Recovered reply');
  });

  it('returns deterministic proposals and never auto-creates tasks', async () => {
    const res = await u.call({ method: 'POST', url: '/chat/send', payload: { content: 'Remind me to call the dentist tomorrow at 5 PM', clientMessageId: 'chat-test-0003' } });
    const meta = ndjson(res.body)[0]!;
    expect(meta.proposals?.[0]).toMatchObject({ kind: 'reminder', title: 'Call the dentist' });
    const reminders = (await u.call({ method: 'GET', url: '/reminders' })).json().reminders;
    expect(reminders).toHaveLength(0);
  });

  it('validates input', async () => {
    expect((await u.call({ method: 'POST', url: '/chat/send', payload: { content: '', clientMessageId: 'chat-test-0004' } })).statusCode).toBe(400);
    expect((await u.call({ method: 'POST', url: '/chat/send', payload: { content: 'x'.repeat(4001), clientMessageId: 'chat-test-0005' } })).statusCode).toBe(400);
  });
});

describe('chat cancellation', () => {
  it('persists a cancelled reply when the client aborts via the cancel endpoint', async () => {
    const slow = scripted('anthropic', [{ text: 'a b c d e f g h i j', slowMs: 40 }]);
    const c2 = await createTestApp({ env: { DEMO_MODE: 'false' }, adapters: [slow] });
    const user = await registerUser(c2.app, 'Canceller');
    const pending = user.call({ method: 'POST', url: '/chat/send', payload: { content: 'long please', clientMessageId: 'cancel-test-0001' } });
    await new Promise((r) => setTimeout(r, 120));
    const { rows } = await c2.handle.pool.query("select id from messages where user_id = $1 and role = 'assistant'", [user.id]);
    const cancel = await user.call({ method: 'POST', url: `/chat/messages/${rows[0].id}/cancel` });
    expect(cancel.json().cancelled).toBe(true);
    const events = ndjson((await pending).body);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'cancelled', partial: true });
    const after = await c2.handle.pool.query('select status from messages where id = $1', [rows[0].id]);
    expect(after.rows[0].status).toBe('cancelled');
    await closeTestApp(c2);
  });
});
