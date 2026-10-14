/** Number formatting shared by server and client components. Pure: no Intl/timezone surprises. */
export type MoneyUnit = 'm' | 'lakh';
export const MONEY_UNIT_COOKIE = 'md_unit';

export const parseMoneyUnit = (v: string | undefined): MoneyUnit => (v === 'lakh' ? 'lakh' : 'm');

const group = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 21.11M / 845.3K / 1.20B, or 2.11 Cr / 45.30 L when the lakh/crore unit is chosen. */
export function formatMoney(n: number, unit: MoneyUnit = 'm'): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (unit === 'lakh') {
    if (v >= 9_999_500) return `${sign}${(v / 1e7).toFixed(2)} Cr`;
    if (v >= 99_995) return `${sign}${(v / 1e5).toFixed(2)} L`;
    return `${sign}${group(v)}`;
  }
  if (v >= 999_995_000) return `${sign}${(v / 1e9).toFixed(2)}B`;
  if (v >= 999_950) return `${sign}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1_000) return `${sign}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${group(v)}`;
}

export const formatInt = (n: number): string => (n < 0 ? '-' : '') + group(Math.abs(n));

/** Percentage change from prev to cur. null when it is undefined (prev is 0 and cur is not). */
export function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
