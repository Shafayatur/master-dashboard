import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import { loadMoneyFlow, type MoneyFlowData } from './money-flow';
import type { Row } from './sql-filters';

/** All SQL is range-independent; period changes reuse the same 5-minute snapshot. */
export async function getMoneyFlow(filters: Filters, today: string): Promise<MoneyFlowData> {
  const data = await unstable_cache(
    () => loadMoneyFlow((sql, params) => querySource<Row>(sql, params), filters.range, today, new Date()),
    ['money-flow-v3', today],
    { revalidate: 300 },
  )();
  return { ...data, range: filters.range };
}
