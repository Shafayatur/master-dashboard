import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import { loadMoneyFlow, type MoneyFlowData } from './money-flow';
import type { Row } from './sql-filters';

/** Only the date range matters here. Shared 60-second cache (ADR 0004). */
export function getMoneyFlow(filters: Filters, today: string): Promise<MoneyFlowData> {
  return unstable_cache(
    () => loadMoneyFlow((sql, params) => querySource<Row>(sql, params), filters.range, today, new Date()),
    ['money-flow', today, filters.range.from, filters.range.to],
    { revalidate: 60 },
  )();
}
