import { assertPublicHttpsUrl } from '../../util/safe-fetch.js';
import { AiError, USER_MESSAGES, classifyStatus, type ProviderAdapter, type StreamEvent } from '../types.js';

/**
 * Optional OpenClaw integration (disabled by default).
 *
 * Contract (documented in docs/OPENCLAW.md): POST {url} with a bearer token and
 * {system, messages, max_tokens}; it must return {text: string}. OpenClaw is used
 * for text generation only — it is given NO tools, no shell/filesystem/network
 * capabilities from Mira, and its output is treated as untrusted text. Any action it
 * suggests still goes through Mira's deterministic proposal + user confirmation flow.
 * Fails closed: non-HTTPS or private-network endpoints are rejected.
 */
export function createOpenClawAdapter(opts: { url: string; token: string; timeoutMs: number }): ProviderAdapter {
  return {
    id: 'openclaw',
    model: 'openclaw',
    pricing: { input: 0, output: 0 },
    async *stream(req): AsyncGenerator<StreamEvent> {
      let url: URL;
      try {
        url = await assertPublicHttpsUrl(opts.url);
      } catch {
        throw new AiError('auth', 'OpenClaw endpoint is configured insecurely and was blocked.', undefined, 'openclaw');
      }
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(opts.timeoutMs)]);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
          body: JSON.stringify({ system: req.system, messages: req.messages, max_tokens: req.maxTokens }),
          signal,
        });
      } catch {
        if (req.signal.aborted) throw new AiError('cancelled', USER_MESSAGES.cancelled, undefined, 'openclaw');
        throw new AiError('transient', USER_MESSAGES.transient, undefined, 'openclaw');
      }
      if (!res.ok) {
        const kind = classifyStatus(res.status);
        throw new AiError(kind, USER_MESSAGES[kind], undefined, 'openclaw');
      }
      const raw = await res.text();
      if (raw.length > 100_000) throw new AiError('invalid_request', 'OpenClaw response too large', undefined, 'openclaw');
      let text: unknown;
      try {
        text = (JSON.parse(raw) as { text?: unknown }).text;
      } catch {
        text = undefined;
      }
      if (typeof text !== 'string') throw new AiError('invalid_request', 'OpenClaw returned an unexpected response', undefined, 'openclaw');
      yield { type: 'text', text: text.slice(0, 20_000) };
      yield { type: 'done', usage: { input: 0, output: 0 }, model: 'openclaw' };
    },
  };
}
