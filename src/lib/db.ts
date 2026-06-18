import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from './config';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

/**
 * Neon HTTP-backed Drizzle client. Lazily constructed so routes that never
 * touch the DB (and builds without DATABASE_URL) don't fail at import time.
 */
export function getDb(): Db {
  if (cached) return cached;
  const sql = neon(getDatabaseUrl());
  cached = drizzle(sql, { schema });
  return cached;
}
