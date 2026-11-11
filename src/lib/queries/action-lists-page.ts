import 'server-only';
import { unstable_cache } from 'next/cache';
import { querySource } from '@/lib/db/source';
import type { DateRange } from '@/lib/filters/dates';
import { loadActionLists, SCREEN_LIMIT, type ActionListsData } from './action-lists';
import type { Row } from './sql-filters';

export const MATURING_WINDOWS = [7, 14, 30] as const;

/** Shared 60-second cache (ADR 0004). */
export function getActionLists(today: string, maturingDays: number, maturityRange?: DateRange): Promise<ActionListsData> {
  return unstable_cache(
    () => loadActionLists((sql, params) => querySource<Row>(sql, params), new Date(), { maturingDays, limit: SCREEN_LIMIT, maturityRange }),
    ['action-lists', today, String(maturingDays), maturityRange?.from ?? '', maturityRange?.to ?? ''],
    { revalidate: 60 },
  )();
}
