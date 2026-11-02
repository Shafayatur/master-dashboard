import 'server-only';
import { addDays, addMonths, startOfMonth, type DateRange } from '@/lib/filters/dates';
import { parseFilters } from '@/lib/filters/schema';
import { dhakaTs } from '@/lib/time';
import { attention } from './overview';
import { Params, investorJoin, pgTs, salesBase, utcBounds, type QueryFn } from './sql-filters';

export const REINVEST_WINDOW_DAYS = 30;
const WEEKS = 12;

export interface PayoutMonth {
  month: string;
  completed: { count: number; amount: number };
  initiated: { count: number; amount: number };
}
export interface CashFlowMonth {
  month: string;
  moneyIn: number;
  reinvest: number;
  moneyOut: number;
  net: number;
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
  cashFlowByMonth: CashFlowMonth[];
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
  running: {
    orders: number;
    investors: number;
    amount: number;
    withSchedule: number;
    scheduledPayouts: {
      installments: number;
      total: number;
      principal: number;
      profit: number;
    };
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

/** Whole-life monthly cash flow from the first eligible activity through today, zero-filled by Dhaka month. */
export async function cashFlowByMonth(q: QueryFn, today: string): Promise<CashFlowMonth[]> {
  const { end } = utcBounds({ from: today, to: today });
  const p = new Params();
  const endTs = `${p.add(end)}::timestamp`;
  const todayDate = `${p.add(today)}::date`;
  const rows = await q(
    `WITH activity AS (
  SELECT ${dhakaTs('d."date"')} AS activity_date
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved' AND d."date" < ${endTs}
  UNION ALL
  SELECT ${dhakaTs('r."date"')} AS activity_date
  FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed' AND r."date" < ${endTs}
), first_month AS (
  SELECT date_trunc('month', MIN(activity_date)) AS month FROM activity
), month_series AS (
  SELECT generate_series(first_month.month, date_trunc('month', ${todayDate}::timestamp), interval '1 month') AS month
  FROM first_month WHERE first_month.month IS NOT NULL
), money_in AS (
  SELECT to_char(date_trunc('month', ${dhakaTs('d."date"')}), 'YYYY-MM-DD') AS month,
    COALESCE(SUM(d.amount), 0)::float8 AS amount,
    COALESCE(SUM(d.amount) FILTER (WHERE d."paymentMethod"::text = 'reinvest'), 0)::float8 AS reinvest
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
    AND d."date" < ${endTs}
  GROUP BY 1
), money_out AS (
  SELECT to_char(date_trunc('month', ${dhakaTs('r."date"')}), 'YYYY-MM-DD') AS month,
    COALESCE(SUM(r.amount), 0)::float8 AS amount
  FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed'
    AND r."date" < ${endTs}
  GROUP BY 1
)
SELECT to_char(ms.month, 'YYYY-MM-DD') AS month, COALESCE(i.amount, 0)::float8 AS money_in,
  COALESCE(i.reinvest, 0)::float8 AS reinvest, COALESCE(o.amount, 0)::float8 AS money_out
FROM month_series ms
LEFT JOIN money_in i ON i.month = to_char(ms.month, 'YYYY-MM-DD')
LEFT JOIN money_out o ON o.month = to_char(ms.month, 'YYYY-MM-DD')
ORDER BY ms.month`,
    p.values,
  );
  return rows.map((row) => {
    const moneyIn = num(row?.money_in);
    const reinvest = num(row?.reinvest);
    const moneyOut = num(row?.money_out);
    return {
      month: String(row.month),
      moneyIn,
      reinvest,
      moneyOut,
      net: moneyIn - moneyOut,
    };
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
WHERE maturity < $1::timestamp + ($2::int * interval '1 day')
GROUP BY 1`,
    [now, WEEKS * 7],
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

async function runningPortfolio(q: QueryFn, now: string): Promise<MoneyFlowData['running']> {
  const [row] = await q(
    `WITH sched AS MATERIALIZED (
  SELECT "orderId",
    MAX("paymentDate") AS last_pay,
    COUNT(*) FILTER (WHERE "paymentDate" >= $1::timestamp)::int AS future_installments,
    COALESCE(SUM("totalAmount") FILTER (WHERE "paymentDate" >= $1::timestamp), 0)::float8 AS future_total,
    COALESCE(SUM("principalAmount") FILTER (WHERE "paymentDate" >= $1::timestamp), 0)::float8 AS future_principal,
    COALESCE(SUM("profitAmount") FILTER (WHERE "paymentDate" >= $1::timestamp), 0)::float8 AS future_profit
  FROM return_schedules
  WHERE "deletedAt" IS NULL
  GROUP BY "orderId"
), active_orders AS (
  SELECT o.id, o."userId", o."totalAmount" AS amount,
    (s."orderId" IS NOT NULL) AS has_schedule,
    COALESCE(s.future_installments, 0) AS future_installments,
    COALESCE(s.future_total, 0) AS future_total,
    COALESCE(s.future_principal, 0) AS future_principal,
    COALESCE(s.future_profit, 0) AS future_profit,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o
  JOIN products p ON p.id = o."productId"
  ${investorJoin('o."userId"')}
  LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o.status::text = 'invested'
)
SELECT COUNT(*)::int AS orders,
  COUNT(DISTINCT "userId")::int AS investors,
  COALESCE(SUM(amount), 0)::float8 AS amount,
  COUNT(*) FILTER (WHERE has_schedule)::int AS with_schedule,
  COALESCE(SUM(future_installments), 0)::int AS installments,
  COALESCE(SUM(future_total), 0)::float8 AS scheduled_total,
  COALESCE(SUM(future_principal), 0)::float8 AS scheduled_principal,
  COALESCE(SUM(future_profit), 0)::float8 AS scheduled_profit
FROM active_orders
WHERE maturity >= $1::timestamp`,
    [now],
  );
  return {
    orders: num(row?.orders),
    investors: num(row?.investors),
    amount: num(row?.amount),
    withSchedule: num(row?.with_schedule),
    scheduledPayouts: {
      installments: num(row?.installments),
      total: num(row?.scheduled_total),
      principal: num(row?.scheduled_principal),
      profit: num(row?.scheduled_profit),
    },
  };
}

async function reinvestment(q: QueryFn, range: DateRange, today: string) {
  const neutral = { ...parseFilters(new URLSearchParams(), today), range };
  const p = new Params();
  const b = salesBase(neutral, range, p, true, { includeFirstDeposit: true });
  const w = p.add(REINVEST_WINDOW_DAYS);
  const [row] = await q(
    `WITH ${b.cte}, paid_ret AS MATERIALIZED (
  SELECT ro."userId", r."date" AS payout_date
  FROM returns r JOIN "order" ro ON ro.id = r."orderId" AND ro."deletedAt" IS NULL ${investorJoin('ro."userId"')}
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed'
    AND r."date" >= ${b.s} - (${w}::int * interval '1 day') AND r."date" < ${b.e}
  GROUP BY ro."userId", r."date"
), x AS MATERIALIZED (
  SELECT bs.dep_id, bs.amount, bs."userId", bs.first_dep, bs.payment_method AS method,
    COALESCE(BOOL_OR(pr.payout_date <= bs.dep_date AND pr.payout_date > bs.dep_date - (${w}::int * interval '1 day')), FALSE) AS linked
  FROM base bs
  FULL OUTER JOIN paid_ret pr ON pr."userId" = bs."userId"
  GROUP BY bs.dep_id, bs.amount, bs."userId", bs.first_dep, bs.payment_method
)
SELECT COUNT(*) FILTER (WHERE dep_id IS NOT NULL)::int AS all_n,
  COALESCE(SUM(amount) FILTER (WHERE dep_id IS NOT NULL), 0)::float8 AS all_amt,
  COUNT(DISTINCT "userId") FILTER (WHERE dep_id IS NOT NULL)::int AS all_inv,
  COUNT(*) FILTER (WHERE dep_id IS NOT NULL AND method = 'reinvest')::int AS c_n,
  COALESCE(SUM(amount) FILTER (WHERE dep_id IS NOT NULL AND method = 'reinvest'), 0)::float8 AS c_amt,
  COUNT(DISTINCT "userId") FILTER (WHERE dep_id IS NOT NULL AND method = 'reinvest')::int AS c_inv,
  COUNT(*) FILTER (WHERE dep_id IS NOT NULL AND method <> 'reinvest' AND linked)::int AS e_n,
  COALESCE(SUM(amount) FILTER (WHERE dep_id IS NOT NULL AND method <> 'reinvest' AND linked), 0)::float8 AS e_amt,
  COUNT(DISTINCT "userId") FILTER (WHERE dep_id IS NOT NULL AND method <> 'reinvest' AND linked)::int AS e_inv,
  COUNT(DISTINCT "userId") FILTER (WHERE dep_id IS NOT NULL AND first_dep < ${b.s})::int AS returning
FROM x`,
    p.values,
  );
  return {
    total: { count: num(row?.all_n), amount: num(row?.all_amt), investors: num(row?.all_inv) },
    confirmed: { count: num(row?.c_n), amount: num(row?.c_amt), investors: num(row?.c_inv) },
    estimated: { count: num(row?.e_n), amount: num(row?.e_amt), investors: num(row?.e_inv) },
    repeat: { investing: num(row?.all_inv), returning: num(row?.returning) },
  };
}

async function conversion(q: QueryFn, range: DateRange, today: string) {
  const { start, end } = utcBounds(range);
  const p = new Params();
  const s = p.add(start);
  const e = p.add(end);
  const [row] = await q(
    `WITH fp AS MATERIALIZED (
  SELECT o."userId", MIN(r."date") AS first_payout, SUM(r.amount) AS paid
  FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed' AND r."date" >= ${s}::timestamp AND r."date" < ${e}::timestamp GROUP BY o."userId"
), dep AS MATERIALIZED (
  SELECT o2."userId", d."date" AS dep_date
  FROM deposits d JOIN "order" o2 ON o2.id = d."orderId" AND o2."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
    AND d."date" >= ${s}::timestamp AND d."date" < ${e}::timestamp + interval '90 days'
), fp_with_next_dep AS MATERIALIZED (
  SELECT fp."userId", fp.paid, fp.first_payout,
    MIN(dep.dep_date) FILTER (WHERE dep.dep_date >= fp.first_payout AND dep.dep_date < fp.first_payout + interval '90 days') AS next_dep
  FROM fp
  FULL OUTER JOIN dep ON dep."userId" = fp."userId"
  GROUP BY fp."userId", fp.paid, fp.first_payout
)
SELECT COUNT(*) FILTER (WHERE "userId" IS NOT NULL)::int AS paid_investors,
  COALESCE(SUM(paid) FILTER (WHERE "userId" IS NOT NULL), 0)::float8 AS paid_amount,
  COUNT(*) FILTER (WHERE "userId" IS NOT NULL AND next_dep < first_payout + interval '30 days')::int AS r30,
  COUNT(*) FILTER (WHERE "userId" IS NOT NULL AND next_dep < first_payout + interval '60 days')::int AS r60,
  COUNT(*) FILTER (WHERE "userId" IS NOT NULL AND next_dep IS NOT NULL)::int AS r90
FROM fp_with_next_dep`,
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
  const [pm, cashFlow, att, sch, mat, re, conv, running] = await Promise.all([
    payoutsByMonth(q, today),
    cashFlowByMonth(q, today),
    attention(q, now),
    schedule(q, nowTs, today),
    maturity(q, nowTs, today),
    reinvestment(q, range, today),
    conversion(q, range, today),
    runningPortfolio(q, nowTs),
  ]);
  return {
    generatedAt: now.toISOString(),
    range,
    windowDays: REINVEST_WINDOW_DAYS,
    payoutsByMonth: pm,
    cashFlowByMonth: cashFlow,
    inFlight: { count: att.payoutsInFlight.count, amount: att.payoutsInFlight.amount },
    schedule: sch,
    maturity: mat,
    reinvest: re,
    conversion: conv,
    running,
  };
}
