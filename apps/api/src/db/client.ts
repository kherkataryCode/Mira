import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(opts: { url: string; ssl: boolean; max: number }): DbHandle {
  const pool = new pg.Pool({
    connectionString: opts.url,
    max: opts.max,
    ssl: opts.ssl ? { rejectUnauthorized: true } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'friday',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
