import 'server-only';

import { Pool, type PoolClient } from 'pg';
import { requireServerEnv } from './config';

type GlobalWithDatabasePool = typeof globalThis & {
  smartRiverDatabasePool?: Pool;
};

function shouldUseSsl(connectionString: string): boolean {
  const configured = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  try {
    const host = new URL(connectionString).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return true;
  }
}

export function getDatabasePool(): Pool {
  const globalForDatabase = globalThis as GlobalWithDatabasePool;
  if (globalForDatabase.smartRiverDatabasePool) {
    return globalForDatabase.smartRiverDatabasePool;
  }

  const connectionString = requireServerEnv('DATABASE_URL');
  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

  // Reuse one pool for the lifetime of the Node.js process. This also matters
  // on serverless runtimes where a warm instance can handle many telemetry
  // heartbeats and dashboard polls.
  globalForDatabase.smartRiverDatabasePool = pool;

  return pool;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
