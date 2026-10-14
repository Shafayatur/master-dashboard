import type { DateRange } from '@/lib/filters/dates';

export type Bucket = 'day' | 'month';

export interface SalesKpis {
  sales: number;
  deposits: number;
  ticketsInvested: number;
  uniqueInvestors: number;
  newInvestors: number;
  oldInvestors: number;
}

export interface PeriodKpis extends SalesKpis {
  registrations: number;
  ticketsBooked: number;
  ticketsCancelled: number;
}

export interface Attention {
  pendingDeposits: { count: number; amount: number };
  stuckBookings: { count: number; olderThanDays: number };
  payoutsInFlight: { count: number; amount: number };
  maturingSoon: { count: number; amount: number; withinDays: number };
}

export interface TargetPacing {
  month: string; // first day of the month, YYYY-MM-DD
  target: number;
  actual: number;
  pct: number;
  daysInMonth: number;
  daysElapsed: number;
  projected: number;
  requiredPerDay: number | null;
}

export interface SeriesPoint {
  label: string;
  value: number;
  compare: number | null;
  compareLabel: string | null;
}

/** Plain JSON only (it goes through unstable_cache): no Date, no bigint. */
export interface CommandCenterData {
  generatedAt: string;
  range: DateRange;
  compareRange: DateRange | null;
  bucket: Bucket;
  current: PeriodKpis;
  previous: PeriodKpis | null;
  series: SeriesPoint[];
  attention: Attention;
  target: TargetPacing | null;
}
