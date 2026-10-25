import { createDb, createGateway, loadConfig, startScheduler } from '@friday/api/lib';

/**
 * Mira worker: runs the scheduler as its own process. Optional when the API runs it
 * in-process (EMBEDDED_WORKER=true, the default).
 */
async function main() {
  const config = loadConfig();
  const handle = createDb({ url: config.DATABASE_URL, ssl: config.DATABASE_SSL, max: 4 });
  const ai = createGateway(config, handle.db);
  const log = (level: 'info' | 'error', msg: string, extra: Record<string, unknown> = {}) => {
    if (config.LOG_LEVEL === 'silent') return;
    console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, time: new Date().toISOString(), msg, ...extra }));
  };
  const scheduler = await startScheduler(config, handle.db, ai, log);

  const shutdown = async () => {
    log('info', 'worker shutting down');
    await scheduler.stop();
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
