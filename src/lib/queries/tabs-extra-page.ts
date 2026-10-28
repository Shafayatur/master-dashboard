import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import type { Row } from './sql-filters';
import {
  loadInvestorsExtras,
  loadSalesExtras,
  type BookingView,
  type InvestorsExtras,
  type SalesExtras,
} from './tabs-extra';

const query = (sql: string, params?: unknown[]) => querySource<Row>(sql, params);

/** Shared 60-second cache keyed by the filters (ADR 0004): all users reuse the same query results. */
export function getSalesExtras(filters: Filters, today: string, view: BookingView, anchor: string): Promise<SalesExtras> {
  return unstable_cache(
    () => loadSalesExtras(query, filters, new Date(), view, anchor, today),
    ['sales-extras', today, JSON.stringify(filters), view, anchor],
    { revalidate: 60 },
  )();
}

/** Snapshot series plus registrations in the selected range. */
export function getInvestorsExtras(today: string, range: DateRange): Promise<InvestorsExtras> {
  return unstable_cache(
    () => loadInvestorsExtras(query, today, range),
    ['investors-extras', today, range.from, range.to],
    { revalidate: 60 },
  )();
}
