import type { ProviderId } from '@friday/shared';

export type GatewayProviderId = ProviderId | 'demo' | 'openclaw';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal: AbortSignal;
  /** Structured data for the demo provider only; never sent to external providers. */
  context?: import('./providers/demo.js').AssistantContext | undefined;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: { input: number; output: number }; model: string };

export interface ProviderAdapter {
  id: GatewayProviderId;
  model: string;
  /** USD per million tokens, used for budget estimates. */
  pricing: { input: number; output: number };
  stream(req: GenerateRequest): AsyncGenerator<StreamEvent>;
}

export type AiErrorKind =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'transient'
  | 'invalid_request'
  | 'model_unavailable'
  | 'refusal'
  | 'cancelled'
  | 'budget'
  | 'unavailable';

/** Normalised provider failure. `message` is safe to show to users. */
export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly provider?: GatewayProviderId,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'transient';
  }

  /** Whether trying a different provider makes sense. */
  get canFallback(): boolean {
    return !['invalid_request', 'cancelled', 'budget'].includes(this.kind);
  }
}

export const USER_MESSAGES: Record<AiErrorKind, string> = {
  auth: 'The AI provider rejected its credentials. The owner needs to check the API key.',
  quota: 'The AI provider quota or billing limit has been reached.',
  rate_limit: 'The AI provider is rate limiting requests. Please try again shortly.',
  transient: 'The AI provider is temporarily unavailable.',
  invalid_request: 'The request could not be processed.',
  model_unavailable: 'The configured AI model is not available.',
  refusal: 'The AI provider declined to answer this request.',
  cancelled: 'Generation was cancelled.',
  budget: 'Your AI budget for this month has been used up. Adjust it in Settings.',
  unavailable: 'AI is temporarily unavailable. Your data is safe — try again later.',
};

/** Maps an HTTP status (+ provider error code/message) to an error kind. */
export function classifyStatus(status: number | undefined, codeOrMessage = ''): AiErrorKind {
  const hint = codeOrMessage.toLowerCase();
  if (hint.includes('insufficient_quota') || hint.includes('credit balance') || hint.includes('billing')) return 'quota';
  if (status === undefined) return 'transient';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 404) return 'model_unavailable';
  if (status === 408 || status === 409) return 'transient';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'transient';
  return 'invalid_request';
}

export function parseRetryAfter(headers: Headers | undefined): number | undefined {
  const v = headers?.get('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(v);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
