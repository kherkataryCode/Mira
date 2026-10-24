import Anthropic from '@anthropic-ai/sdk';
import { AiError, USER_MESSAGES, classifyStatus, parseRetryAfter, type GenerateRequest, type ProviderAdapter, type StreamEvent } from '../types.js';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  timeoutMs: number;
  pricing: { input: number; output: number };
}

function toAiError(err: unknown): AiError {
  if (err instanceof Anthropic.APIUserAbortError) return new AiError('cancelled', USER_MESSAGES.cancelled, undefined, 'anthropic');
  if (err instanceof Anthropic.APIConnectionError) return new AiError('transient', USER_MESSAGES.transient, undefined, 'anthropic');
  if (err instanceof Anthropic.APIError) {
    const kind = classifyStatus(err.status, err.message);
    return new AiError(kind, USER_MESSAGES[kind], parseRetryAfter(err.headers), 'anthropic');
  }
  if (err instanceof AiError) return err;
  return new AiError('transient', USER_MESSAGES.transient, undefined, 'anthropic');
}

export function createAnthropicAdapter(opts: AnthropicOptions): ProviderAdapter {
  // The gateway owns retries/fallback, so the SDK's own retries are disabled.
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0, timeout: opts.timeoutMs });
  return {
    id: 'anthropic',
    model: opts.model,
    pricing: opts.pricing,
    async *stream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
      try {
        const stream = client.beta.messages.stream(
          {
            model: opts.model,
            max_tokens: req.maxTokens,
            system: req.system,
            messages: req.messages,
            output_config: { effort: opts.effort },
            // Server-side refusal fallback, routed by refusal category.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          },
          { signal: req.signal },
        );
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') throw new AiError('refusal', USER_MESSAGES.refusal, undefined, 'anthropic');
        yield {
          type: 'done',
          model: final.model,
          usage: { input: final.usage.input_tokens, output: final.usage.output_tokens },
        };
      } catch (err) {
        throw toAiError(err);
      }
    },
  };
}
