import { COMPARE_MODES, PRESETS, isValidYmd, resolveCompare, resolvePreset, type CompareMode, type DateRange, type PresetId } from './dates';

export const DEPOSIT_STATUSES = ['approved', 'pending', 'rejected'] as const;
export const ORDER_STATUSES = ['invested', 'closed', 'booked', 'verifying', 'cancelled'] as const;
export const PAYMENT_METHODS = ['bank_deposit', 'cash', 'cheque', 'reinvest'] as const;
export const RETURN_TYPES = ['percentage-range', 'percentage', 'fixed'] as const;
export const SEGMENTS = ['active', 'recently_active', 'cooling', 'inactive', 'prospect'] as const;
export const INVESTOR_KINDS = ['all', 'new', 'old'] as const;
export const SHARIAH = ['all', 'yes', 'no'] as const;

export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ReturnType = (typeof RETURN_TYPES)[number];
export type Segment = (typeof SEGMENTS)[number];
export type InvestorKind = (typeof INVESTOR_KINDS)[number];
export type ShariahFilter = (typeof SHARIAH)[number];

export interface Filters {
  /** 'custom' means from/to were chosen explicitly; presets stay rolling when bookmarked. */
  preset: PresetId | 'custom';
  range: DateRange;
  compare: CompareMode;
  compareRange: DateRange | null;
  /** Never empty: defaults to approved only. */
  depositStatus: DepositStatus[];
  /** Empty array = no restriction (applies to all list filters below). */
  orderStatus: OrderStatus[];
  paymentMethod: PaymentMethod[];
  excludeReinvest: boolean;
  products: number[];
  categories: number[];
  /** Product duration in months. */
  tenures: number[];
  returnTypes: ReturnType[];
  shariah: ShariahFilter;
  investorKind: InvestorKind;
  segments: Segment[];
}

export const DEFAULT_PRESET: PresetId = 'mtd';
export const DEFAULT_COMPARE: CompareMode = 'lastMonth';
export const DEFAULT_DEPOSIT_STATUS: DepositStatus[] = ['approved'];

