import 'server-only';
import { addMonths, startOfMonth } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import type { Bucket, CommandCenterData } from '@/lib/dashboard/types';
import { dhakaTs } from '@/lib/time';
import { segments, type SegmentRow } from './investors';
import { bucketFor, bucketLabels, loadCommandCenter, type Deps } from './overview';
import { Params, investorJoin, pgTs, productPredicates, salesBase, utcBounds, type QueryFn } from './sql-filters';

const num = (v: unknown): number => Number(v ?? 0);

/** One slice of a donut. `share` is 0-100 of the sum of all returned rows. */
export type DonutRow = { key: string; label: string; value: number; share: number };

export type ActivityItem = {
  kind: 'deposit' | 'payout' | 'registration' | 'booking';
  /** ISO UTC instant, e.g. 2026-10-10T20:00:00Z. */
  at: string;
  title: string;
  name: string;
  userId: number | null;
  amount: number | null;
  status: string | null;
  orderId: number | null;
};

/** Plain JSON only (it goes through unstable_cache): no Date, no bigint. */
export type HomeData = CommandCenterData & {
  /** Every array has one value per `series` label (zero-filled). */
  kpiSpark: {
    sales: number[];
    ticketsInvested: number[];
    uniqueInvestors: number[];
    newInvestors: number[];
    registrations: number[];
    ticketsBooked: number[];
    avgTicket: number[];
  };
  payouts: number[];
  /** Last 6 Dhaka months including the current one; `month` is the first day of the month, YYYY-MM-DD. */
  salesVsReinvest: { month: string; reinvest: number; other: number }[];
  byProject: DonutRow[];
  byCategory: DonutRow[];
  payoutsByCategory: DonutRow[];
  segments: SegmentRow[];
  investorTotals: { registered: number; everInvested: number; active: number };
  recent: ActivityItem[];
};

/** Dhaka bucket label (first day of the day/month) of a stored UTC timestamp column. `bucket` is a typed constant, never user input. */
const bucketOf = (bucket: Bucket, col: string): string => `to_char(date_trunc('${bucket}', ${dhakaTs(col)}), 'YYYY-MM-DD')`;

const INVESTOR = `u."deletedAt" IS NULL AND u."userType"::text = 'investor'`;

// ------------------------------------------------------------------ sparklines

interface SalesBucket {
  sales: number;
  tickets: number;
  investors: number;
}

/** Approved-by-filter sales, distinct tickets and distinct investors per bucket (every dashboard filter applies). */
async function salesBuckets(q: QueryFn, f: Filters, bucket: Bucket): Promise<Map<string, SalesBucket>> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT ${bucketOf(bucket, 'dep_date')} AS label, SUM(amount)::float8 AS sales,
  COUNT(DISTINCT "orderId")::int AS tickets, COUNT(DISTINCT "userId")::int AS investors
FROM base GROUP BY 1`,
    p.values,
  );
  return new Map(rows.map((r) => [String(r.label), { sales: num(r.sales), tickets: num(r.tickets), investors: num(r.investors) }]));
}

/**
 * New investors per bucket: an investor with a deposit in the filtered range is counted once, in the bucket of their
 * first-ever approved deposit, when that falls inside the range. The buckets therefore add up to the KPI "new investors".
 */
async function newInvestorBuckets(q: QueryFn, f: Filters, bucket: Bucket): Promise<Map<string, number>> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT label, COUNT(*)::int AS n FROM (
  SELECT DISTINCT "userId", ${bucketOf(bucket, 'first_dep')} AS label FROM base WHERE first_dep >= ${b.s} AND first_dep < ${b.e}
) t GROUP BY label`,
    p.values,
  );
  return new Map(rows.map((r) => [String(r.label), num(r.n)]));
}

/** Registrations ignore the product/deposit filters (a signup has no product). */
async function registrationBuckets(q: QueryFn, f: Filters, bucket: Bucket): Promise<Map<string, number>> {
  const p = new Params();
  const { start, end } = utcBounds(f.range);
  const rows = await q(
    `SELECT ${bucketOf(bucket, 'u."createdAt"')} AS label, COUNT(*)::int AS n FROM "user" u
WHERE ${INVESTOR} AND u."createdAt" >= ${p.add(start)}::timestamp AND u."createdAt" < ${p.add(end)}::timestamp GROUP BY 1`,
    p.values,
  );
  return new Map(rows.map((r) => [String(r.label), num(r.n)]));
}

