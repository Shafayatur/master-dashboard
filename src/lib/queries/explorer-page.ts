import 'server-only';
import { querySource } from '@/lib/db/source';
import { loadExplorer, type ExplorerParams, type ExplorerResult } from './explorer';
import type { Row } from './sql-filters';

/** Not cached: filters, sort and page make almost every request unique. */
export const getExplorer = (params: ExplorerParams): Promise<ExplorerResult> =>
  loadExplorer((sql, p) => querySource<Row>(sql, p), params);
