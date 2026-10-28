import 'server-only';
import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  isValidYmd,
  startOfMonth,
  startOfYear,
  type DateRange,
} from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import type { Filters } from '@/lib/filters/schema';
import type { Bucket } from '@/lib/dashboard/types';
import { dhakaTs } from '@/lib/time';
import { mondayOf } from './money-flow';
import { bucketOf } from './home';
import { bucketFor, bucketLabels } from './overview';
import { Params, investorJoin, productPredicates, salesBase, utcBounds, type QueryFn } from './sql-filters';

const num = (v: unknown): number => Number(v ?? 0);

/** Plain JSON only (it goes through unstable_cache): no Date, no bigint. */
export type SalesExtras = {
  /** Same bucket rule as the sales trend: daily up to 92 days, monthly beyond. */
  bucket: Bucket;
  /**
   * One entry per bucket label (zero-filled). Counts distinct investors with filtered sales in the bucket:
   * `newInvestors` = their first-ever approved deposit falls in that same bucket, `returning` = it falls in an earlier one.
   */
  newVsReturning: { label: string; newInvestors: number; returning: number }[];
  /** Always 7 entries, Monday first (`day` 0 = Monday), zero-filled. */
  weekday: { day: number; label: string; amount: number; deposits: number }[];
  /** 7 rows (Mon..Sun) x 24 columns ("00".."23", Dhaka hour), counts of orders created. */
  bookingHeat: { rows: string[]; cols: string[]; matrix: number[][] };
  bookingActivity: BookingActivity;
};

export const BOOKING_VIEWS = ['day', 'week', 'month', 'year'] as const;
export type BookingView = (typeof BOOKING_VIEWS)[number];

export interface BookingActivity {
  view: BookingView;
  title: string;
  subtitle: string;
  rows: string[];
  cols: string[];
  matrix: number[][];
  cellLabels?: string[][];
  total: number;
}

export type InvestorsExtras = {
  /** Registrations in the selected range, grouped in Dhaka time and split by whether they have any approved deposit. */
  registrationsOverTime: {
    bucket: Bucket;
    points: { label: string; registered: number; invested: number }[];
  };
  /** Last 12 Dhaka months including the current one; `month` is the first day of the month, YYYY-MM-DD. */
  registrationsVsFirst: { month: string; registered: number; firstInvestments: number }[];
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 0 = Monday ... 6 = Sunday, in Dhaka time, for a stored UTC timestamp column. */
const dhakaWeekday = (col: string): string => `(EXTRACT(isodow FROM ${dhakaTs(col)})::int - 1)`;

export function parseBookingView(value: string | undefined): BookingView {
  return BOOKING_VIEWS.find((view) => view === value) ?? 'day';
}

export function resolveBookingAnchor(value: string | undefined, range: DateRange, today: string): string {
  if (value && isValidYmd(value)) return value;
  return range.to < today ? range.to : today;
}

// ------------------------------------------------------------------ new vs returning investors

/**
 * Filtered sales per bucket, split by whether the investor's first-ever approved deposit is in the same bucket (new) or in
 * an earlier one (returning). An investor whose first approved deposit comes later than the deposit shown (for example a
 * pending deposit made before the first approval) is neither new nor returning in that bucket and is left out.
 */
async function newVsReturning(q: QueryFn, f: Filters, bucket: Bucket): Promise<SalesExtras['newVsReturning']> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const depBucket = bucketOf(bucket, 'dep_date');
  const firstBucket = bucketOf(bucket, 'first_dep');
  const rows = await q(
    `WITH ${b.cte}
SELECT ${depBucket} AS label,
  COUNT(DISTINCT "userId") FILTER (WHERE ${firstBucket} = ${depBucket})::int AS new_investors,
  COUNT(DISTINCT "userId") FILTER (WHERE ${firstBucket} < ${depBucket})::int AS returning_investors
FROM base GROUP BY 1`,
    p.values,
  );
  const byLabel = new Map(rows.map((r) => [String(r.label), r]));
  return bucketLabels(f.range, bucket).map((label) => {
    const r = byLabel.get(label);
    return { label, newInvestors: num(r?.new_investors), returning: num(r?.returning_investors) };
  });
}

