import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import type { Row } from './sql-filters';
import { loadSales, type SalesData } from './sales';

/** Shared 60-second cache keyed by the filters (ADR 0004). */
export function getSales(filters: Filters, today: string): Promise<SalesData> {
  return unstable_cache(
    () => loadSales((sql, params) => querySource<Row>(sql, params), filters, new Date()),
    ['sales', today, JSON.stringify(filters)],
    { revalidate: 60 },
  )();
}
