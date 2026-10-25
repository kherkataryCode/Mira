import OpenAI from 'openai';
import { AiError, USER_MESSAGES, classifyStatus, parseRetryAfter, type GatewayProviderId, type GenerateRequest, type ProviderAdapter, type StreamEvent } from '../types.js';

export interface OpenAICompatibleOptions {
  id: Extract<GatewayProviderId, 'openai' | 'moonshot'>;
  apiKey: string;
  model: string;
  baseURL?: string | undefined;
  timeoutMs: number;
  pricing: { input: number; output: number };
}

/** OpenAI, and any OpenAI-compatible endpoint (Kimi/Moonshot, Groq, …) via the moonshot slot. */
export function createOpenAICompatibleAdapter(opts: OpenAICompatibleOptions): ProviderAdapter {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 0, timeout: opts.timeoutMs });

  const toAiError = (err: unknown): AiError => {
    if (err instanceof AiError) return err;
    if (err instanceof OpenAI.APIUserAbortError) return new AiError('cancelled', USER_MESSAGES.cancelled, undefined, opts.id);
    if (err instanceof OpenAI.APIConnectionError) return new AiError('transient', USER_MESSAGES.transient, undefined, opts.id);
    if (err instanceof OpenAI.APIError) {
      const kind = classifyStatus(err.status, `${err.code ?? ''} ${err.message}`);
      return new AiError(kind, USER_MESSAGES[kind], parseRetryAfter(err.headers), opts.id);
    }
    return new AiError('transient', USER_MESSAGES.transient, undefined, opts.id);
  };

  return {
    id: opts.id,
    model: opts.model,
    pricing: opts.pricing,
    async *stream(req: GenerateRequest): AsyncGenerator<StreamEvent> {
      try {
        const tokenLimit = opts.id === 'openai' ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens };
        // gpt-oss (e.g. on Groq) reasons before answering; keep it short so the answer fits the token limit.
        const reasoning = /gpt-oss/i.test(opts.model) ? { reasoning_effort: 'low' as const } : {};
        const stream = await client.chat.completions.create(
          {
            model: opts.model,
            stream: true,
            stream_options: { include_usage: true },
            messages: [{ role: 'system', content: req.system }, ...req.messages],
            ...tokenLimit,
            ...reasoning,
          },
          { signal: req.signal },
        );
        let usage = { input: 0, output: 0 };
        let model = opts.model;
        for await (const chunk of stream) {
          model = chunk.model || model;
          const text = chunk.choices[0]?.delta?.content;
          if (text) yield { type: 'text', text };
          if (chunk.usage) usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
        }
        yield { type: 'done', usage, model };
      } catch (err) {
        throw toAiError(err);
      }
    },
  };
}
