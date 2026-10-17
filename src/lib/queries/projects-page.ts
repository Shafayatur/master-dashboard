import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { Filters } from '@/lib/filters/schema';
import { loadProjects, type ProjectsData } from './projects';
import type { Row } from './sql-filters';

/** Shared 60-second cache keyed by the filters (ADR 0004). */
export function getProjects(filters: Filters, today: string): Promise<ProjectsData> {
  return unstable_cache(
    () => loadProjects((sql, params) => querySource<Row>(sql, params), filters, new Date()),
    ['projects', today, JSON.stringify(filters)],
    { revalidate: 60 },
  )();
}
