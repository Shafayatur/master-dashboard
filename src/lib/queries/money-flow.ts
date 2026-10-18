import 'server-only';
import { addDays, addMonths, startOfMonth, type DateRange } from '@/lib/filters/dates';
import { parseFilters } from '@/lib/filters/schema';
import { dhakaTs } from '@/lib/time';
import { attention, salesKpis } from './overview';
import { Params, investorJoin, pgTs, salesBase, utcBounds, type QueryFn } from './sql-filters';

export const REINVEST_WINDOW_DAYS = 30;
const WEEKS = 12;
const OVERDUE_DAYS = 30;

export interface PayoutMonth {
  month: string;
  completed: { count: number; amount: number };
  initiated: { count: number; amount: number };
}
export interface ScheduleWeek {
  week: string;
  count: number;
  total: number;
  profit: number;
  principal: number;
}
export interface MaturityWeek {
  week: string;
  count: number;
  principal: number;
}
export interface ReinvestLevel {
  count: number;
  amount: number;
  investors: number;
}
export interface MoneyFlowData {
  generatedAt: string;
  range: DateRange;
  windowDays: number;
  payoutsByMonth: PayoutMonth[];
  inFlight: { count: number; amount: number };
  schedule: { weeks: ScheduleWeek[]; coverage: { invested: number; withSchedule: number } };
  maturity: { overdue: { count: number; amount: number }; weeks: MaturityWeek[] };
  reinvest: {
    total: ReinvestLevel;
    /** Deposits whose payment method is "reinvest". */
    confirmed: ReinvestLevel;
    /** Other deposits by an investor who was paid out in the previous `windowDays`. An estimate: we cannot prove the money is the same. */
    estimated: ReinvestLevel;
    repeat: { investing: number; returning: number };
  };
  conversion: {
    paidInvestors: number;
    paidAmount: number;
    r30: number;
    r60: number;
    r90: number;
    complete30: boolean;
    complete60: boolean;
    complete90: boolean;
  };
}

const num = (v: unknown): number => Number(v ?? 0);

export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
}

async function payoutsByMonth(q: QueryFn, today: string): Promise<PayoutMonth[]> {
  const first = startOfMonth(addMonths(today, -11));
  const { start, end } = utcBounds({ from: first, to: today });
  const p = new Params();
  const rows = await q(
    `SELECT to_char(date_trunc('month', ${dhakaTs('r."date"')}), 'YYYY-MM-DD') AS month, r.status::text AS status,
  COUNT(*)::int AS n, COALESCE(SUM(r.amount), 0)::float8 AS amount
FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
WHERE r."deletedAt" IS NULL AND r."date" >= ${p.add(start)}::timestamp AND r."date" < ${p.add(end)}::timestamp GROUP BY 1, 2`,
    p.values,
  );
  return Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(first, i);
    const pick = (s: string) => {
      const r = rows.find((x) => String(x.month) === month && String(x.status) === s);
      return { count: num(r?.n), amount: num(r?.amount) };
    };
    return { month, completed: pick('completed'), initiated: pick('initiated') };
  });
}

async function schedule(q: QueryFn, now: string, today: string) {
  const [weekRows, cov] = await Promise.all([
    q(
      `SELECT to_char(date_trunc('week', ${dhakaTs('rs."paymentDate"')}), 'YYYY-MM-DD') AS week, COUNT(*)::int AS n,
  COALESCE(SUM(rs."totalAmount"), 0)::float8 AS total, COALESCE(SUM(rs."profitAmount"), 0)::float8 AS profit, COALESCE(SUM(rs."principalAmount"), 0)::float8 AS principal
FROM return_schedules rs JOIN "order" o ON o.id = rs."orderId" AND o."deletedAt" IS NULL AND o.status::text = 'invested' ${investorJoin('o."userId"')}
WHERE rs."deletedAt" IS NULL AND rs."paymentDate" >= $1::timestamp AND rs."paymentDate" < $1::timestamp + (${WEEKS * 7}::int * interval '1 day') GROUP BY 1`,
      [now],
    ),
    q(
      `SELECT COUNT(*)::int AS invested,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM return_schedules rs WHERE rs."orderId" = o.id AND rs."deletedAt" IS NULL))::int AS with_schedule
FROM "order" o ${investorJoin('o."userId"')} WHERE o."deletedAt" IS NULL AND o.status::text = 'invested'`,
    ),
  ]);
  const first = mondayOf(today);
  const weeks = Array.from({ length: WEEKS }, (_, i): ScheduleWeek => {
    const week = addDays(first, i * 7);
    const r = weekRows.find((x) => String(x.week) === week);
    return { week, count: num(r?.n), total: num(r?.total), profit: num(r?.profit), principal: num(r?.principal) };
  });
  return { weeks, coverage: { invested: num(cov[0]?.invested), withSchedule: num(cov[0]?.with_schedule) } };
}

