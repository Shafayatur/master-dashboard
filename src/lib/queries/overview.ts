import 'server-only';
import { addDays, addMonths, daysBetween, endOfMonth, startOfMonth, type DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import type { Attention, Bucket, CommandCenterData, PeriodKpis, SalesKpis, SeriesPoint, TargetPacing } from '@/lib/dashboard/types';
import { dhakaTs } from '@/lib/time';
import { Params, investorJoin, pgTs, productPredicates, salesBase, utcBounds, type QueryFn } from './sql-filters';

const num = (v: unknown): number => Number(v ?? 0);

export const STUCK_BOOKING_DAYS = 3;
export const MATURING_WITHIN_DAYS = 14;

export async function salesKpis(q: QueryFn, f: Filters, r: DateRange): Promise<SalesKpis> {
  const p = new Params();
  const b = salesBase(f, r, p, false, {
    materializeFirstDeposit: true,
    joinFirstDeposit: false,
  });
  const investorKind = f.investorKind === 'new'
    ? `fd.first_dep >= ${b.s} AND fd.first_dep < ${b.e}`
    : f.investorKind === 'old'
      ? `fd.first_dep < ${b.s}`
      : 'TRUE';
  const aggregateFilter = ` FILTER (WHERE b.dep_id IS NOT NULL AND (${investorKind}))`;
  const [row] = await q(
    `WITH ${b.cte}
SELECT COALESCE(SUM(b.amount)${aggregateFilter}, 0)::float8 AS sales,
  COUNT(*)${aggregateFilter}::int AS deposits,
  COUNT(DISTINCT b."orderId")${aggregateFilter}::int AS tickets_invested,
  COUNT(DISTINCT b."userId")${aggregateFilter}::int AS unique_investors,
  COUNT(DISTINCT b."userId") FILTER (WHERE b.dep_id IS NOT NULL AND (${investorKind}) AND fd.first_dep >= ${b.s} AND fd.first_dep < ${b.e})::int AS new_investors,
  COUNT(DISTINCT b."userId") FILTER (WHERE b.dep_id IS NOT NULL AND (${investorKind}) AND fd.first_dep < ${b.s})::int AS old_investors
FROM base b FULL OUTER JOIN first_dep fd ON fd."userId" = b."userId"`,
    p.values,
  );
  return {
    sales: num(row?.sales),
    deposits: num(row?.deposits),
    ticketsInvested: num(row?.tickets_invested),
    uniqueInvestors: num(row?.unique_investors),
    newInvestors: num(row?.new_investors),
    oldInvestors: num(row?.old_investors),
  };
}

export async function registrations(q: QueryFn, r: DateRange): Promise<number> {
  const p = new Params();
  const { start, end } = utcBounds(r);
  const [row] = await q(
    `SELECT COUNT(*)::int AS n FROM "user" u
WHERE u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  AND u."createdAt" >= ${p.add(start)}::timestamp AND u."createdAt" < ${p.add(end)}::timestamp`,
    p.values,
  );
  return num(row?.n);
}

export async function ticketsBooked(q: QueryFn, f: Filters, r: DateRange): Promise<{ booked: number; cancelled: number }> {
  const p = new Params();
  const { start, end } = utcBounds(r);
  const preds = [
    `o."deletedAt" IS NULL`,
    `o."createdAt" >= ${p.add(start)}::timestamp`,
    `o."createdAt" < ${p.add(end)}::timestamp`,
    ...productPredicates(f, p),
  ];
  const [row] = await q(
    `SELECT COUNT(*)::int AS booked, COUNT(*) FILTER (WHERE o.status::text = 'cancelled')::int AS cancelled
FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
WHERE ${preds.join(' AND ')}`,
    p.values,
  );
  return { booked: num(row?.booked), cancelled: num(row?.cancelled) };
}

export async function periodKpis(q: QueryFn, f: Filters, r: DateRange): Promise<PeriodKpis> {
  const [sales, regs, booked] = await Promise.all([salesKpis(q, f, r), registrations(q, r), ticketsBooked(q, f, r)]);
  return { ...sales, registrations: regs, ticketsBooked: booked.booked, ticketsCancelled: booked.cancelled };
}

// ------------------------------------------------------------------ trend

/** Daily points for ranges up to ~3 months, monthly beyond that. */
export const bucketFor = (r: DateRange): Bucket => (daysBetween(r.from, r.to) + 1 <= 92 ? 'day' : 'month');

export function bucketLabels(r: DateRange, bucket: Bucket): string[] {
  const out: string[] = [];
  if (bucket === 'day') {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  } else {
    for (let d = startOfMonth(r.from); d <= r.to; d = addMonths(d, 1)) out.push(d);
  }
  return out;
}

interface SalesBucketValue {
  value: number;
  reinvest: number;
}

async function salesByBucket(q: QueryFn, f: Filters, r: DateRange, bucket: Bucket): Promise<Map<string, SalesBucketValue>> {
  const p = new Params();
  const b = salesBase(f, r, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT to_char(date_trunc('${bucket}', ${dhakaTs('dep_date')}), 'YYYY-MM-DD') AS label,
  SUM(amount)::float8 AS value,
  COALESCE(SUM(amount) FILTER (WHERE payment_method = 'reinvest'), 0)::float8 AS reinvest
FROM base GROUP BY 1 ORDER BY 1`,
    p.values,
  );
  return new Map(rows.map((x) => [String(x.label), { value: num(x.value), reinvest: num(x.reinvest) }]));
}

interface SalesSeriesDataPoint extends SeriesPoint {
  reinvest: number;
}

async function salesSeriesData(q: QueryFn, f: Filters): Promise<{ bucket: Bucket; points: SalesSeriesDataPoint[] }> {
  const bucket = bucketFor(f.range);
  const [cur, cmp] = await Promise.all([
    salesByBucket(q, f, f.range, bucket),
    f.compareRange ? salesByBucket(q, f, f.compareRange, bucket) : Promise.resolve(null),
  ]);
  const labels = bucketLabels(f.range, bucket);
  const cmpLabels = f.compareRange ? bucketLabels(f.compareRange, bucket) : [];
  const points = labels.map((label, i): SalesSeriesDataPoint => {
    const current = cur.get(label);
    const cl = cmpLabels[i];
    return {
      label,
      value: current?.value ?? 0,
      reinvest: current?.reinvest ?? 0,
      compare: cmp && cl ? (cmp.get(cl)?.value ?? 0) : null,
      compareLabel: cl ?? null,
    };
  });
  return { bucket, points };
}

export async function salesSeries(q: QueryFn, f: Filters): Promise<{ bucket: Bucket; points: SeriesPoint[] }> {
  const series = await salesSeriesData(q, f);
  return { bucket: series.bucket, points: series.points.map(({ label, value, compare, compareLabel }) => ({ label, value, compare, compareLabel })) };
}

export async function salesInvestmentSeries(
  q: QueryFn,
  f: Filters,
): Promise<{ bucket: Bucket; points: { label: string; value: number; reinvest: number }[] }> {
  const series = await salesSeriesData(q, f);
  return {
    bucket: series.bucket,
    points: series.points.map(({ label, value, reinvest }) => ({ label, value, reinvest })),
  };
}

// ------------------------------------------------------------------ attention (always "right now", not filtered)

export async function attention(q: QueryFn, now: Date): Promise<Attention> {
  const nowTs = pgTs(now);
  const [pending, stuck, payouts, maturing] = await Promise.all([
    q(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(d.amount), 0)::float8 AS amount
FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
WHERE d."deletedAt" IS NULL AND d.status::text = 'pending'`,
    ),
    q(
      `SELECT COUNT(*)::int AS n FROM "order" o ${investorJoin('o."userId"')}
WHERE o."deletedAt" IS NULL AND o.status::text IN ('booked', 'verifying')
  AND o."createdAt" < $1::timestamp - interval '${STUCK_BOOKING_DAYS} days'`,
      [nowTs],
    ),
    q(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(r.amount), 0)::float8 AS amount
FROM returns r WHERE r."deletedAt" IS NULL AND r.status::text = 'initiated'`,
    ),
    q(
      `WITH sched AS (
  SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
), m AS (
  SELECT o."totalAmount" AS total,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
  LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o.status::text = 'invested'
)
SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float8 AS amount FROM m
WHERE maturity >= $1::timestamp AND maturity < $1::timestamp + interval '${MATURING_WITHIN_DAYS} days'`,
      [nowTs],
    ),
  ]);
  return {
    pendingDeposits: { count: num(pending[0]?.n), amount: num(pending[0]?.amount) },
    stuckBookings: { count: num(stuck[0]?.n), olderThanDays: STUCK_BOOKING_DAYS },
    payoutsInFlight: { count: num(payouts[0]?.n), amount: num(payouts[0]?.amount) },
    maturingSoon: { count: num(maturing[0]?.n), amount: num(maturing[0]?.amount), withinDays: MATURING_WITHIN_DAYS },
  };
}

// ------------------------------------------------------------------ monthly target pacing

export async function targetPacing(
  q: QueryFn,
  getTarget: (monthStart: string) => Promise<number | null>,
  f: Filters,
  today: string,
): Promise<TargetPacing | null> {
  const refDay = f.range.to < today ? f.range.to : today;
  const month = startOfMonth(refDay);
  const target = await getTarget(month);
  if (target === null || target <= 0) return null;

  const p = new Params();
  const b = salesBase(f, { from: month, to: refDay }, p, true);
  const [row] = await q(`WITH ${b.cte} SELECT COALESCE(SUM(amount), 0)::float8 AS sales FROM base`, p.values);
  const actual = num(row?.sales);

  const daysInMonth = daysBetween(month, endOfMonth(refDay)) + 1;
  const daysElapsed = daysBetween(month, refDay) + 1;
  const remaining = daysInMonth - daysElapsed;
  return {
    month,
    target,
    actual,
    pct: (actual / target) * 100,
    daysInMonth,
    daysElapsed,
    projected: (actual / daysElapsed) * daysInMonth,
    requiredPerDay: remaining > 0 ? Math.max(0, (target - actual) / remaining) : null,
  };
}

// ------------------------------------------------------------------ everything the page needs

export interface Deps {
  q: QueryFn;
  getTarget: (monthStart: string) => Promise<number | null>;
}

export async function loadCommandCenter(deps: Deps, f: Filters, today: string, now: Date): Promise<CommandCenterData> {
  const { q, getTarget } = deps;
  const [current, previous, trend, att, target] = await Promise.all([
    periodKpis(q, f, f.range),
    f.compareRange ? periodKpis(q, f, f.compareRange) : Promise.resolve(null),
    salesSeries(q, f),
    attention(q, now),
    targetPacing(q, getTarget, f, today),
  ]);
  return {
    generatedAt: now.toISOString(),
    range: f.range,
    compareRange: f.compareRange,
    bucket: trend.bucket,
    current,
    previous,
    series: trend.points,
    attention: att,
    target,
  };
}
