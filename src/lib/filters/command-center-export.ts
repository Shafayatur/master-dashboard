import type { DateRange } from './dates';
import { DEPOSIT_STATUSES, FILTER_QUERY_KEYS, serializeFilters, type Filters } from './schema';

/** Export the Command Center's deposit view with the equivalent Explorer filters. */
export function commandCenterExportHref(filters: Filters, range: DateRange, fmt: 'csv' | 'xlsx'): string {
  const params = serializeFilters(filters);
  for (const key of [
    FILTER_QUERY_KEYS.compare,
    FILTER_QUERY_KEYS.orderStatus,
    FILTER_QUERY_KEYS.excludeReinvest,
    FILTER_QUERY_KEYS.investorKind,
    FILTER_QUERY_KEYS.segments,
    FILTER_QUERY_KEYS.depositStatus,
  ]) {
    params.delete(key);
  }

  params.set('t', 'deposits');
  params.set(FILTER_QUERY_KEYS.preset, 'custom');
  params.set(FILTER_QUERY_KEYS.from, range.from);
  params.set(FILTER_QUERY_KEYS.to, range.to);
  if (!DEPOSIT_STATUSES.every((status) => filters.depositStatus.includes(status))) {
    params.set('st', filters.depositStatus.join(','));
  }
  params.set('fmt', fmt);
  return `/api/export/explorer?${params.toString()}`;
}
