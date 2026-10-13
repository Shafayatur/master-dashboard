import 'server-only';
import { Pool, type QueryResultRow } from 'pg';
import { getEnv } from '../env';
import { assertReadOnlySql } from '../sql/guard';
import { buildPoolConfig } from './pool-config';

const g = globalThis as unknown as { __sourcePool?: Pool };

/** Singleton pool (survives hot reload and is reused across warm serverless invocations). */
export function sourcePool(): Pool {
  if (!g.__sourcePool) {
    const env = getEnv();
    const pool = new Pool(
      buildPoolConfig(env.SOURCE_DATABASE_URL, {
        ssl: env.SOURCE_DB_SSL === 'require' ? { rejectUnauthorized: env.SOURCE_DB_SSL_REJECT_UNAUTHORIZED } : false,
        max: env.SOURCE_DB_POOL_MAX,
        appName: 'master-dashboard',
      }),
    );
    // Session-level read-only as an extra safety net (queued ahead of the first real query).
    pool.on('connect', (client) => {
      client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY').catch(() => undefined);
    });
    pool.on('error', (err) => console.error('[source-pool] idle client error:', err.message));
    g.__sourcePool = pool;
  }
  return g.__sourcePool;
}

/** Runs a single parameterised SELECT against the source DB. Everything else is rejected before it is sent. */
export async function querySource<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertReadOnlySql(text);
  const res = await sourcePool().query<T>(text, params);
  return res.rows;
}
