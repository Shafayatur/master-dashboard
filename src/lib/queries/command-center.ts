import 'server-only';
import { unstable_cache } from 'next/cache';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import type { CommandCenterData } from '@/lib/dashboard/types';
import type { Filters } from '@/lib/filters/schema';
import { loadCommandCenter } from './overview';
import type { Row } from './sql-filters';

/** Monthly target from the dashboard's own database. A missing table or outage just means "no target". */
async function getTarget(monthStart: string): Promise<number | null> {
  try {
    const rows = await queryConfig<{ t: number }>('SELECT target_amount::float8 AS t FROM monthly_targets WHERE month = $1::date', [monthStart]);
    return rows[0]?.t ?? null;
  } catch (e) {
    console.error('[targets] unavailable:', (e as Error).message);
    return null;
  }
}

const TTL_SECONDS = 60;

/** Shared 60-second cache keyed by the filters (ADR 0004): all users reuse the same query results. */
export function getCommandCenter(filters: Filters, today: string): Promise<CommandCenterData> {
  return unstable_cache(
    () => loadCommandCenter({ q: (sql, params) => querySource<Row>(sql, params), getTarget }, filters, today, new Date()),
    ['command-center', today, JSON.stringify(filters)],
    { revalidate: TTL_SECONDS },
  )();
}
