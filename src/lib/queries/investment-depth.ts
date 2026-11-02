import 'server-only';
import { dhakaTs } from '@/lib/time';
import { Params, investorJoin, type QueryFn, type Row } from './sql-filters';

export const INVESTMENT_DEPTH_BUCKETS = ['1', '2', '3', '4plus'] as const;
export type InvestmentDepthBucketKey = (typeof INVESTMENT_DEPTH_BUCKETS)[number];
export type InvestmentDepthBucket = 'all' | InvestmentDepthBucketKey;

const LABELS: Record<InvestmentDepthBucketKey, string> = {
  '1': '1 investment',
  '2': '2 investments',
  '3': '3 investments',
  '4plus': '4+ investments',
};
const BUCKET_BOUNDS: Record<InvestmentDepthBucket, { min: number | null; max: number | null }> = {
  all: { min: null, max: null },
  '1': { min: 1, max: 1 },
  '2': { min: 2, max: 2 },
  '3': { min: 3, max: 3 },
  '4plus': { min: 4, max: null },
};

const num = (value: unknown): number => Number(value ?? 0);
const str = (value: unknown): string => String(value ?? '');
const INVESTMENT_ORDERS = `"order" o
  ${investorJoin('o."userId"')}
  WHERE o."deletedAt" IS NULL AND o.status::text IN ('invested', 'closed')`;

export interface InvestmentDepthBucketRow {
  key: InvestmentDepthBucketKey;
  label: string;
  investors: number;
  share: number;
}

export interface InvestmentDepth {
  total: number;
  buckets: InvestmentDepthBucketRow[];
  singleInvestors: number;
  multipleInvestors: number;
}

export interface InvestmentDepthInvestor {
  userId: number;
  name: string;
  phone: string;
  email: string;
  investments: number;
  lifetimeValue: number;
  firstInvestmentDate: string;
  latestInvestmentDate: string;
}

export function parseInvestmentDepthBucket(value: string | null): InvestmentDepthBucket | null {
  if (value === 'all') return value;
  return INVESTMENT_DEPTH_BUCKETS.find((bucket) => bucket === value) ?? null;
}

/** Snapshot counts, independent of dashboard filters and dates. */
export async function investmentDepth(q: QueryFn): Promise<InvestmentDepth> {
  const rows = await q(
    `WITH investor_orders AS (
  SELECT o."userId", COUNT(*)::int AS investments
  FROM ${INVESTMENT_ORDERS}
  GROUP BY o."userId"
)
SELECT investments, COUNT(*)::int AS investors
FROM investor_orders GROUP BY investments`,
  );
  const byCount = new Map(rows.map((row) => [num(row.investments), num(row.investors)]));
  const counts = INVESTMENT_DEPTH_BUCKETS.map((key) => {
    const investors = key === '4plus'
      ? [...byCount].reduce((sum, [count, value]) => sum + (count >= 4 ? value : 0), 0)
      : byCount.get(Number(key)) ?? 0;
    return { key, label: LABELS[key], investors };
  });
  const total = counts.reduce((sum, bucket) => sum + bucket.investors, 0);
  const buckets = counts.map((bucket) => ({
    ...bucket,
    share: total > 0 ? (bucket.investors / total) * 100 : 0,
  }));
  return {
    total,
    buckets,
    singleInvestors: byCount.get(1) ?? 0,
    multipleInvestors: [...byCount].reduce((sum, [count, value]) => sum + (count >= 2 ? value : 0), 0),
  };
}

/** Investor rows ordered by investment depth and approved-deposit lifetime value. */
export async function listInvestmentDepth(
  q: QueryFn,
  bucket: InvestmentDepthBucket = 'all',
  limit = 5000,
): Promise<InvestmentDepthInvestor[]> {
  const p = new Params();
  const bounds = BUCKET_BOUNDS[bucket];
  let countFilter = '';
  if (bounds.min !== null && bounds.max !== null) {
    countFilter = `WHERE investor_counts.investments = ${p.add(bounds.min)}::int`;
  } else if (bounds.min !== null) {
    countFilter = `WHERE investor_counts.investments >= ${p.add(bounds.min)}::int`;
  }
  const rowLimit = p.add(limit);
  const rows = await q(
    `WITH investor_orders AS (
  SELECT o."userId", COUNT(*)::int AS investments,
    MIN(o."investmentDate") AS first_date, MAX(o."investmentDate") AS latest_date
  FROM ${INVESTMENT_ORDERS}
  GROUP BY o."userId"
), investor_counts AS (
  SELECT investor_orders.* FROM investor_orders
), ltv AS (
  SELECT o."userId", SUM(d.amount) AS ltv
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
  GROUP BY o."userId"
)
SELECT u.id AS user_id, COALESCE(u.name, '') AS name, COALESCE(u.phone, '') AS phone,
  COALESCE(u.email, '') AS email, investor_counts.investments,
  COALESCE(ltv.ltv, 0)::float8 AS lifetime_value,
  to_char(${dhakaTs('investor_counts.first_date')}::date, 'YYYY-MM-DD') AS first_investment_date,
  to_char(${dhakaTs('investor_counts.latest_date')}::date, 'YYYY-MM-DD') AS latest_investment_date
FROM investor_counts
JOIN "user" u ON u.id = investor_counts."userId"
LEFT JOIN ltv ON ltv."userId" = investor_counts."userId"
${countFilter}
ORDER BY investor_counts.investments DESC, lifetime_value DESC, u.id ASC
LIMIT ${rowLimit}::int`,
    p.values,
  );
  return rows.map((row: Row) => ({
    userId: num(row.user_id),
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
    investments: num(row.investments),
    lifetimeValue: num(row.lifetime_value),
    firstInvestmentDate: str(row.first_investment_date),
    latestInvestmentDate: str(row.latest_investment_date),
  }));
}
