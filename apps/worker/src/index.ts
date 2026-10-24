import { PgBoss } from 'pg-boss';
import { createDb, createGateway, loadConfig } from '@friday/api/lib';
import { dispatchDueReminders, runBriefs, runCleanup, runNewsCollection, runOnce, sendPendingPushes } from './jobs.js';

/**
 * Friday worker: the authoritative scheduler. Runs as its own process (never inside the
 * web/API), uses pg-boss on PostgreSQL for durable cron + retries, and records every run
 * in job_runs for idempotency and the System Health page.
 */
async function main() {
  const config = loadConfig();
  const handle = createDb({ url: config.DATABASE_URL, ssl: config.DATABASE_SSL, max: 4 });
  const db = handle.db;
  const ai = createGateway(config, db);
  const log = (level: 'info' | 'error', msg: string, extra: Record<string, unknown> = {}) => {
    if (config.LOG_LEVEL === 'silent') return;
    console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, time: new Date().toISOString(), msg, ...extra }));
  };

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
  log('info', 'Friday worker started', { jobs: jobs.map((j) => j.name), demo: ai.usingDemo });

  const shutdown = async () => {
    log('info', 'worker shutting down');
    await boss.stop({ graceful: true, timeout: 20_000 });
    await handle.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Worker failed to start');
  process.exit(1);
});
