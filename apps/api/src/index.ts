import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedLessons } from './db/seed.js';
import { startScheduler } from './jobs/scheduler.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const handle = createDb({ url: config.DATABASE_URL, ssl: config.DATABASE_SSL, max: config.DATABASE_POOL_MAX });

  // Single-service deploys (e.g. Railway without a pre-deploy step) still get schema updates and lessons.
  // Pending migrations apply in one transaction, so a failure leaves the previous schema intact.
  if (config.AUTO_MIGRATE) {
    try {
      await runMigrations(config.DATABASE_URL, config.DATABASE_SSL);
      const lessons = await seedLessons(handle.db);
      console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', lessons }));
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'auto-migrate failed', error: err instanceof Error ? err.message : 'unknown' }));
    }
  }

  const app = await buildApp({ config, db: handle.db });

  let scheduler: { stop: () => Promise<void> } | null = null;
  if (config.EMBEDDED_WORKER) {
    try {
      scheduler = await startScheduler(config, handle.db, app.ai, (level, msg, extra = {}) =>
        level === 'error' ? app.log.error(extra, msg) : app.log.info(extra, msg),
      );
    } catch (err) {
      // The API stays up; System Health shows the scheduler as stale.
      app.log.error({ error: err instanceof Error ? err.message : 'unknown' }, 'scheduler failed to start');
    }
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await scheduler?.stop();
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info({ demo: app.ai.usingDemo, scheduler: Boolean(scheduler) }, 'Mira API ready');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Startup failed');
  process.exit(1);
});