/** Orders created per bucket, any status, with the product filters (same rule as the "tickets booked" KPI). */
async function bookedBuckets(q: QueryFn, f: Filters, bucket: Bucket): Promise<Map<string, number>> {
  const p = new Params();
  const { start, end } = utcBounds(f.range);
  const preds = [
    `o."deletedAt" IS NULL`,
    `o."createdAt" >= ${p.add(start)}::timestamp`,
    `o."createdAt" < ${p.add(end)}::timestamp`,
    ...productPredicates(f, p),
  ];
  const rows = await q(
    `SELECT ${bucketOf(bucket, 'o."createdAt"')} AS label, COUNT(*)::int AS n
FROM "order" o JOIN products p ON p.id = o."productId" ${investorJoin('o."userId"')}
WHERE ${preds.join(' AND ')} GROUP BY 1`,
    p.values,
  );
  return new Map(rows.map((r) => [String(r.label), num(r.n)]));
}

/** Completed payouts per bucket (returns.status 'completed', returns."date"), investors only, no product filters. */
async function payoutBuckets(q: QueryFn, f: Filters, bucket: Bucket): Promise<Map<string, number>> {
  const p = new Params();
  const { start, end } = utcBounds(f.range);
  const rows = await q(
    `SELECT ${bucketOf(bucket, 'r."date"')} AS label, SUM(r.amount)::float8 AS amount
FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
WHERE r."deletedAt" IS NULL AND r.status::text = 'completed'
  AND r."date" >= ${p.add(start)}::timestamp AND r."date" < ${p.add(end)}::timestamp GROUP BY 1`,
    p.values,
  );
  return new Map(rows.map((r) => [String(r.label), num(r.amount)]));
}

// ------------------------------------------------------------------ sales vs reinvest

/** Last 6 Dhaka months (current included) of approved deposits, reinvest vs everything else. Investors only, no other filters. */
export async function salesVsReinvest(q: QueryFn, f: Filters, today: string): Promise<HomeData['salesVsReinvest']> {
  const first = startOfMonth(addMonths(today, -5));
  const p = new Params();
  const b = salesBase(f, { from: first, to: today }, p, true);
  const rows = await q(
    `WITH ${b.cte}
SELECT ${bucketOf('month', 'b.dep_date')} AS month,
  COALESCE(SUM(b.amount) FILTER (WHERE d."paymentMethod"::text = 'reinvest'), 0)::float8 AS reinvest,
  COALESCE(SUM(b.amount) FILTER (WHERE d."paymentMethod"::text IS DISTINCT FROM 'reinvest'), 0)::float8 AS other
FROM base b JOIN deposits d ON d.id = b.dep_id GROUP BY 1`,
    p.values,
  );
  return Array.from({ length: 6 }, (_, i) => {
    const month = addMonths(first, i);
    const r = rows.find((x) => String(x.month) === month);
    return { month, reinvest: num(r?.reinvest), other: num(r?.other) };
  });
}

// ------------------------------------------------------------------ donuts

/** Rows must arrive sorted by value, largest first. Keeps the top `n`, folds the rest into one "Others" row. */
export function topWithOthers(rows: { key: string; label: string; value: number }[], n = 5): DonutRow[] {
  const positive = rows.filter((r) => r.value > 0);
  const total = positive.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return [];
  const top = positive.slice(0, n);
  const rest = positive.slice(n);
  const items = rest.length ? [...top, { key: 'others', label: 'Others', value: rest.reduce((s, r) => s + r.value, 0) }] : top;
  return items.map((r) => ({ key: r.key, label: r.label, value: r.value, share: (r.value / total) * 100 }));
}

const toRows = (rows: Record<string, unknown>[]) => rows.map((r) => ({ key: String(r.key), label: String(r.label), value: num(r.value) }));

