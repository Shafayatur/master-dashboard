import { GLOBAL_FILTER_QUERY_KEYS } from './schema';

/** Replaces global filter params while preserving page-local query params. */
export function mergeFilterQuery(current: URLSearchParams, globalQs: string): string {
  const next = new URLSearchParams(current.toString());
  for (const key of GLOBAL_FILTER_QUERY_KEYS) next.delete(key);
  next.delete('page');
  new URLSearchParams(globalQs).forEach((value, key) => next.set(key, value));
  return next.toString();
}
