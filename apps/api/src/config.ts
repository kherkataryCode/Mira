import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL'),
    DATABASE_SSL: bool(false),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    /** Comma-separated browser origins allowed to call the API directly (CORS). */
    WEB_ORIGINS: z.string().default('http://localhost:3000'),
    COOKIE_SECURE: bool(false),
    /** Number of trusted reverse-proxy hops in front of the API (0 = use the socket address). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Global per-IP request limit per minute. */
    RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).max(100000).default(300),
    /** Per-IP limit for login/register attempts per minute. */
    AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(10),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    ALLOW_REGISTRATION: bool(true),
    OWNER_EMAIL: optionalStr,
    DEMO_MODE: bool(false),

    ANTHROPIC_API_KEY: optionalStr,
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
    ANTHROPIC_INPUT_USD_PER_MTOK: z.coerce.number().min(0).default(4),
    ANTHROPIC_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).default(20),
    OPENAI_API_KEY: optionalStr,
    OPENAI_MODEL: optionalStr,
    OPENAI_INPUT_USD_PER_MTOK: z.coerce.number().min(0).default(0),
    OPENAI_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).default(0),
    MOONSHOT_API_KEY: optionalStr,
    MOONSHOT_MODEL: optionalStr,
    MOONSHOT_BASE_URL: z.url().default('https://api.moonshot.ai/v1'),
    MOONSHOT_INPUT_USD_PER_MTOK: z.coerce.number().min(0).default(0),
    MOONSHOT_OUTPUT_USD_PER_MTOK: z.coerce.number().min(0).default(0),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
    AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
    AI_GLOBAL_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(20),

    OPENCLAW_ENABLED: bool(false),
    OPENCLAW_URL: optionalStr,
    OPENCLAW_TOKEN: optionalStr,

    PUSH_ENABLED: bool(false),
    EXPO_ACCESS_TOKEN: optionalStr,
  })
  .superRefine((env, ctx) => {
    if (env.OPENAI_API_KEY && !env.OPENAI_MODEL) {
      ctx.addIssue({ code: 'custom', path: ['OPENAI_MODEL'], message: 'Set OPENAI_MODEL when OPENAI_API_KEY is set' });
    }
    if (env.MOONSHOT_API_KEY && !env.MOONSHOT_MODEL) {
      ctx.addIssue({ code: 'custom', path: ['MOONSHOT_MODEL'], message: 'Set MOONSHOT_MODEL when MOONSHOT_API_KEY is set' });
    }
    if (env.OPENCLAW_ENABLED && (!env.OPENCLAW_URL || !env.OPENCLAW_TOKEN)) {
      ctx.addIssue({ code: 'custom', path: ['OPENCLAW_URL'], message: 'OPENCLAW_URL and OPENCLAW_TOKEN are required when OPENCLAW_ENABLED=true' });
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
    }
  });

export type Config = z.infer<typeof envSchema> & { webOrigins: string[] };

/** Validates environment at startup; fails fast without echoing secret values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const webOrigins = parsed.data.WEB_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return { ...parsed.data, webOrigins };
}
