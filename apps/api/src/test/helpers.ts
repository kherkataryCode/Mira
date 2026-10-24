import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { createDb, type DbHandle } from '../db/client.js';
import { seedLessons } from '../db/seed.js';
import { AiGateway } from '../ai/gateway.js';
import type { ProviderAdapter } from '../ai/types.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://friday:friday@localhost:5432/friday_test';

export interface TestContext {
  app: FastifyInstance;
  handle: DbHandle;
  config: Config;
}

export async function createTestApp(opts: { env?: Record<string, string>; adapters?: ProviderAdapter[] } = {}): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    WEB_ORIGINS: 'http://localhost:3000',
    DEMO_MODE: 'true',
    ...opts.env,
  });
  const handle = createDb({ url: TEST_DATABASE_URL, ssl: false, max: 5 });
  await seedLessons(handle.db);
  const ai = opts.adapters
    ? new AiGateway({ db: handle.db, adapters: opts.adapters, demoMode: false, maxAttempts: 2, globalMonthlyBudgetUsd: 100, sleep: async () => {} })
    : undefined;
  const app = await buildApp({ config, db: handle.db, ai });
  await app.ready();
  return { app, handle, config };
}

export async function closeTestApp(ctx: TestContext) {
  await ctx.app.close();
  await ctx.handle.close();
}

let ipCounter = 1;
/** Each call gets its own client IP so per-IP rate limits don't couple unrelated tests. */
export function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  call: (opts: InjectOptions) => Promise<InjectResponse>;
}

export async function registerUser(app: FastifyInstance, name = 'Tester'): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: { 'x-friday-client': 'mobile' },
    remoteAddress: freshIp(),
    payload: { email, password: 'correct horse battery staple', displayName: name },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const body = res.json() as { user: { id: string }; token: string };
  const token = body.token;
  return {
    id: body.user.id,
    email,
    token,
    call: (opts) =>
      app.inject({
        remoteAddress: freshIp(),
        ...opts,
        headers: { authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      } as InjectOptions) as Promise<InjectResponse>,
  };
}

/** A chat stream event as seen by tests (union of all event fields). */
export interface StreamEvent {
  type: 'meta' | 'delta' | 'done' | 'error';
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  proposals?: { kind: string; title: string }[];
  text?: string;
  provider?: string;
  code?: string;
  partial?: boolean;
}

/** Parses an NDJSON chat stream body into events. */
export function ndjson(body: string): StreamEvent[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
}
