import 'server-only';
import type { DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import { deltaPct } from '@/lib/format/money';
import { salesKpis } from './overview';
import { salesBreakdown, type BreakdownRow } from './sales';
import { Params, salesBase, type QueryFn } from './sql-filters';

export interface ScorecardRow {
  key: string;
  label: string;
  tenureMonths: number;
  returnType: string;
  value: number;
  /** Share of the period's total investment value, 0-100. */
  share: number;
  deposits: number;
  investors: number;
  /** Investors in this project whose first-ever approved deposit was before the period started. */
  returningInvestors: number;
  returningShare: number;
  avgTicket: number;
}

export interface CompareRow extends BreakdownRow {
  /** Value in the comparison period; null when no comparison is selected. */
  prevValue: number | null;
  /** Percentage change; null when there is no comparison or the previous value was 0. */
  deltaPct: number | null;
}

export interface ProjectsData {
  generatedAt: string;
  range: DateRange;
  compareRange: DateRange | null;
  total: number;
  scorecard: ScorecardRow[];
  tenure: CompareRow[];
  category: CompareRow[];
}

const SCORECARD_LIMIT = 15;

type RawScore = Omit<ScorecardRow, 'share'>;

export async function projectRows(q: QueryFn, f: Filters, r: DateRange): Promise<RawScore[]> {
  const p = new Params();
  const b = salesBase(f, r, p);
  const rows = await q(
    `WITH ${b.cte}
SELECT p.id::text AS key, p.name AS label,
  split_part(p."productDuration"::text, ' ', 1)::int AS tenure_months,
  p."productReturnType"::text AS return_type,
  SUM(x.amount)::float8 AS value,
  COUNT(*)::int AS deposits,
  COUNT(DISTINCT x."userId")::int AS investors,
  COUNT(DISTINCT x."userId") FILTER (WHERE x.first_dep < ${b.s})::int AS returning_investors
FROM base x
JOIN "order" o ON o.id = x."orderId"
JOIN products p ON p.id = o."productId"
GROUP BY p.id, p.name, p."productDuration", p."productReturnType"
ORDER BY value DESC
LIMIT ${SCORECARD_LIMIT}`,
    p.values,
  );
  return rows.map((x) => {
    const value = Number(x.value ?? 0);
    const deposits = Number(x.deposits ?? 0);
    const investors = Number(x.investors ?? 0);
    const returning = Number(x.returning_investors ?? 0);
    return {
      key: String(x.key),
      label: String(x.label),
      tenureMonths: Number(x.tenure_months ?? 0),
      returnType: String(x.return_type),
      value,
      deposits,
      investors,
      returningInvestors: returning,
      returningShare: investors > 0 ? (returning / investors) * 100 : 0,
      avgTicket: deposits > 0 ? value / deposits : 0,
    };
  });
}

function withPrev(cur: BreakdownRow[], prev: BreakdownRow[] | null): CompareRow[] {
  return cur.map((row) => {
    if (!prev) return { ...row, prevValue: null, deltaPct: null };
    const prevValue = prev.find((x) => x.key === row.key)?.value ?? 0;
    return { ...row, prevValue, deltaPct: deltaPct(row.value, prevValue) };
  });
}

export async function loadProjects(q: QueryFn, f: Filters, now: Date): Promise<ProjectsData> {
  const cmp = f.compareRange;
  const [kpis, rows, tenure, category, tenurePrev, categoryPrev] = await Promise.all([
    salesKpis(q, f, f.range),
    projectRows(q, f, f.range),
    salesBreakdown(q, f, f.range, 'tenure'),
    salesBreakdown(q, f, f.range, 'category'),
    cmp ? salesBreakdown(q, f, cmp, 'tenure') : Promise.resolve(null),
    cmp ? salesBreakdown(q, f, cmp, 'category') : Promise.resolve(null),
  ]);
  return {
    generatedAt: now.toISOString(),
    range: f.range,
    compareRange: cmp,
    total: kpis.sales,
    scorecard: rows.map((x) => ({ ...x, share: kpis.sales > 0 ? (x.value / kpis.sales) * 100 : 0 })),
    tenure: withPrev(tenure, tenurePrev),
    category: withPrev(category, categoryPrev),
  };
}
