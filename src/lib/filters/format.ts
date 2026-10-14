import type { DateRange } from './dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const part = (ymd: string) => ({ y: ymd.slice(0, 4), m: MONTHS[Number(ymd.slice(5, 7)) - 1] ?? '', d: String(Number(ymd.slice(8, 10))) });

/** "13 Oct 2026", "1 – 13 Oct 2026", "28 Sep – 13 Oct 2026" or "28 Dec 2025 – 4 Jan 2026". Pure calendar text, no time zones. */
export function formatRange(r: DateRange): string {
  const a = part(r.from);
  const b = part(r.to);
  if (r.from === r.to) return `${b.d} ${b.m} ${b.y}`;
  if (a.y !== b.y) return `${a.d} ${a.m} ${a.y} – ${b.d} ${b.m} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${a.m} – ${b.d} ${b.m} ${b.y}`;
  return `${a.d} – ${b.d} ${b.m} ${b.y}`;
}
