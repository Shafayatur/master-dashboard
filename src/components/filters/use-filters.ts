'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { patchFilters, parseFilters, serializeFilters, type FilterPatch, type Filters } from '@/lib/filters/schema';
import { mergeFilterQuery } from '@/lib/filters/query-string';
import { todayDhaka } from '@/lib/time';

/** Filter state lives in the URL, so views are shareable and survive reloads. */
export function useFilters(): { filters: Filters; update: (patch: FilterPatch) => void; reset: () => void; pending: boolean } {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = todayDhaka();
  const filters = useMemo(() => parseFilters(sp, today), [sp, today]);

  const go = useCallback(
    (qs: string) => startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })),
    [router, pathname],
  );
  const update = useCallback(
    (patch: FilterPatch) => go(mergeFilterQuery(sp, serializeFilters(patchFilters(filters, patch, today)).toString())),
    [filters, today, go, sp],
  );
  const reset = useCallback(() => go(mergeFilterQuery(sp, '')), [go, sp]);
  return { filters, update, reset, pending };
}
