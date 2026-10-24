import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { createGateway, type AiGateway } from './ai/index.js';
import { CSRF_HEADER, registerAuth } from './auth/plugin.js';
import { HttpError } from './util/errors.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { reminderRoutes } from './routes/reminders.js';
import { chatRoutes } from './routes/chat.js';
import { learningRoutes } from './routes/learning.js';
import { newsRoutes } from './routes/news.js';
import { noteRoutes } from './routes/notes.js';
import { homeRoutes } from './routes/home.js';
import { settingsRoutes } from './routes/settings.js';
import { healthRoutes } from './routes/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    ai: AiGateway;
  }
}

export interface AppDeps {
  config: Config;
  db: Db;
  ai?: AiGateway;
}

export async function buildApp({ config, db, ai }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.token', '*.apiKey'],
              censor: '[REDACTED]',
            },
          },
    // Trust exactly N proxy hops so a client cannot spoof its IP via X-Forwarded-For.
    trustProxy: config.TRUST_PROXY_HOPS > 0 ? (_addr: string, hop: number) => hop < config.TRUST_PROXY_HOPS : false,
    bodyLimit: 64 * 1024,
    requestTimeout: 120_000,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
  });

  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('ai', ai ?? createGateway(config, db));

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.webOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', CSRF_HEADER, 'x-friday-client', 'x-request-id'],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'rate_limited',
      message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
    }),
  });

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Reject malformed resource ids before they reach the database.
  app.addHook('preValidation', async (req, reply) => {
    const id = (req.params as { id?: unknown } | undefined)?.id;
    if (typeof id === 'string' && !UUID.test(id)) {
      return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    }
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    const e = err as { statusCode?: number; code?: string; message?: string; cause?: { code?: string } };
    const pgCode = e.cause?.code ?? e.code;
    if (e.statusCode === 429) return reply.code(429).send(err);
    // Malformed UUIDs and similar bad input reaching Postgres.
    if (pgCode === '22P02') return reply.code(404).send({ error: 'not_found', message: 'Resource not found' });
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'too_large', message: 'Request body too large' });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: 'bad_request', message: 'Invalid request' });
    }
    req.log.error({ err: { message: e.message, code: e.code } }, 'unhandled error');
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong', requestId: req.id });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found', message: 'Route not found' }));

  registerAuth(app);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(homeRoutes);
  await app.register(taskRoutes);
  await app.register(reminderRoutes);
  await app.register(chatRoutes);
  await app.register(learningRoutes);
  await app.register(newsRoutes);
  await app.register(noteRoutes);
  await app.register(settingsRoutes);
  return app;
}
