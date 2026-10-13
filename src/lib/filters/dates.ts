/** Pure calendar-date arithmetic on YYYY-MM-DD strings (Dhaka calendar days; no time zones involved). */

export interface DateRange {
  from: string;
  to: string;
}

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(s: string | null | undefined): s is string {
  if (!s) return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const toDate = (ymd: string) => {
  const m = RE.exec(ymd)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (ymd: string, n: number): string => fmt(new Date(toDate(ymd).getTime() + n * 86_400_000));
export const daysBetween = (from: string, to: string): number => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
export const lastDayOfMonth = (y: number, m0: number): number => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}
export function endOfMonth(ymd: string): string {
  const d = toDate(ymd);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
export function startOfQuarter(ymd: string): string {
  const d = toDate(ymd);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)));
}
export function startOfYear(ymd: string): string {
  return `${ymd.slice(0, 4)}-01-01`;
}

/** Shifts by whole months, clamping the day (31 Mar -1 month = 28/29 Feb). A month-end stays a month-end. */
export function addMonths(ymd: string, n: number): string {
  const d = toDate(ymd);
  const wasMonthEnd = d.getUTCDate() === lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth());
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m0 = total - y * 12;
  const last = lastDayOfMonth(y, m0);
  const day = wasMonthEnd ? last : Math.min(d.getUTCDate(), last);
  return fmt(new Date(Date.UTC(y, m0, day)));
}

export const PRESETS = ['today', 'yesterday', 'last7', 'last30', 'last90', 'mtd', 'lastMonth', 'qtd', 'ytd'] as const;
export type PresetId = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PresetId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  mtd: 'This month',
  lastMonth: 'Last month',
  qtd: 'This quarter',
  ytd: 'This year',
};

export function resolvePreset(preset: PresetId, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'mtd':
      return { from: startOfMonth(today), to: today };
    case 'lastMonth': {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case 'qtd':
      return { from: startOfQuarter(today), to: today };
    case 'ytd':
      return { from: startOfYear(today), to: today };
  }
}

export const COMPARE_MODES = ['none', 'previous', 'lastMonth', 'lastYear'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const COMPARE_LABELS: Record<CompareMode, string> = {
  none: 'No comparison',
  previous: 'Previous period',
  lastMonth: 'Same period last month',
  lastYear: 'Same period last year',
};

export function resolveCompare(range: DateRange, mode: CompareMode): DateRange | null {
  switch (mode) {
    case 'none':
      return null;
    case 'previous': {
      const n = daysBetween(range.from, range.to) + 1;
      return { from: addDays(range.from, -n), to: addDays(range.from, -1) };
    }
    case 'lastMonth':
      return { from: addMonths(range.from, -1), to: addMonths(range.to, -1) };
    case 'lastYear':
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
  }
}
