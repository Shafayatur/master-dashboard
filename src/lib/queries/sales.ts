import 'server-only';
import type { DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import type { Bucket } from '@/lib/dashboard/types';
import { Params, salesBase, type QueryFn } from './sql-filters';
import { salesInvestmentSeries, salesKpis } from './overview';

export type SalesDim = 'product' | 'category' | 'tenure' | 'returnType' | 'paymentMethod' | 'depositStatus';

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  deposits: number;
  investors: number;
  /** Share of the breakdown total, 0-100. A product in several categories counts in each, so category shares are of the sum. */
  share: number;
}

const TENURE = `split_part(p."productDuration"::text, ' ', 1)`;

/** Whitelisted dimensions. Only these strings are ever interpolated into SQL. */
const DIMS: Record<SalesDim, { select: string; join: string; group: string; order: string; limit: number }> = {
  product: { select: `p.id::text AS key, p.name AS label`, join: '', group: 'p.id, p.name', order: 'value DESC', limit: 10 },
  category: {
    select: `c.id::text AS key, c.name AS label`,
    join: `JOIN category_products cp ON cp."productsId" = p.id JOIN categories c ON c.id = cp."categoriesId" AND c."deletedAt" IS NULL`,
    group: 'c.id, c.name',
    order: 'value DESC',
    limit: 10,
  },
  tenure: {
    select: `${TENURE} AS key, CASE WHEN ${TENURE} = '1' THEN '1 month' ELSE ${TENURE} || ' months' END AS label`,
    join: '',
    group: TENURE,
    order: `(${TENURE})::int`,
    limit: 24,
  },
  returnType: { select: `p."productReturnType"::text AS key, p."productReturnType"::text AS label`, join: '', group: 'p."productReturnType"::text', order: 'value DESC', limit: 10 },
  paymentMethod: { select: `d."paymentMethod"::text AS key, d."paymentMethod"::text AS label`, join: '', group: 'd."paymentMethod"::text', order: 'value DESC', limit: 10 },
  depositStatus: { select: `d.status::text AS key, d.status::text AS label`, join: '', group: 'd.status::text', order: 'value DESC', limit: 5 },
};

const ALL_STATUSES = ['approved', 'pending', 'rejected'];

export async function salesBreakdown(q: QueryFn, f: Filters, r: DateRange, dim: SalesDim): Promise<BreakdownRow[]> {
  const d = DIMS[dim];
  // The status split always shows every status, whatever the deposit-status filter says.
  const filters: Filters = dim === 'depositStatus' ? { ...f, depositStatus: ALL_STATUSES as Filters['depositStatus'] } : f;
  const p = new Params();
  const b = salesBase(filters, r, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT ${d.select}, SUM(b.amount)::float8 AS value, COUNT(*)::int AS deposits, COUNT(DISTINCT b."userId")::int AS investors
FROM base b
JOIN deposits d ON d.id = b.dep_id
JOIN "order" o ON o.id = b."orderId"
JOIN products p ON p.id = o."productId"
${d.join}
GROUP BY ${d.group}
ORDER BY ${d.order}
LIMIT ${d.limit}`,
    p.values,
  );
  const total = rows.reduce((s, x) => s + Number(x.value ?? 0), 0);
  return rows.map((x) => ({
    key: String(x.key),
    label: String(x.label),
    value: Number(x.value ?? 0),
    deposits: Number(x.deposits ?? 0),
    investors: Number(x.investors ?? 0),
    share: total > 0 ? (Number(x.value ?? 0) / total) * 100 : 0,
  }));
}

export interface SalesData {
  generatedAt: string;
  range: DateRange;
  total: { sales: number; deposits: number; uniqueInvestors: number; newInvestors: number; oldInvestors: number };
  series: { bucket: Bucket; points: { label: string; value: number; reinvest: number }[] };
  breakdowns: Record<SalesDim, BreakdownRow[]>;
}

const DIM_KEYS = Object.keys(DIMS) as SalesDim[];

export async function loadSales(q: QueryFn, f: Filters, now: Date): Promise<SalesData> {
  const [total, series, ...lists] = await Promise.all([
    salesKpis(q, f, f.range),
    salesInvestmentSeries(q, f),
    ...DIM_KEYS.map((k) => salesBreakdown(q, f, f.range, k)),
  ]);
  return {
    generatedAt: now.toISOString(),
    range: f.range,
    total: {
      sales: total.sales,
      deposits: total.deposits,
      uniqueInvestors: total.uniqueInvestors,
      newInvestors: total.newInvestors,
      oldInvestors: total.oldInvestors,
    },
    series: {
      bucket: series.bucket,
      points: series.points,
    },
    breakdowns: Object.fromEntries(DIM_KEYS.map((k, i) => [k, lists[i]])) as Record<SalesDim, BreakdownRow[]>,
  };
}
