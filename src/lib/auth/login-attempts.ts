import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';

/** Minimal query function so the policy can be tested against an in-memory Postgres. */
export type Query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

export const WINDOW_MINUTES = 15;
export const MAX_FAILS_PER_IP = 5;
export const MAX_FAILS_GLOBAL = 40;

export function hashIp(ip: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}

export interface LockState {
  locked: boolean;
  retryAfterSeconds: number;
}

/** Locked when this IP or the whole app had too many failures in the window. Failures are cleared by nothing but time. */
export async function getLockState(query: Query, ipHash: string): Promise<LockState> {
  const rows = await query<{ ip_fails: string; all_fails: string; oldest_ip: Date | null; oldest_all: Date | null }>(
    `SELECT
       COUNT(*) FILTER (WHERE ip_hash = $1)                     AS ip_fails,
       COUNT(*)                                                 AS all_fails,
       MIN(created_at) FILTER (WHERE ip_hash = $1)              AS oldest_ip,
       MIN(created_at)                                          AS oldest_all
     FROM login_attempts
     WHERE success = false AND created_at > now() - make_interval(mins => $2)`,
    [ipHash, WINDOW_MINUTES],
  );
  const r = rows[0];
  const ipFails = Number(r?.ip_fails ?? 0);
  const allFails = Number(r?.all_fails ?? 0);
  const oldest = ipFails >= MAX_FAILS_PER_IP ? r?.oldest_ip : allFails >= MAX_FAILS_GLOBAL ? r?.oldest_all : null;
  if (!oldest) return { locked: false, retryAfterSeconds: 0 };
  const unlockAt = new Date(oldest).getTime() + WINDOW_MINUTES * 60_000;
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000)) };
}

export async function recordAttempt(query: Query, ipHash: string, success: boolean): Promise<void> {
  await query('INSERT INTO login_attempts (ip_hash, success) VALUES ($1, $2)', [ipHash, success]);
  // Housekeeping: keep a week of history.
  if (!success) await query(`DELETE FROM login_attempts WHERE created_at < now() - interval '7 days'`);
}
