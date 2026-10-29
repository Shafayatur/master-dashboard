import 'server-only';
import { addDays, addMonths, endOfMonth, startOfMonth } from '@/lib/filters/dates';
import { Params, pgTs, utcBounds, type QueryFn } from './sql-filters';
import { perInvestorCte, segmentCase } from './segment-sql';

export type SegmentKey = 'active' | 'recently_active' | 'cooling' | 'inactive' | 'prospect';
export const SEGMENT_ORDER: SegmentKey[] = ['active', 'recently_active', 'cooling', 'inactive', 'prospect'];

export interface Thresholds {
  recentlyActiveDays: number;
  coolingDays: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { recentlyActiveDays: 30, coolingDays: 60 };
/** Lifetime-value tier boundaries in BDT: tiers are below the 1st, between each pair, and above the last. */
export const DEFAULT_BANDS = [50_000, 200_000, 1_000_000, 5_000_000];

export interface SegmentRow {
  key: SegmentKey;
  investors: number;
  /** Share of all investors, 0-100. */
  share: number;
  lifetimeValue: number;
  avgLifetimeValue: number;
}
export interface TierRow {
  min: number;
  max: number | null;
  investors: number;
  value: number;
  investorShare: number;
  valueShare: number;
}
export interface Concentration {
  investors: number;
  total: number;
  top10Share: number;
  top20PctShare: number;
}
export interface CohortRow {
  /** First day of the registration month, YYYY-MM-DD. */
  month: string;
  registered: number;
  d7: number;
  d30: number;
  d90: number;
  ever: number;
  /** A window is "complete" once every investor in the cohort has had that many days to invest. */
  complete7: boolean;
  complete30: boolean;
  complete90: boolean;
}
export interface InvestorsData {
  generatedAt: string;
  totalInvestors: number;
  segments: SegmentRow[];
  tiers: TierRow[];
  concentration: Concentration;
  cohorts: CohortRow[];
  medianDaysToFirst: number | null;
}

const num = (v: unknown): number => Number(v ?? 0);
const pct = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);

/** Approved lifetime deposits per investor. */
const LTV = `ltv AS (
  SELECT o."userId", SUM(d.amount) AS ltv
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved' GROUP BY o."userId"
)`;
const INVESTOR = `u."deletedAt" IS NULL AND u."userType"::text = 'investor'`;

/**
 * Snapshot as of `now`. Only 'invested' (running) and 'closed' (finished) orders count as investments.
 * Maturity = last return_schedules date, else investmentDate + product duration.
 */
export async function segments(q: QueryFn, now: Date, t: Thresholds = DEFAULT_THRESHOLDS): Promise<SegmentRow[]> {
  const p = new Params();
  const nowTs = `${p.add(pgTs(now))}::timestamp`;
  const recent = `${p.add(t.recentlyActiveDays)}::int`;
  const cooling = `${p.add(t.coolingDays)}::int`;
  const rows = await q(
    `WITH sched AS (
  SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
), ord AS (
  SELECT o."userId", o.status::text AS status,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o.status::text IN ('invested', 'closed')
), ${perInvestorCte(nowTs)}, ${LTV}
SELECT seg, COUNT(*)::int AS investors, COALESCE(SUM(v), 0)::float8 AS lifetime_value FROM (
  SELECT COALESCE(l.ltv, 0) AS v, ${segmentCase(nowTs, recent, cooling)} AS seg
  FROM per LEFT JOIN ltv l ON l."userId" = per.user_id
) t GROUP BY seg`,
    p.values,
  );
  const by = new Map(rows.map((r) => [String(r.seg), r]));
  const total = rows.reduce((s, r) => s + num(r.investors), 0);
  return SEGMENT_ORDER.map((key) => {
    const r = by.get(key);
    const investors = num(r?.investors);
    const lifetimeValue = num(r?.lifetime_value);
    return { key, investors, share: pct(investors, total), lifetimeValue, avgLifetimeValue: investors > 0 ? lifetimeValue / investors : 0 };
  });
}

