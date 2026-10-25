import { PgBoss } from 'pg-boss';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import type { AiGateway } from '../ai/index.js';
import { dispatchDueReminders, runBriefs, runChatBriefings, runCleanup, runNewsCollection, runOnce, sendPendingPushes } from './jobs.js';

export type SchedulerLog = (level: 'info' | 'error', msg: string, extra?: Record<string, unknown>) => void;

/**
 * Durable cron on PostgreSQL (pg-boss) with retries; every run is recorded in job_runs for
 * idempotency and the System Health page. Runs in the worker process, or inside the API when
 * EMBEDDED_WORKER is on. Running both is safe: queues are singletons and runOnce keys dedupe.
 */
export async function startScheduler(config: Config, db: Db, ai: AiGateway, log: SchedulerLog): Promise<{ stop: () => Promise<void> }> {
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
    max: 3,
  });
  boss.on('error', (err: Error) => log('error', 'pg-boss error', { error: err.message }));
  await boss.start();

  const minuteKey = () => new Date().toISOString().slice(0, 16);
  const jobs: { name: string; cron: string; handler: () => Promise<Record<string, unknown>>; key: () => string }[] = [
    { name: 'heartbeat', cron: '* * * * *', key: minuteKey, handler: async () => ({ ok: true }) },
    { name: 'reminders.dispatch', cron: '* * * * *', key: minuteKey, handler: async () => ({ ...(await dispatchDueReminders(db)) }) },
    {
      name: 'push.send',
      cron: '* * * * *',
      key: minuteKey,
      handler: async () => ({ ...(await sendPendingPushes(db, { enabled: config.PUSH_ENABLED, accessToken: config.EXPO_ACCESS_TOKEN })) }),
    },
    { name: 'briefs.generate', cron: '*/5 * * * *', key: minuteKey, handler: async () => ({ ...(await runBriefs(db, ai)) }) },
    { name: 'briefings.chat', cron: '*/5 * * * *', key: minuteKey, handler: async () => ({ ...(await runChatBriefings(db, ai)) }) },
    { name: 'news.collect', cron: '*/15 * * * *', key: minuteKey, handler: async () => ({ ...(await runNewsCollection(db)) }) },
    { name: 'cleanup', cron: '17 3 * * *', key: () => new Date().toISOString().slice(0, 10), handler: async () => ({ ...(await runCleanup(db)) }) },
  ];

  for (const job of jobs) {
    await boss.createQueue(job.name, { policy: 'singleton', retryLimit: 2, retryDelay: 20, retryBackoff: true, expireInSeconds: 600 });
    await boss.schedule(job.name, job.cron, null, { tz: 'UTC' });
    await boss.work(job.name, { localConcurrency: 1 }, async () => {
      const started = Date.now();
      try {
        const res = await runOnce(db, job.name, job.key(), job.handler);
        if (res.status === 'succeeded' && job.name !== 'heartbeat') log('info', 'job done', { job: job.name, ms: Date.now() - started, ...res.detail });
      } catch (err) {
        log('error', 'job failed', { job: job.name, error: err instanceof Error ? err.message : 'unknown' });
        throw err; // let pg-boss retry within its bounded retry limit
      }
    });
  }
  log('info', 'Mira scheduler started', { jobs: jobs.map((j) => j.name), demo: ai.usingDemo });

  return { stop: () => boss.stop({ graceful: true, timeout: 20_000 }) };
}
