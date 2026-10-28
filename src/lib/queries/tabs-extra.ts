import 'server-only';
import { addMonths, startOfMonth, type DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import type { Bucket } from '@/lib/dashboard/types';
import { dhakaTs } from '@/lib/time';
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
};

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

/** 0 = Monday ... 6 = Sunday, in Dhaka time, for a stored UTC timestamp column. */
const dhakaWeekday = (col: string): string => `(EXTRACT(isodow FROM ${dhakaTs(col)})::int - 1)`;

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

export async function loadSalesExtras(q: QueryFn, f: Filters, _now: Date): Promise<SalesExtras> {
  const bucket = bucketFor(f.range);
  const [mix, weekday, heat] = await Promise.all([newVsReturning(q, f, bucket), weekdayPattern(q, f), bookingHeat(q, f)]);
  return { bucket, newVsReturning: mix, weekday, bookingHeat: heat };
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
