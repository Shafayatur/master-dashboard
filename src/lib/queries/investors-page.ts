import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import { loadInvestors, type InvestorsData } from './investors';
import type { Row } from './sql-filters';

/** Snapshot data, so the cache key is just the day. Shared 60-second cache (ADR 0004). */
export function getInvestors(today: string): Promise<InvestorsData> {
  return unstable_cache(
    () => loadInvestors((sql, params) => querySource<Row>(sql, params), today, new Date()),
    ['investors', today],
    { revalidate: 60 },
  )();
}
