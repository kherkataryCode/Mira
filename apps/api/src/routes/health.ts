import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { aiUsage, jobRuns } from '../db/schema.js';
import { pendingPushCount } from '../services/reminders.js';

export const WORKER_JOBS = ['heartbeat', 'reminders.dispatch', 'push.send', 'news.collect', 'briefs.generate', 'briefings.chat', 'cleanup'] as const;

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', { logLevel: 'warn', config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  app.get('/health/ready', { logLevel: 'warn', config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', component: 'database' });
    }
  });

  /** Owner-only, read-only operational snapshot. Contains no secrets or user content. */
  app.get('/system/health', { preHandler: [app.authenticate, app.requireOwner] }, async () => {
    const started = Date.now();
    let dbOk = true;
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      dbOk = false;
    }
    const dbLatencyMs = Date.now() - started;
    const since = new Date(Date.now() - 86_400_000);

    const jobs = await Promise.all(
      WORKER_JOBS.map(async (job) => {
        const [lastSuccess] = await app.db
          .select({ at: jobRuns.finishedAt, detail: jobRuns.detail })
          .from(jobRuns)
          .where(and(eq(jobRuns.job, job), eq(jobRuns.status, 'succeeded')))
          .orderBy(desc(jobRuns.startedAt))
          .limit(1);
        const [lastFailure] = await app.db
          .select({ at: jobRuns.startedAt, error: jobRuns.error })
          .from(jobRuns)
          .where(and(eq(jobRuns.job, job), eq(jobRuns.status, 'failed')))
          .orderBy(desc(jobRuns.startedAt))
          .limit(1);
        const [failures] = await app.db
          .select({ n: sql<number>`count(*)::int` })
          .from(jobRuns)
          .where(and(eq(jobRuns.job, job), eq(jobRuns.status, 'failed'), gte(jobRuns.startedAt, since)));
        return {
          job,
          lastSuccessAt: lastSuccess?.at ?? null,
          lastResult: lastSuccess?.detail ?? null,
          lastFailureAt: lastFailure?.at ?? null,
          lastFailure: lastFailure?.error ?? null,
          failures24h: failures?.n ?? 0,
        };
      }),
    );

    let queueDepth: number | null = null;
    try {
      const res = await app.db.execute<{ n: number }>(
        sql`select case when to_regclass('pgboss.job') is null then null else (select count(*)::int from pgboss.job where state in ('created','retry')) end as n`,
      );
      queueDepth = res.rows[0]?.n ?? null;
    } catch {
      queueDepth = null;
    }

    const providerFailures = await app.db
      .select({ provider: aiUsage.provider, errorClass: aiUsage.errorClass, n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.outcome, 'error'), gte(aiUsage.createdAt, since)))
      .groupBy(aiUsage.provider, aiUsage.errorClass);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [spend] = await app.db
      .select({ usd: sql<string>`coalesce(sum(${aiUsage.costUsd}),0)`, calls: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, monthStart));

    const heartbeat = jobs.find((j) => j.job === 'heartbeat')?.lastSuccessAt;
    const workerAlive = heartbeat ? Date.now() - new Date(heartbeat).getTime() < 5 * 60_000 : false;

    return {
      generatedAt: new Date().toISOString(),
      disclaimer: 'Point-in-time health snapshot. It is not a guarantee that reminders or jobs will run on time.',
      api: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), node: process.version },
      database: { status: dbOk ? 'ok' : 'error', latencyMs: dbLatencyMs },
      worker: { status: workerAlive ? 'ok' : 'stale', lastHeartbeatAt: heartbeat ?? null },
      jobs,
      queue: { depth: queueDepth, pendingPush: await pendingPushCount(app.db) },
      ai: {
        ...app.ai.describe(),
        monthSpendUsd: Number(spend?.usd ?? 0),
        monthCalls: spend?.calls ?? 0,
        globalBudgetUsd: app.config.AI_GLOBAL_MONTHLY_BUDGET_USD,
        failures24h: providerFailures,
      },
      integrations: {
        push: app.config.PUSH_ENABLED ? 'configured' : 'not configured',
        openclaw: app.config.OPENCLAW_ENABLED ? 'enabled' : 'disabled',
        demoMode: app.config.DEMO_MODE,
      },
    };
  });
}