/** Top 5 projects by sales in the range (all dashboard filters apply) plus "Others". */
export async function salesByProject(q: QueryFn, f: Filters): Promise<DonutRow[]> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT p.id::text AS key, p.name AS label, SUM(b.amount)::float8 AS value
FROM base b JOIN "order" o ON o.id = b."orderId" JOIN products p ON p.id = o."productId"
GROUP BY p.id, p.name ORDER BY value DESC, p.id`,
    p.values,
  );
  return topWithOthers(toRows(rows));
}

/**
 * Top 5 categories by sales in the range plus "Others". A product that belongs to several categories counts in each of
 * them, so the shares are shares of the sum over categories (they add up to 100, but that sum can exceed total sales).
 */
export async function salesByCategory(q: QueryFn, f: Filters): Promise<DonutRow[]> {
  const p = new Params();
  const b = salesBase(f, f.range, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT c.id::text AS key, c.name AS label, SUM(b.amount)::float8 AS value
FROM base b JOIN "order" o ON o.id = b."orderId"
JOIN category_products cp ON cp."productsId" = o."productId"
JOIN categories c ON c.id = cp."categoriesId" AND c."deletedAt" IS NULL
GROUP BY c.id, c.name ORDER BY value DESC, c.id`,
    p.values,
  );
  return topWithOthers(toRows(rows));
}

/**
 * Completed payouts in the range by the paid order's product category, top 5 plus "Others". Investors only; the global
 * filters are not applied. Like sales by category, a product in several categories counts in each of them.
 */
export async function payoutsByCategory(q: QueryFn, f: Filters): Promise<DonutRow[]> {
  const p = new Params();
  const { start, end } = utcBounds(f.range);
  const rows = await q(
    `SELECT c.id::text AS key, c.name AS label, SUM(r.amount)::float8 AS value
FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
JOIN category_products cp ON cp."productsId" = o."productId"
JOIN categories c ON c.id = cp."categoriesId" AND c."deletedAt" IS NULL
WHERE r."deletedAt" IS NULL AND r.status::text = 'completed'
  AND r."date" >= ${p.add(start)}::timestamp AND r."date" < ${p.add(end)}::timestamp
GROUP BY c.id, c.name ORDER BY value DESC, c.id`,
    p.values,
  );
  return topWithOthers(toRows(rows));
}

// ------------------------------------------------------------------ investor totals and activity feed

/** All-time counts: registered investors and investors with at least one approved deposit. */
export async function investorCounts(q: QueryFn): Promise<{ registered: number; everInvested: number }> {
  const [r] = await q(
    `SELECT COUNT(*)::int AS registered,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
    WHERE o."userId" = u.id AND d."deletedAt" IS NULL AND d.status::text = 'approved'
  ))::int AS ever_invested
FROM "user" u WHERE ${INVESTOR}`,
  );
  return { registered: num(r?.registered), everInvested: num(r?.ever_invested) };
}

const RECENT_LIMIT = 10;

/**
 * Newest events first (ties: kind, then id). Not filtered by the dashboard filters. Events dated after `now` are left
 * out (the source data contains a few future-dated rows). Deposits use deposits."date", never deposits."createdAt".
 */
