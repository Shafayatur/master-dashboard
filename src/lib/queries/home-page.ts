import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import { getTarget } from './command-center';
import { loadHome, type HomeData } from './home';
import type { Row } from './sql-filters';

/** Shared 60-second cache keyed by the filters (ADR 0004): all users reuse the same query results. */
export function getHome(filters: Filters, today: string): Promise<HomeData> {
  return unstable_cache(
    () => loadHome({ q: (sql, params) => querySource<Row>(sql, params), getTarget }, filters, today, new Date()),
    ['home', today, JSON.stringify(filters)],
    { revalidate: 60 },
  )();
}
