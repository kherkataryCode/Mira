import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../db/client.js';
import { AiGateway } from '../ai/gateway.js';
import { AiError, classifyStatus, parseRetryAfter } from '../ai/types.js';
import { TEST_DATABASE_URL } from './helpers.js';
import { scripted } from './fake-providers.js';

let handle: DbHandle;
beforeAll(() => {
  handle = createDb({ url: TEST_DATABASE_URL, ssl: false, max: 2 });
});
afterAll(async () => handle.close());

const sleeps: number[] = [];
function gateway(adapters: ReturnType<typeof scripted>[], extra: Partial<ConstructorParameters<typeof AiGateway>[0]> = {}) {
  return new AiGateway({ db: handle.db, adapters, demoMode: false, maxAttempts: 3, globalMonthlyBudgetUsd: 1000, sleep: async (ms) => void sleeps.push(ms), ...extra });
}
const base = { userId: null, purpose: 'test' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 50, userMonthlyBudgetUsd: 1000 };
const run = (g: AiGateway, order: ('anthropic' | 'openai' | 'moonshot')[] = ['anthropic', 'openai', 'moonshot']) =>
  g.generate({ ...base, signal: new AbortController().signal, providerOrder: order });

describe('error classification', () => {
  it('maps statuses and hints', () => {
    expect(classifyStatus(401)).toBe('auth');
    expect(classifyStatus(429)).toBe('rate_limit');
    expect(classifyStatus(429, 'insufficient_quota')).toBe('quota');
    expect(classifyStatus(400, 'Your credit balance is too low')).toBe('quota');
    expect(classifyStatus(404)).toBe('model_unavailable');
    expect(classifyStatus(529)).toBe('transient');
    expect(classifyStatus(undefined)).toBe('transient');
    expect(classifyStatus(422)).toBe('invalid_request');
    expect(parseRetryAfter(new Headers({ 'retry-after': '3' }))).toBe(3000);
  });
});

describe('AiGateway', () => {
  it('retries transient failures with backoff, then succeeds', async () => {
    sleeps.length = 0;
    const a = scripted('anthropic', [{ fail: 'transient' }, { text: 'ok now' }]);
    const res = await run(gateway([a]));
    expect(res.text.trim()).toBe('ok now');
    expect(a.calls).toBe(2);
    expect(sleeps).toHaveLength(1);
  });

  it('honours Retry-After on rate limits', async () => {
    sleeps.length = 0;
    const a = scripted('anthropic', [{ fail: 'rate_limit', retryAfterMs: 1234 }, { text: 'ok' }]);
    await run(gateway([a]));
    expect(sleeps[0]).toBe(1234);
  });

  it('does not retry auth errors on the same provider but falls back', async () => {
    const a = scripted('anthropic', [{ fail: 'auth' }]);
    const o = scripted('openai', [{ text: 'from openai' }]);
    const res = await run(gateway([a, o]));
    expect(a.calls).toBe(1);
    expect(res.provider).toBe('openai');
  });

  it('respects the user provider order', async () => {
    const a = scripted('anthropic', [{ text: 'a' }]);
    const o = scripted('openai', [{ text: 'o' }]);
    const res = await run(gateway([a, o]), ['openai', 'anthropic']);
    expect(res.provider).toBe('openai');
    expect(a.calls).toBe(0);
  });

  it('never falls back or retries on invalid requests', async () => {
    const a = scripted('anthropic', [{ fail: 'invalid_request' }]);
    const o = scripted('openai', [{ text: 'o' }]);
    await expect(run(gateway([a, o]))).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(o.calls).toBe(0);
  });

  it('does not replay after partial output', async () => {
    const a = scripted('anthropic', [{ partialThenFail: 'transient' }, { text: 'second' }]);
    const o = scripted('openai', [{ text: 'o' }]);
    await expect(run(gateway([a, o]))).rejects.toBeInstanceOf(AiError);
    expect(a.calls).toBe(1);
    expect(o.calls).toBe(0);
  });

  it('bounds attempts and surfaces the last error when everything fails', async () => {
    const a = scripted('anthropic', [{ fail: 'transient' }]);
    const o = scripted('openai', [{ fail: 'quota' }]);
    await expect(run(gateway([a, o]))).rejects.toMatchObject({ kind: 'quota' });
    expect(a.calls).toBe(3);
    expect(o.calls).toBe(1);
  });

  it('opens a circuit breaker after repeated failures', async () => {
    let now = 1_000_000;
    const a = scripted('anthropic', [{ fail: 'transient' }]);
    const o = scripted('openai', [{ text: 'o' }]);
    const g = gateway([a, o], { maxAttempts: 1, now: () => now });
    for (let i = 0; i < 3; i++) await run(g);
    const callsBefore = a.calls;
    await run(g);
    expect(a.calls).toBe(callsBefore); // skipped while open
    now += 61_000;
    await run(g);
    expect(a.calls).toBe(callsBefore + 1);
  });

  it('enforces the global budget', async () => {
    const a = scripted('anthropic', [{ text: 'x' }]);
    await expect(run(gateway([a], { globalMonthlyBudgetUsd: 0 }))).rejects.toMatchObject({ kind: 'unavailable' });
    expect(a.calls).toBe(0);
  });

  it('cancels promptly and records the cancellation', async () => {
    const a = scripted('anthropic', [{ text: 'one two three four five', slowMs: 50 }]);
    const ctl = new AbortController();
    const p = gateway([a]).generate({ ...base, signal: ctl.signal, providerOrder: ['anthropic'] });
    setTimeout(() => ctl.abort(), 60);
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('uses the demo provider when no keys are configured', async () => {
    const g = new AiGateway({ db: handle.db, adapters: [], demoMode: false, maxAttempts: 1, globalMonthlyBudgetUsd: 0 });
    const res = await g.generate({ ...base, signal: new AbortController().signal, providerOrder: [] });
    expect(res.demo).toBe(true);
    expect(res.text).toMatch(/^Demo mode/);
  });
});
