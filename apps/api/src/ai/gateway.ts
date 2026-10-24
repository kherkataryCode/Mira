import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { aiUsage } from '../db/schema.js';
import { AiError, USER_MESSAGES, type ChatTurn, type GatewayProviderId, type ProviderAdapter } from './types.js';
import { createDemoAdapter, type AssistantContext } from './providers/demo.js';

export interface GenerateOptions {
  userId: string | null;
  purpose: 'chat' | 'brief' | 'test';
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal: AbortSignal;
  providerOrder: GatewayProviderId[];
  userMonthlyBudgetUsd: number;
  perProviderBudgetUsd?: Partial<Record<GatewayProviderId, number>>;
  onText?: (text: string) => void;
  context?: AssistantContext;
}

export interface GenerateResult {
  text: string;
  provider: GatewayProviderId;
  model: string;
  demo: boolean;
  usage: { input: number; output: number; costUsd: number };
}

interface Breaker {
  failures: number;
  openUntil: number;
}

export interface GatewayOptions {
  db: Db;
  adapters: ProviderAdapter[];
  demoMode: boolean;
  maxAttempts: number;
  globalMonthlyBudgetUsd: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const MAX_BACKOFF_MS = 8_000;

export class AiGateway {
  private readonly adapters = new Map<GatewayProviderId, ProviderAdapter>();
  private readonly breakers = new Map<GatewayProviderId, Breaker>();
  private readonly demo: ProviderAdapter;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: GatewayOptions) {
    for (const a of opts.adapters) this.adapters.set(a.id, a);
    this.demo = createDemoAdapter();
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  get usingDemo(): boolean {
    return this.opts.demoMode || this.adapters.size === 0;
  }

  /** Public, secret-free description of configured providers. */
  describe() {
    return {
      demo: this.usingDemo,
      providers: [...this.adapters.values()].map((a) => ({
        id: a.id,
        model: a.model,
        circuitOpen: (this.breakers.get(a.id)?.openUntil ?? 0) > this.now(),
      })),
    };
  }

  private chain(order: GatewayProviderId[]): ProviderAdapter[] {
    if (this.usingDemo) return [this.demo];
    const seen = new Set<GatewayProviderId>();
    const list: ProviderAdapter[] = [];
    for (const id of [...order, ...this.adapters.keys()]) {
      const a = this.adapters.get(id);
      if (a && !seen.has(id)) {
        seen.add(id);
        list.push(a);
      }
    }
    return list;
  }

  private async monthSpend(userId: string | null, provider?: GatewayProviderId): Promise<number> {
    const monthStart = new Date(this.now());
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const conds = [gte(aiUsage.createdAt, monthStart)];
    if (userId) conds.push(eq(aiUsage.userId, userId));
    if (provider) conds.push(eq(aiUsage.provider, provider));
    const [row] = await this.opts.db
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(and(...conds));
    return Number(row?.total ?? 0);
  }

  private async record(
    userId: string | null,
    adapter: ProviderAdapter,
    model: string,
    purpose: string,
    outcome: 'ok' | 'error' | 'cancelled',
    usage: { input: number; output: number },
    latencyMs: number,
    errorClass?: string,
  ): Promise<number> {
    const costUsd = (usage.input * adapter.pricing.input + usage.output * adapter.pricing.output) / 1_000_000;
    if (adapter.id === 'demo') return 0;
    await this.opts.db.insert(aiUsage).values({
      userId,
      provider: adapter.id,
      model,
      purpose,
      tokensIn: usage.input,
      tokensOut: usage.output,
      costUsd,
      outcome,
      errorClass: errorClass ?? null,
      latencyMs,
    });
    return costUsd;
  }

  private tripBreaker(id: GatewayProviderId, err: AiError) {
    if (!['transient', 'rate_limit', 'auth', 'quota'].includes(err.kind)) return;
    const b = this.breakers.get(id) ?? { failures: 0, openUntil: 0 };
    b.failures += 1;
    if (b.failures >= BREAKER_THRESHOLD) {
      b.openUntil = this.now() + BREAKER_COOLDOWN_MS;
      b.failures = 0;
    }
    this.breakers.set(id, b);
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const chain = this.chain(opts.providerOrder);
    if (!this.usingDemo) {
      if ((await this.monthSpend(null)) >= this.opts.globalMonthlyBudgetUsd) {
        throw new AiError('unavailable', USER_MESSAGES.unavailable);
      }
      if (opts.userId && (await this.monthSpend(opts.userId)) >= opts.userMonthlyBudgetUsd) {
        throw new AiError('budget', USER_MESSAGES.budget);
      }
    }

    let lastError: AiError = new AiError('unavailable', USER_MESSAGES.unavailable);
    for (const adapter of chain) {
      if ((this.breakers.get(adapter.id)?.openUntil ?? 0) > this.now()) continue;
      const cap = opts.perProviderBudgetUsd?.[adapter.id];
      if (cap !== undefined && opts.userId && (await this.monthSpend(opts.userId, adapter.id)) >= cap) continue;

      for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
        if (opts.signal.aborted) throw new AiError('cancelled', USER_MESSAGES.cancelled);
        const started = this.now();
        let text = '';
        try {
          let usage = { input: 0, output: 0 };
          let model = adapter.model;
          for await (const ev of adapter.stream({ system: opts.system, messages: opts.messages, maxTokens: opts.maxTokens, signal: opts.signal, context: opts.context })) {
            if (ev.type === 'text') {
              text += ev.text;
              opts.onText?.(ev.text);
            } else {
              usage = ev.usage;
              model = ev.model;
            }
          }
          const costUsd = await this.record(opts.userId, adapter, model, opts.purpose, 'ok', usage, this.now() - started);
          this.breakers.delete(adapter.id);
          return { text, provider: adapter.id, model, demo: adapter.id === 'demo', usage: { ...usage, costUsd } };
        } catch (raw) {
          const err = raw instanceof AiError ? raw : new AiError('transient', USER_MESSAGES.transient, undefined, adapter.id);
          await this.record(opts.userId, adapter, adapter.model, opts.purpose, err.kind === 'cancelled' ? 'cancelled' : 'error', { input: 0, output: 0 }, this.now() - started, err.kind);
          if (err.kind === 'cancelled') throw err;
          this.tripBreaker(adapter.id, err);
          lastError = err;
          // Never replay after partial output: the user already saw it, and a retry could duplicate.
          if (text.length > 0) throw err;
          if (!err.retryable || attempt === this.opts.maxAttempts) break;
          const backoff = Math.min(MAX_BACKOFF_MS, err.retryAfterMs ?? 500 * 2 ** (attempt - 1) + Math.random() * 250);
          if (err.retryAfterMs !== undefined && err.retryAfterMs > MAX_BACKOFF_MS) break; // too long to wait inline; fall back instead
          await this.sleep(backoff);
        }
      }
      if (!lastError.canFallback) throw lastError;
    }
    throw lastError;
  }
}
