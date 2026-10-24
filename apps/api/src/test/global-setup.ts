import pg from 'pg';
import { runMigrations } from '../db/migrate.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://friday:friday@localhost:5432/friday_test';

/** Resets the test database to a clean, migrated state once per run. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await client.end();
  await runMigrations(TEST_DATABASE_URL, false);
}
