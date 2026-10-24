import { AiError, USER_MESSAGES, type AiErrorKind, type GatewayProviderId, type ProviderAdapter, type StreamEvent } from '../ai/types.js';

export type Script = Array<{ fail?: AiErrorKind; retryAfterMs?: number; text?: string; partialThenFail?: AiErrorKind; slowMs?: number }>;

/** A provider that follows a script of outcomes, one per call. */
export function scripted(id: GatewayProviderId, script: Script): ProviderAdapter & { calls: number } {
  const adapter = {
    id,
    model: `${id}-test-model`,
    pricing: { input: 1, output: 2 },
    calls: 0,
    async *stream(req: { signal: AbortSignal }): AsyncGenerator<StreamEvent> {
      const step = script[Math.min(adapter.calls, script.length - 1)] ?? {};
      adapter.calls++;
      if (step.fail) throw new AiError(step.fail, USER_MESSAGES[step.fail], step.retryAfterMs, id);
      if (step.partialThenFail) {
        yield { type: 'text', text: 'partial ' };
        throw new AiError(step.partialThenFail, USER_MESSAGES[step.partialThenFail], undefined, id);
      }
      for (const word of (step.text ?? `hello from ${id}`).split(' ')) {
        if (step.slowMs) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, step.slowMs);
            req.signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new AiError('cancelled', USER_MESSAGES.cancelled, undefined, id));
            }, { once: true });
          });
        }
        yield { type: 'text', text: `${word} ` };
      }
      yield { type: 'done', usage: { input: 1000, output: 500 }, model: adapter.model };
    },
  };
  return adapter;
}