type Input = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(input: Input): (k: string) => string | undefined {
  if (input instanceof URLSearchParams) return (k) => input.get(k) ?? undefined;
  return (k) => {
    const v = input[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

function oneOf<T extends string>(allowed: readonly T[], v: string | undefined): T | undefined {
  return v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function list<T extends string>(allowed: readonly T[], v: string | undefined): T[] {
  if (!v) return [];
  const out = new Set<T>();
  for (const part of v.split(',')) {
    const x = oneOf(allowed, part.trim());
    if (x) out.add(x);
  }
  return allowed.filter((a) => out.has(a)); // canonical order, so equal states give equal URLs
}

function ints(v: string | undefined, max = 200): number[] {
  if (!v) return [];
  const out = new Set<number>();
  for (const part of v.split(',')) {
    const n = Number(part);
    if (Number.isInteger(n) && n > 0 && n < 1_000_000_000 && out.size < max) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Lenient by design: anything invalid in a (possibly hand-edited) URL falls back to its default instead of erroring. */
export function parseFilters(input: Input, today: string): Filters {
  const get = getter(input);

  let preset: PresetId | 'custom' = oneOf(PRESETS, get('p')) ?? DEFAULT_PRESET;
  let range: DateRange;
  if (get('p') === 'custom' && isValidYmd(get('from')) && isValidYmd(get('to'))) {
    preset = 'custom';
    const [a, b] = [get('from')!, get('to')!];
    range = a <= b ? { from: a, to: b } : { from: b, to: a };
  } else {
    range = resolvePreset(preset, today);
  }
  const compare = oneOf(COMPARE_MODES, get('cmp')) ?? DEFAULT_COMPARE;

  const ds = list(DEPOSIT_STATUSES, get('ds'));
  return {
    preset,
    range,
    compare,
    compareRange: resolveCompare(range, compare),
    depositStatus: ds.length ? ds : [...DEFAULT_DEPOSIT_STATUS],
    orderStatus: list(ORDER_STATUSES, get('os')),
    paymentMethod: list(PAYMENT_METHODS, get('pm')),
    excludeReinvest: get('xr') === '1',
    products: ints(get('prod')),
    categories: ints(get('cat')),
    tenures: ints(get('ten'), 36),
    returnTypes: list(RETURN_TYPES, get('rt')),
    shariah: oneOf(SHARIAH, get('sh')) ?? 'all',
    investorKind: oneOf(INVESTOR_KINDS, get('ik')) ?? 'all',
    segments: list(SEGMENTS, get('seg')),
  };
}

/** Compact URL: defaults are omitted so shared links stay short. */
export function serializeFilters(f: Filters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.preset === 'custom') {
    q.set('p', 'custom');
    q.set('from', f.range.from);
    q.set('to', f.range.to);
  } else if (f.preset !== DEFAULT_PRESET) {
    q.set('p', f.preset);
  }
  if (f.compare !== DEFAULT_COMPARE) q.set('cmp', f.compare);
  const sameDs = f.depositStatus.length === 1 && f.depositStatus[0] === 'approved';
  if (!sameDs) q.set('ds', f.depositStatus.join(','));
  if (f.orderStatus.length) q.set('os', f.orderStatus.join(','));
  if (f.paymentMethod.length) q.set('pm', f.paymentMethod.join(','));
  if (f.excludeReinvest) q.set('xr', '1');
  if (f.products.length) q.set('prod', f.products.join(','));
  if (f.categories.length) q.set('cat', f.categories.join(','));
  if (f.tenures.length) q.set('ten', f.tenures.join(','));
  if (f.returnTypes.length) q.set('rt', f.returnTypes.join(','));
  if (f.shariah !== 'all') q.set('sh', f.shariah);
  if (f.investorKind !== 'all') q.set('ik', f.investorKind);
  if (f.segments.length) q.set('seg', f.segments.join(','));
  return q;
}

/** Number of active (non-default) filters, excluding the date range and comparison. Shown as a badge. */
export function activeFilterCount(f: Filters): number {
  let n = 0;
  const sameDs = f.depositStatus.length === 1 && f.depositStatus[0] === 'approved';
  if (!sameDs) n++;
  if (f.orderStatus.length) n++;
  if (f.paymentMethod.length) n++;
  if (f.excludeReinvest) n++;
  if (f.products.length) n++;
  if (f.categories.length) n++;
  if (f.tenures.length) n++;
  if (f.returnTypes.length) n++;
  if (f.shariah !== 'all') n++;
  if (f.investorKind !== 'all') n++;
  if (f.segments.length) n++;
  return n;
}

export type FilterPatch = Partial<Omit<Filters, 'preset' | 'range' | 'compareRange'>> & {
  /** Pick a rolling preset, or an explicit custom range. */
  date?: { preset: PresetId } | { preset: 'custom'; range: DateRange };
};

/** Applies a change from the UI and re-derives the resolved date ranges. */
export function patchFilters(f: Filters, patch: FilterPatch, today: string): Filters {
  const { date, ...rest } = patch;
  const next: Filters = { ...f, ...rest };
  if (date) {
    if (date.preset === 'custom') {
      const { from, to } = date.range;
      next.preset = 'custom';
      next.range = from <= to ? { from, to } : { from: to, to: from };
    } else {
      next.preset = date.preset;
      next.range = resolvePreset(date.preset, today);
    }
  } else if (f.preset !== 'custom') {
    next.range = resolvePreset(f.preset, today);
  }
  next.compareRange = resolveCompare(next.range, next.compare);
  if (next.depositStatus.length === 0) next.depositStatus = [...DEFAULT_DEPOSIT_STATUS];
  return next;
}

export function defaultFilters(today: string): Filters {
  return parseFilters(new URLSearchParams(), today);
}
