import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import { loadActiveProjects, type ActiveProject } from './active-projects';
import type { Row } from './sql-filters';

/** Shared 60-second cache keyed by the Dhaka date. */
export function getActiveProjects(today: string): Promise<ActiveProject[]> {
  return unstable_cache(
    () => loadActiveProjects((sql, params) => querySource<Row>(sql, params)),
    ['active-projects', today],
    { revalidate: 60 },
  )();
}
