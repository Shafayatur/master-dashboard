import 'server-only';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { loadTargetsOverview, type TargetsOverview } from './targets';
import type { Row } from './sql-filters';

/** Not cached: the page must show a target the moment it is saved. */
export function getTargetsOverview(today: string): Promise<TargetsOverview> {
  return loadTargetsOverview(
    (sql, params) => querySource<Row>(sql, params),
    (sql, params) => queryConfig<Row>(sql, params),
    today,
    new Date(),
  );
}
