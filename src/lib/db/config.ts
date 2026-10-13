import 'server-only';
import { Pool, type QueryResultRow } from 'pg';
import { getEnv } from '../env';
import { buildPoolConfig } from './pool-config';

const g = globalThis as unknown as { __configPool?: Pool };

/** Neon database owned by this dashboard (targets, settings, export log). Read/write. */
export function configPool(): Pool {
  if (!g.__configPool) {
    const env = getEnv();
    const pool = new Pool(
      buildPoolConfig(env.CONFIG_DATABASE_URL, {
        ssl: { rejectUnauthorized: true },
        max: 3,
        appName: 'master-dashboard-config',
      }),
    );
    pool.on('error', (err) => console.error('[config-pool] idle client error:', err.message));
    g.__configPool = pool;
  }
  return g.__configPool;
}

export async function queryConfig<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await configPool().query<T>(text, params);
  return res.rows;
}
