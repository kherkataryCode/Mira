import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Migrations live in apps/api/drizzle (committed SQL). */
export const MIGRATIONS_DIR = path.resolve(here, '../../drizzle');

export async function runMigrations(url: string, ssl: boolean): Promise<void> {
  const handle = createDb({ url, ssl, max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const ssl = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1';
  runMigrations(url, ssl)
    .then(() => console.log('Migrations applied.'))
    .catch((err: unknown) => {
      console.error('Migration failed:', err instanceof Error ? err.message : 'unknown error');
      process.exit(1);
    });
}
