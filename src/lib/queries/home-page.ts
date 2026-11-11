import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import { TARGETS_CACHE_TAG } from '@/lib/targets/cache';
import { getTarget } from './command-center';
import { loadHome, loadHomeSnapshot, type HomeData, type HomeSnapshot } from './home';
import type { Row } from './sql-filters';

/** Unfiltered dashboard data is shared across filter selections and refreshed independently. */
export function getHomeSnapshot(today: string): Promise<HomeSnapshot> {
  return unstable_cache(
    () => loadHomeSnapshot((sql, params) => querySource<Row>(sql, params), today, new Date()),
    ['home-snapshot', today],
    { revalidate: 300 },
  )();
}

/** Shared 5-minute cache keyed by the filters (ADR 0004): all users reuse the same query results. */
export function getHome(filters: Filters, today: string): Promise<HomeData> {
  return unstable_cache(
    async () => loadHome(
      { q: (sql, params) => querySource<Row>(sql, params), getTarget },
      filters,
      today,
      new Date(),
      await getHomeSnapshot(today),
    ),
    ['home', today, JSON.stringify(filters)],
    { revalidate: 300, tags: [TARGETS_CACHE_TAG] },
  )();
}
