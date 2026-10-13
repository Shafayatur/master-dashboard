import type { PoolConfig } from 'pg';
import { applyPgTypeParsers } from './pg-types';

export interface PoolOptions {
  ssl: boolean | { rejectUnauthorized: boolean };
  max: number;
  appName: string;
  statementTimeoutMs?: number;
}

/**
 * Builds a pg PoolConfig. `sslmode` is stripped from the URL because pg's interpretation of
 * `sslmode=require` is changing between versions; TLS behaviour is set explicitly via `ssl`.
 */
export function buildPoolConfig(connectionString: string, o: PoolOptions): PoolConfig {
  applyPgTypeParsers();
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const timeout = o.statementTimeoutMs ?? 15_000;
  return {
    connectionString: url.toString(),
    ssl: o.ssl,
    max: o.max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: o.appName,
    statement_timeout: timeout,
    query_timeout: timeout + 2_000,
  };
}
