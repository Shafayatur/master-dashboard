import { SEGMENTS, type Segment } from '@/lib/filters/schema';

export const ALL_TIME = { from: '2015-01-01' } as const;

type SearchParams = URLSearchParams | string | Record<string, string | string[] | undefined>;
type DepositFilter = 'prod' | 'cat' | 'ten' | 'rt' | 'pm' | 'st';

function isSegment(value: string): value is Segment {
  return (SEGMENTS as readonly string[]).includes(value);
}

const PRESERVED_KEYS = [
  'p',
  'from',
  'to',
  'ds',
  'os',
  'pm',
  'xr',
  'prod',
  'cat',
  'ten',
  'rt',
  'sh',
  'ik',
  'seg',
] as const;

function toSearchParams(params: SearchParams): URLSearchParams {
  if (params instanceof URLSearchParams) return new URLSearchParams(params);
  if (typeof params === 'string') return new URLSearchParams(params.replace(/^\?/, ''));

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined) search.set(key, value);
  }
  return search;
}

export function explorerHref({
  table,
  params,
  extra,
}: {
  table: 'deposits' | 'investors' | 'orders' | 'payouts';
  params: SearchParams;
  extra?: Record<string, string | number | undefined>;
}): string {
  const current = toSearchParams(params);
  const query = new URLSearchParams();
  for (const key of PRESERVED_KEYS) {
    const value = current.get(key);
    if (value !== null) query.set(key, value);
  }
  query.set('t', table);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === undefined) query.delete(key);
    else query.set(key, String(value));
  }
  return `/explorer?${query.toString()}`;
}

export function depositSliceHref(
  params: SearchParams,
  filter: DepositFilter,
  key: string,
  value: number,
): string | undefined {
  if (!Number.isFinite(value) || value <= 0 || !key || ((filter === 'prod' || filter === 'cat') && key === 'others')) {
    return undefined;
  }
  return explorerHref({ table: 'deposits', params, extra: { [filter]: key } });
}

export function investorSegmentHref(
  params: SearchParams,
  segment: string,
  today: string,
  value: number,
): string | undefined {
  if (!Number.isFinite(value) || value <= 0 || !isSegment(segment)) return undefined;
  return explorerHref({
    table: 'investors',
    params,
    extra: {
      p: 'custom',
      from: ALL_TIME.from,
      to: today,
      ds: undefined,
      os: undefined,
      pm: undefined,
      xr: undefined,
      prod: undefined,
      cat: undefined,
      ten: undefined,
      rt: undefined,
      sh: undefined,
      ik: undefined,
      seg: segment,
    },
  });
}

export function confirmedReinvestmentHref(params: SearchParams, amount: number): string | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return explorerHref({
    table: 'deposits',
    params,
    extra: {
      ds: undefined,
      os: undefined,
      xr: undefined,
      prod: undefined,
      cat: undefined,
      ten: undefined,
      rt: undefined,
      sh: undefined,
      ik: undefined,
      seg: undefined,
      pm: 'reinvest',
      st: 'approved',
    },
  });
}
