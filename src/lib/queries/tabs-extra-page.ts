import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import type { Row } from './sql-filters';
import { loadInvestorsExtras, loadSalesExtras, type InvestorsExtras, type SalesExtras } from './tabs-extra';

const query = (sql: string, params?: unknown[]) => querySource<Row>(sql, params);

/** Shared 60-second cache keyed by the filters (ADR 0004): all users reuse the same query results. */
export function getSalesExtras(filters: Filters, today: string): Promise<SalesExtras> {
  return unstable_cache(() => loadSalesExtras(query, filters, new Date()), ['sales-extras', today, JSON.stringify(filters)], {
    revalidate: 60,
  })();
}

/** Not filtered: the last 12 months up to `today`. */
export function getInvestorsExtras(today: string): Promise<InvestorsExtras> {
  return unstable_cache(() => loadInvestorsExtras(query, today), ['investors-extras', today], { revalidate: 60 })();
}
