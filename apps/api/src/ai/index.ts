import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { AiGateway } from './gateway.js';
import { createAnthropicAdapter } from './providers/anthropic.js';
import { createOpenAICompatibleAdapter } from './providers/openai-compatible.js';
import { createOpenClawAdapter } from './providers/openclaw.js';
import type { ProviderAdapter } from './types.js';

export { AiGateway } from './gateway.js';
export { AiError, USER_MESSAGES } from './types.js';

export function createGateway(config: Config, db: Db): AiGateway {
  const adapters: ProviderAdapter[] = [];
  if (config.ANTHROPIC_API_KEY) {
    adapters.push(
      createAnthropicAdapter({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.ANTHROPIC_MODEL,
        effort: config.ANTHROPIC_EFFORT,
        timeoutMs: config.AI_TIMEOUT_MS,
        pricing: { input: config.ANTHROPIC_INPUT_USD_PER_MTOK, output: config.ANTHROPIC_OUTPUT_USD_PER_MTOK },
      }),
    );
  }
  if (config.OPENAI_API_KEY && config.OPENAI_MODEL) {
    adapters.push(
      createOpenAICompatibleAdapter({
        id: 'openai',
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        timeoutMs: config.AI_TIMEOUT_MS,
        pricing: { input: config.OPENAI_INPUT_USD_PER_MTOK, output: config.OPENAI_OUTPUT_USD_PER_MTOK },
      }),
    );
  }
  if (config.MOONSHOT_API_KEY && config.MOONSHOT_MODEL) {
    adapters.push(
      createOpenAICompatibleAdapter({
        id: 'moonshot',
        apiKey: config.MOONSHOT_API_KEY,
        model: config.MOONSHOT_MODEL,
        baseURL: config.MOONSHOT_BASE_URL,
        timeoutMs: config.AI_TIMEOUT_MS,
        pricing: { input: config.MOONSHOT_INPUT_USD_PER_MTOK, output: config.MOONSHOT_OUTPUT_USD_PER_MTOK },
      }),
    );
  }
  if (config.OPENCLAW_ENABLED && config.OPENCLAW_URL && config.OPENCLAW_TOKEN) {
    adapters.push(createOpenClawAdapter({ url: config.OPENCLAW_URL, token: config.OPENCLAW_TOKEN, timeoutMs: config.AI_TIMEOUT_MS }));
  }
  return new AiGateway({
    db,
    adapters,
    demoMode: config.DEMO_MODE,
    maxAttempts: config.AI_MAX_ATTEMPTS,
    globalMonthlyBudgetUsd: config.AI_GLOBAL_MONTHLY_BUDGET_USD,
  });
}
