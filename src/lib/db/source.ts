import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getSourceEnv } from '../env';
import { assertReadOnlySql } from '../sql/guard';
import { buildPoolConfig } from './pool-config';

const g = globalThis as unknown as { __sourcePool?: Pool };

/** Singleton pool (survives hot reload and is reused across warm serverless invocations). */
export function sourcePool(): Pool {
  if (!g.__sourcePool) {
    const env = getSourceEnv();
    const pool = new Pool(
      buildPoolConfig(env.url, {
        ssl: env.ssl === 'require' ? { rejectUnauthorized: env.sslRejectUnauthorized } : false,
        max: env.poolMax,
        appName: 'master-dashboard',
      }),
    );
    pool.on('error', (err) => console.error('[source-pool] idle client error:', err.message));
    g.__sourcePool = pool;
  }
  return g.__sourcePool;
}

/** Connections that already had the read-only session setting applied. */
const readOnlyClients = new WeakSet<PoolClient>();

/**
 * Runs a single parameterised SELECT against the source DB. Everything else is rejected before it is sent.
 * Each pooled connection is switched to a read-only session once, awaited before its first query,
 * as a second safety net behind the SELECT-only guard and the read-only database role.
 */
export async function querySource<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertReadOnlySql(text);
  const client = await sourcePool().connect();
  let discard = false;
  try {
    if (!readOnlyClients.has(client)) {
      try {
        await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      } catch (e) {
        discard = true; // never reuse a connection that could not be made read-only
        throw e;
      }
      readOnlyClients.add(client);
    }
    const res = await client.query<T>(text, params);
    return res.rows;
  } finally {
    client.release(discard);
  }
}