// ------------------------------------------------------------------ weekday pattern

/**
 * Filtered sales by Dhaka weekday. `deposits."date"` may carry no time of day, so only the weekday is derived from it;
 * there is deliberately no hour dimension for sales (see `bookingHeat` for the hourly view).
 */
async function weekdayPattern(q: QueryFn, f: Filters): Promise<SalesExtras['weekday']> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT ${dhakaWeekday('dep_date')} AS dow, SUM(amount)::float8 AS amount, COUNT(*)::int AS deposits
FROM base GROUP BY 1`,
    p.values,
  );
  const byDay = new Map(rows.map((r) => [num(r.dow), r]));
  return WEEKDAYS.map((label, day) => ({ day, label, amount: num(byDay.get(day)?.amount), deposits: num(byDay.get(day)?.deposits) }));
}

// ------------------------------------------------------------------ bookings by weekday x hour

/** Orders created in the range (any status, investors only, product/order filters applied) by Dhaka weekday and hour. */
async function bookingHeat(q: QueryFn, f: Filters): Promise<SalesExtras['bookingHeat']> {
  const p = new Params();
  const { start, end } = utcBounds(f.range);
  const preds = [
    `o."deletedAt" IS NULL`,
    `o."createdAt" >= ${p.add(start)}::timestamp`,
    `o."createdAt" < ${p.add(end)}::timestamp`,
    ...productPredicates(f, p),
  ];
  const rows = await q(
    `SELECT ${dhakaWeekday('o."createdAt"')} AS dow, EXTRACT(hour FROM ${dhakaTs('o."createdAt"')})::int AS hr, COUNT(*)::int AS n
FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
WHERE ${preds.join(' AND ')} GROUP BY 1, 2`,
    p.values,
  );
  const matrix = WEEKDAYS.map(() => HOURS.map(() => 0));
  for (const r of rows) {
    const line = matrix[num(r.dow)];
    const hour = num(r.hr);
    if (line && hour >= 0 && hour < HOURS.length) line[hour] = num(r.n);
  }
  return { rows: [...WEEKDAYS], cols: [...HOURS], matrix };
}

const matrixTotal = (matrix: number[][]): number => matrix.reduce((sum, row) => sum + row.reduce((rowSum, n) => rowSum + n, 0), 0);

async function bookingDailyCounts(q: QueryFn, f: Filters, range: DateRange, today: string): Promise<Map<string, number>> {
  const to = range.to < today ? range.to : today;
  if (to < range.from) return new Map();
  const p = new Params();
  const { start, end } = utcBounds({ from: range.from, to });
  const predicates = [
    `o."deletedAt" IS NULL`,
    `o."createdAt" >= ${p.add(start)}::timestamp`,
    `o."createdAt" < ${p.add(end)}::timestamp`,
    ...productPredicates(f, p),
  ];
  const rows = await q(
    `SELECT to_char(o."createdAt" + interval '6 hours', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
WHERE ${predicates.join(' AND ')}
GROUP BY 1 ORDER BY 1`,
    p.values,
  );
  return new Map(rows.map((row) => [String(row.day), num(row.n)]));
}

function monthTitle(anchor: string): string {
  return `${MONTH_NAMES[Number(anchor.slice(5, 7)) - 1] ?? ''} ${anchor.slice(0, 4)}`;
}

function dateAtMondayIndex(monday: string, index: number): string {
  return addDays(monday, index);
}

function makeActivity(view: BookingView, title: string, subtitle: string, rows: string[], cols: string[], matrix: number[][], cellLabels?: string[][]): BookingActivity {
  return {
    view,
    title,
    subtitle,
    rows,
    cols,
    matrix,
    ...(cellLabels ? { cellLabels } : {}),
    total: matrixTotal(matrix),
  };
}

export async function bookingActivity(
  q: QueryFn,
  f: Filters,
  view: BookingView,
  anchor: string,
  today: string,
  dayData?: SalesExtras['bookingHeat'],
): Promise<BookingActivity> {
  const selectedView = parseBookingView(view);
  const safeAnchor = resolveBookingAnchor(anchor, f.range, today);
  if (selectedView === 'day') {
    const heat = dayData ?? (await bookingHeat(q, f));
    return makeActivity(
      'day',
      'By weekday and hour',
      `Bookings by weekday and hour, ${formatRange(f.range)}`,
      heat.rows,
      heat.cols,
      heat.matrix,
    );
  }

  if (selectedView === 'week') {
    const endMonday = mondayOf(safeAnchor);
    const firstMonday = addDays(endMonday, -63);
    const end = addDays(endMonday, 6);
    const counts = await bookingDailyCounts(q, f, { from: firstMonday, to: end }, today);
    const mondayDates = Array.from({ length: 10 }, (_, index) => addDays(firstMonday, index * 7));
    const rows = mondayDates.map((monday) => `${Number(monday.slice(8, 10))} ${MONTHS[Number(monday.slice(5, 7)) - 1] ?? ''}`);
    const matrix = mondayDates.map((monday) =>
      Array.from({ length: 7 }, (_, day) => counts.get(dateAtMondayIndex(monday, day)) ?? 0),
    );
    const label = `${Number(endMonday.slice(8, 10))} ${MONTHS[Number(endMonday.slice(5, 7)) - 1] ?? ''} ${endMonday.slice(0, 4)}`;
    return makeActivity('week', `Week of ${label}`, `Bookings per day, 10 weeks to ${label}`, rows, WEEKDAYS, matrix);
  }

  if (selectedView === 'month') {
    const monthStart = startOfMonth(safeAnchor);
    const monthEnd = endOfMonth(safeAnchor);
    const firstMonday = mondayOf(monthStart);
    const lastMonday = mondayOf(monthEnd);
    const weekCount = Math.floor(daysBetween(firstMonday, lastMonday) / 7) + 1;
    const counts = await bookingDailyCounts(q, f, { from: monthStart, to: monthEnd }, today);
    const mondays = Array.from({ length: weekCount }, (_, index) => addDays(firstMonday, index * 7));
    const matrix = mondays.map((monday) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = dateAtMondayIndex(monday, day);
        return date >= monthStart && date <= monthEnd ? counts.get(date) ?? 0 : 0;
      }),
    );
    const cellLabels = mondays.map((monday) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = dateAtMondayIndex(monday, day);
        return date >= monthStart && date <= monthEnd ? String(Number(date.slice(8, 10))) : '';
      }),
    );
    const title = monthTitle(safeAnchor);
    return makeActivity('month', title, `Bookings per day, ${title}`, mondays.map((_, index) => `Week ${index + 1}`), WEEKDAYS, matrix, cellLabels);
  }

  const yearStart = startOfYear(safeAnchor);
  const yearEnd = `${safeAnchor.slice(0, 4)}-12-31`;
  const counts = new Map<number, number[]>();
  const clippedEnd = yearEnd < today ? yearEnd : today;
  if (clippedEnd >= yearStart) {
    const p = new Params();
    const { start, end } = utcBounds({ from: yearStart, to: clippedEnd });
    const predicates = [
      `o."deletedAt" IS NULL`,
      `o."createdAt" >= ${p.add(start)}::timestamp`,
      `o."createdAt" < ${p.add(end)}::timestamp`,
      ...productPredicates(f, p),
    ];
    const rows = await q(
      `SELECT EXTRACT(ISODOW FROM o."createdAt" + interval '6 hours')::int AS dow,
  EXTRACT(MONTH FROM o."createdAt" + interval '6 hours')::int AS mon,
  COUNT(*)::int AS n
FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
WHERE ${predicates.join(' AND ')}
GROUP BY 1, 2`,
      p.values,
    );
    for (const row of rows) {
      const month = num(row.mon);
      const dow = num(row.dow) - 1;
      const values = counts.get(dow) ?? Array.from({ length: 12 }, () => 0);
      if (month >= 1 && month <= 12) values[month - 1] = num(row.n);
      counts.set(dow, values);
    }
  }
  const matrix = Array.from({ length: 7 }, (_, dow) => counts.get(dow) ?? Array.from({ length: 12 }, () => 0));
  const year = safeAnchor.slice(0, 4);
  return makeActivity('year', year, `Bookings by weekday and month, ${year}`, WEEKDAYS, MONTHS, matrix);
}

export async function loadSalesExtras(
  q: QueryFn,
  f: Filters,
  _now: Date,
  view: BookingView,
  anchor: string,
  today: string,
): Promise<SalesExtras> {
  const bucket = bucketFor(f.range);
  const [mix, weekday, heat] = await Promise.all([newVsReturning(q, f, bucket), weekdayPattern(q, f), bookingHeat(q, f)]);
  const activity = await bookingActivity(q, f, view, anchor, today, heat);
  return { bucket, newVsReturning: mix, weekday, bookingHeat: heat, bookingActivity: activity };
}

// ------------------------------------------------------------------ registrations vs first investments

async function registrationsSeries(
  q: QueryFn,
  range: DateRange,
  bucket: Bucket,
): Promise<InvestorsExtras['registrationsOverTime']> {
  const p = new Params();
  const { start, end } = utcBounds(range);
  const startParam = p.add(start);
  const endParam = p.add(end);
  const rows = await q(
    `WITH fd AS (
  SELECT o."userId", MIN(d."date") AS first_dep
  FROM deposits d
  JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
  GROUP BY o."userId"
)
SELECT to_char(date_trunc('${bucket}', u."createdAt" + interval '6 hours'), 'YYYY-MM-DD') AS label,
  COUNT(*)::int AS registered,
  COUNT(fd."userId")::int AS invested
FROM "user" u LEFT JOIN fd ON fd."userId" = u.id
WHERE u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  AND u."createdAt" >= ${startParam}::timestamp AND u."createdAt" < ${endParam}::timestamp
GROUP BY 1 ORDER BY 1`,
    p.values,
  );
  const byLabel = new Map(
    rows.map((row) => [String(row.label), { registered: num(row.registered), invested: num(row.invested) }]),
  );
  return {
    bucket,
    points: bucketLabels(range, bucket).map((label) => {
      const row = byLabel.get(label);
      return { label, registered: row?.registered ?? 0, invested: row?.invested ?? 0 };
    }),
  };
}

/**
 * Last 12 Dhaka months (current included, up to today): investors registered per month, and investors whose first-ever
 * approved deposit falls in that month. Investors only; no dashboard filters. A registration and a first investment of
 * the same person can fall in different months, so the two series are not a cohort funnel.
 */
export async function loadInvestorsExtras(q: QueryFn, today: string, range: DateRange): Promise<InvestorsExtras> {
  const first = startOfMonth(addMonths(today, -11));
  const { start, end } = utcBounds({ from: first, to: today });
  const regP = new Params();
  const firstP = new Params();
  const bucket = bucketFor(range);
  const [registrationsOverTime, regs, firsts] = await Promise.all([
    registrationsSeries(q, range, bucket),
    q(
      `SELECT ${bucketOf('month', 'u."createdAt"')} AS month, COUNT(*)::int AS n FROM "user" u
WHERE u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  AND u."createdAt" >= ${regP.add(start)}::timestamp AND u."createdAt" < ${regP.add(end)}::timestamp GROUP BY 1`,
      regP.values,
    ),
    q(
      `SELECT ${bucketOf('month', 'f.first_dep')} AS month, COUNT(*)::int AS n FROM (
  SELECT o."userId", MIN(d."date") AS first_dep
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
  GROUP BY o."userId"
) f WHERE f.first_dep >= ${firstP.add(start)}::timestamp AND f.first_dep < ${firstP.add(end)}::timestamp GROUP BY 1`,
      firstP.values,
    ),
  ]);
  const regBy = new Map(regs.map((r) => [String(r.month), num(r.n)]));
  const firstBy = new Map(firsts.map((r) => [String(r.month), num(r.n)]));
  return {
    registrationsOverTime,
    registrationsVsFirst: Array.from({ length: 12 }, (_, i) => {
      const month = addMonths(first, i);
      return { month, registered: regBy.get(month) ?? 0, firstInvestments: firstBy.get(month) ?? 0 };
    }),
  };
}