export async function tiers(q: QueryFn, bands: number[] = DEFAULT_BANDS): Promise<TierRow[]> {
  const p = new Params();
  const cases = bands.map((b, i) => `WHEN l.ltv < ${p.add(b)}::float8 THEN ${i}`).join(' ');
  const rows = await q(
    `WITH ${LTV}
SELECT tier, COUNT(*)::int AS investors, SUM(v)::float8 AS value FROM (
  SELECT l.ltv AS v, CASE ${cases} ELSE ${bands.length} END AS tier
  FROM ltv l JOIN "user" u ON u.id = l."userId" WHERE ${INVESTOR}
) t GROUP BY tier`,
    p.values,
  );
  const totalInv = rows.reduce((s, r) => s + num(r.investors), 0);
  const totalVal = rows.reduce((s, r) => s + num(r.value), 0);
  return Array.from({ length: bands.length + 1 }, (_, i) => {
    const r = rows.find((x) => num(x.tier) === i);
    return {
      min: i === 0 ? 0 : (bands[i - 1] as number),
      max: i < bands.length ? (bands[i] as number) : null,
      investors: num(r?.investors),
      value: num(r?.value),
      investorShare: pct(num(r?.investors), totalInv),
      valueShare: pct(num(r?.value), totalVal),
    };
  });
}

export async function concentration(q: QueryFn): Promise<Concentration> {
  const [r] = await q(
    `WITH ${LTV}, r AS (
  SELECT l.ltv, ROW_NUMBER() OVER (ORDER BY l.ltv DESC) AS rn, COUNT(*) OVER () AS cnt
  FROM ltv l JOIN "user" u ON u.id = l."userId" WHERE ${INVESTOR}
)
SELECT COALESCE(SUM(ltv), 0)::float8 AS total,
  COALESCE(SUM(ltv) FILTER (WHERE rn <= 10), 0)::float8 AS top10,
  COALESCE(SUM(ltv) FILTER (WHERE rn <= CEIL(cnt * 0.2)), 0)::float8 AS top20,
  COALESCE(MAX(cnt), 0)::int AS investors FROM r`,
  );
  const total = num(r?.total);
  return { investors: num(r?.investors), total, top10Share: pct(num(r?.top10), total), top20PctShare: pct(num(r?.top20), total) };
}

const FIRST_DEP = `fd AS (
  SELECT o."userId", MIN(d."date") AS first_dep
  FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved' GROUP BY o."userId"
)`;

/** Registration cohorts of the last 12 Dhaka months and how fast each converted to a first approved deposit. */
export async function cohorts(q: QueryFn, today: string): Promise<CohortRow[]> {
  const first = startOfMonth(addMonths(today, -11));
  const { start, end } = utcBounds({ from: first, to: today });
  const p = new Params();
  const rows = await q(
    `WITH ${FIRST_DEP}
SELECT to_char(date_trunc('month', u."createdAt" + interval '6 hours'), 'YYYY-MM-DD') AS month,
  COUNT(*)::int AS registered,
  COUNT(*) FILTER (WHERE fd.first_dep < u."createdAt" + interval '7 days')::int AS d7,
  COUNT(*) FILTER (WHERE fd.first_dep < u."createdAt" + interval '30 days')::int AS d30,
  COUNT(*) FILTER (WHERE fd.first_dep < u."createdAt" + interval '90 days')::int AS d90,
  COUNT(fd."userId")::int AS ever
FROM "user" u LEFT JOIN fd ON fd."userId" = u.id
WHERE ${INVESTOR} AND u."createdAt" >= ${p.add(start)}::timestamp AND u."createdAt" < ${p.add(end)}::timestamp
GROUP BY 1`,
    p.values,
  );
  return Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(first, i);
    const r = rows.find((x) => String(x.month) === month);
    const last = endOfMonth(month);
    return {
      month,
      registered: num(r?.registered),
      d7: num(r?.d7),
      d30: num(r?.d30),
      d90: num(r?.d90),
      ever: num(r?.ever),
      complete7: addDays(last, 7) <= today,
      complete30: addDays(last, 30) <= today,
      complete90: addDays(last, 90) <= today,
    };
  });
}

export async function medianDaysToFirst(q: QueryFn): Promise<number | null> {
  const [r] = await q(
    `WITH ${FIRST_DEP}
SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fd.first_dep - u."createdAt")) / 86400))::float8 AS median
FROM "user" u JOIN fd ON fd."userId" = u.id WHERE ${INVESTOR} AND fd.first_dep >= u."createdAt"`,
  );
  return r?.median === null || r?.median === undefined ? null : Math.round(num(r.median) * 10) / 10;
}

export async function loadInvestors(q: QueryFn, today: string, now: Date): Promise<InvestorsData> {
  const [segs, tr, conc, coh, median] = await Promise.all([segments(q, now), tiers(q), concentration(q), cohorts(q, today), medianDaysToFirst(q)]);
  return {
    generatedAt: now.toISOString(),
    totalInvestors: segs.reduce((s, x) => s + x.investors, 0),
    segments: segs,
    tiers: tr,
    concentration: conc,
    cohorts: coh,
    medianDaysToFirst: median,
  };
}
