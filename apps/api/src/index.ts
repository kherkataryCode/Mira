import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const handle = createDb({ url: config.DATABASE_URL, ssl: config.DATABASE_SSL, max: config.DATABASE_POOL_MAX });
  const app = await buildApp({ config, db: handle.db });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info({ demo: app.ai.usingDemo }, 'Friday API ready');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Startup failed');
  process.exit(1);
});