async function maturity(q: QueryFn, now: string, today: string) {
  const rows = await q(
    `WITH sched AS (
  SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
), m AS (
  SELECT o."totalAmount" AS amount,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')} LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o.status::text = 'invested'
)
SELECT CASE WHEN maturity < $1::timestamp THEN 'overdue' ELSE to_char(date_trunc('week', ${dhakaTs('maturity')}), 'YYYY-MM-DD') END AS bucket,
  COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float8 AS amount
FROM m
WHERE maturity >= $1::timestamp - ($2::int * interval '1 day') AND maturity < $1::timestamp + ($3::int * interval '1 day')
GROUP BY 1`,
    [now, OVERDUE_DAYS, WEEKS * 7],
  );
  const first = mondayOf(today);
  const od = rows.find((x) => String(x.bucket) === 'overdue');
  return {
    overdue: { count: num(od?.n), amount: num(od?.amount) },
    weeks: Array.from({ length: WEEKS }, (_, i): MaturityWeek => {
      const week = addDays(first, i * 7);
      const r = rows.find((x) => String(x.bucket) === week);
      return { week, count: num(r?.n), principal: num(r?.amount) };
    }),
  };
}

async function reinvestment(q: QueryFn, range: DateRange, today: string) {
  const neutral = { ...parseFilters(new URLSearchParams(), today), range };
  const p = new Params();
  const b = salesBase(neutral, range, p, true);
  const w = p.add(REINVEST_WINDOW_DAYS);
  const [row] = await q(
    `WITH ${b.cte}, x AS (
  SELECT bs.amount, bs."userId", d."paymentMethod"::text AS method,
    EXISTS (SELECT 1 FROM returns r JOIN "order" ro ON ro.id = r."orderId" AND ro."deletedAt" IS NULL
      WHERE ro."userId" = bs."userId" AND r."deletedAt" IS NULL AND r.status::text = 'completed'
        AND r."date" <= bs.dep_date AND r."date" > bs.dep_date - (${w}::int * interval '1 day')) AS linked
  FROM base bs JOIN deposits d ON d.id = bs.dep_id
)
SELECT COUNT(*)::int AS all_n, COALESCE(SUM(amount), 0)::float8 AS all_amt, COUNT(DISTINCT "userId")::int AS all_inv,
  COUNT(*) FILTER (WHERE method = 'reinvest')::int AS c_n, COALESCE(SUM(amount) FILTER (WHERE method = 'reinvest'), 0)::float8 AS c_amt,
  COUNT(DISTINCT "userId") FILTER (WHERE method = 'reinvest')::int AS c_inv,
  COUNT(*) FILTER (WHERE method <> 'reinvest' AND linked)::int AS e_n, COALESCE(SUM(amount) FILTER (WHERE method <> 'reinvest' AND linked), 0)::float8 AS e_amt,
  COUNT(DISTINCT "userId") FILTER (WHERE method <> 'reinvest' AND linked)::int AS e_inv
FROM x`,
    p.values,
  );
  const k = await salesKpis(q, neutral, range);
  return {
    total: { count: num(row?.all_n), amount: num(row?.all_amt), investors: num(row?.all_inv) },
    confirmed: { count: num(row?.c_n), amount: num(row?.c_amt), investors: num(row?.c_inv) },
    estimated: { count: num(row?.e_n), amount: num(row?.e_amt), investors: num(row?.e_inv) },
    repeat: { investing: k.uniqueInvestors, returning: k.oldInvestors },
  };
}

async function conversion(q: QueryFn, range: DateRange, today: string) {
  const { start, end } = utcBounds(range);
  const p = new Params();
  const s = p.add(start);
  const e = p.add(end);
  const within = (d: number) =>
    `COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM deposits d JOIN "order" o2 ON o2.id = d."orderId" AND o2."deletedAt" IS NULL
  WHERE o2."userId" = fp."userId" AND d."deletedAt" IS NULL AND d.status::text = 'approved'
    AND d."date" >= fp.first_payout AND d."date" < fp.first_payout + interval '${d} days'))::int`;
  const [row] = await q(
    `WITH fp AS (
  SELECT o."userId", MIN(r."date") AS first_payout, SUM(r.amount) AS paid
  FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed' AND r."date" >= ${s}::timestamp AND r."date" < ${e}::timestamp GROUP BY o."userId"
)
SELECT COUNT(*)::int AS paid_investors, COALESCE(SUM(paid), 0)::float8 AS paid_amount,
  ${within(30)} AS r30, ${within(60)} AS r60, ${within(90)} AS r90 FROM fp`,
    p.values,
  );
  return {
    paidInvestors: num(row?.paid_investors),
    paidAmount: num(row?.paid_amount),
    r30: num(row?.r30),
    r60: num(row?.r60),
    r90: num(row?.r90),
    complete30: addDays(range.to, 30) <= today,
    complete60: addDays(range.to, 60) <= today,
    complete90: addDays(range.to, 90) <= today,
  };
}

export async function loadMoneyFlow(q: QueryFn, range: DateRange, today: string, now: Date): Promise<MoneyFlowData> {
  const nowTs = pgTs(now);
  const [pm, att, sch, mat, re, conv] = await Promise.all([
    payoutsByMonth(q, today),
    attention(q, now),
    schedule(q, nowTs, today),
    maturity(q, nowTs, today),
    reinvestment(q, range, today),
    conversion(q, range, today),
  ]);
  return {
    generatedAt: now.toISOString(),
    range,
    windowDays: REINVEST_WINDOW_DAYS,
    payoutsByMonth: pm,
    inFlight: { count: att.payoutsInFlight.count, amount: att.payoutsInFlight.amount },
    schedule: sch,
    maturity: mat,
    reinvest: re,
    conversion: conv,
  };
}