export async function recentActivity(q: QueryFn, now: Date): Promise<ActivityItem[]> {
  const nowTs = `$1::timestamp`;
  const rows = await q(
    `SELECT kind, to_char(happened, 'YYYY-MM-DD HH24:MI:SS') AS happened, title, name, user_id, amount, status, order_id FROM (
  (SELECT 'deposit' AS kind, d."date" AS happened, 'Deposit ' || d.status::text AS title, COALESCE(u.name, '') AS name,
      u.id AS user_id, d.amount::float8 AS amount, d.status::text AS status, o.id AS order_id, d.id AS ref
    FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
    WHERE d."deletedAt" IS NULL AND d.status::text IN ('approved', 'pending') AND d."date" <= ${nowTs}
    ORDER BY d."date" DESC, d.id DESC LIMIT ${RECENT_LIMIT})
  UNION ALL
  (SELECT 'payout' AS kind, r."date" AS happened, 'Payout completed' AS title, COALESCE(u.name, '') AS name,
      u.id AS user_id, r.amount::float8 AS amount, r.status::text AS status, o.id AS order_id, r.id AS ref
    FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL ${investorJoin('o."userId"')}
    WHERE r."deletedAt" IS NULL AND r.status::text = 'completed' AND r."date" <= ${nowTs}
    ORDER BY r."date" DESC, r.id DESC LIMIT ${RECENT_LIMIT})
  UNION ALL
  (SELECT 'registration' AS kind, u."createdAt" AS happened, 'New registration' AS title, COALESCE(u.name, '') AS name,
      u.id AS user_id, NULL::float8 AS amount, NULL::text AS status, NULL::int AS order_id, u.id AS ref
    FROM "user" u WHERE ${INVESTOR} AND u."createdAt" <= ${nowTs}
    ORDER BY u."createdAt" DESC, u.id DESC LIMIT ${RECENT_LIMIT})
  UNION ALL
  (SELECT 'booking' AS kind, o."createdAt" AS happened, 'Ticket ' || o.status::text AS title, COALESCE(u.name, '') AS name,
      u.id AS user_id, o."totalAmount"::float8 AS amount, o.status::text AS status, o.id AS order_id, o.id AS ref
    FROM "order" o ${investorJoin('o."userId"')}
    WHERE o."deletedAt" IS NULL AND o.status::text IN ('booked', 'verifying') AND o."createdAt" <= ${nowTs}
    ORDER BY o."createdAt" DESC, o.id DESC LIMIT ${RECENT_LIMIT})
) t ORDER BY happened DESC, kind, ref DESC LIMIT ${RECENT_LIMIT}`,
    [pgTs(now)],
  );
  return rows.map(
    (r): ActivityItem => ({
      kind: String(r.kind) as ActivityItem['kind'],
      at: `${String(r.happened).replace(' ', 'T')}Z`,
      title: String(r.title),
      name: String(r.name ?? ''),
      userId: r.user_id === null || r.user_id === undefined ? null : num(r.user_id),
      amount: r.amount === null || r.amount === undefined ? null : num(r.amount),
      status: r.status === null || r.status === undefined ? null : String(r.status),
      orderId: r.order_id === null || r.order_id === undefined ? null : num(r.order_id),
    }),
  );
}

// ------------------------------------------------------------------ everything the Command Center needs

const fill = <T>(labels: string[], m: Map<string, T>, zero: T): T[] => labels.map((l) => m.get(l) ?? zero);

export async function loadHome(deps: Deps, f: Filters, today: string, now: Date): Promise<HomeData> {
  const { q } = deps;
  const bucket = bucketFor(f.range);
  const labels = bucketLabels(f.range, bucket);
  const [base, sales, fresh, regs, booked, paid, mix, byProject, byCategory, payByCategory, segs, counts, recent] = await Promise.all([
    loadCommandCenter(deps, f, today, now),
    salesBuckets(q, f, bucket),
    newInvestorBuckets(q, f, bucket),
    registrationBuckets(q, f, bucket),
    bookedBuckets(q, f, bucket),
    payoutBuckets(q, f, bucket),
    salesVsReinvest(q, f, today),
    salesByProject(q, f),
    salesByCategory(q, f),
    payoutsByCategory(q, f),
    segments(q, now),
    investorCounts(q),
    recentActivity(q, now),
  ]);
  const zero: SalesBucket = { sales: 0, tickets: 0, investors: 0 };
  const perBucket = labels.map((l) => sales.get(l) ?? zero);
  return {
    ...base,
    kpiSpark: {
      sales: perBucket.map((x) => x.sales),
      ticketsInvested: perBucket.map((x) => x.tickets),
      uniqueInvestors: perBucket.map((x) => x.investors),
      newInvestors: fill(labels, fresh, 0),
      registrations: fill(labels, regs, 0),
      ticketsBooked: fill(labels, booked, 0),
      avgTicket: perBucket.map((x) => (x.tickets > 0 ? x.sales / x.tickets : 0)),
    },
    payouts: fill(labels, paid, 0),
    salesVsReinvest: mix,
    byProject,
    byCategory,
    payoutsByCategory: payByCategory,
    segments: segs,
    investorTotals: { ...counts, active: segs.find((s) => s.key === 'active')?.investors ?? 0 },
    recent,
  };
}
