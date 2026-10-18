import 'server-only';
import { addMonths, startOfMonth } from '@/lib/filters/dates';
import { parseFilters } from '@/lib/filters/schema';
import { Params, salesBase, type QueryFn } from './sql-filters';

export interface TargetRow {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  target: number | null;
  note: string | null;
  /** Approved deposits in that Dhaka month (all products, investors only). 0 for future months. */
  actual: number;
  /** Achievement %, null when no target is set. */
  pct: number | null;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface TargetsOverview {
  generatedAt: string;
  currentMonth: string;
  /** Newest first: two future months, the current month, then the previous 11. */
  rows: TargetRow[];
}

const PAST = 11;
const FUTURE = 2;
const num = (v: unknown): number => Number(v ?? 0);

export async function upsertTarget(cq: QueryFn, month: string, amount: number, note: string | null): Promise<void> {
  await cq(
    `INSERT INTO monthly_targets (month, target_amount, note) VALUES ($1::date, $2::numeric, $3)
ON CONFLICT (month) DO UPDATE SET target_amount = EXCLUDED.target_amount, note = EXCLUDED.note, updated_at = now()`,
    [month, amount, note],
  );
}

export async function deleteTarget(cq: QueryFn, month: string): Promise<void> {
  await cq('DELETE FROM monthly_targets WHERE month = $1::date', [month]);
}

export async function loadTargetsOverview(q: QueryFn, cq: QueryFn, today: string, now: Date): Promise<TargetsOverview> {
  const current = startOfMonth(today);
  const first = addMonths(current, -PAST);
  const last = addMonths(current, FUTURE);

  const p = new Params();
  const b = salesBase(parseFilters(new URLSearchParams(), today), { from: first, to: today }, p, true);
  const [actualRows, targetRows] = await Promise.all([
    q(
      `WITH ${b.cte}
SELECT to_char(date_trunc('month', dep_date + interval '6 hours'), 'YYYY-MM-DD') AS month, SUM(amount)::float8 AS actual
FROM base GROUP BY 1`,
      p.values,
    ),
    cq(
      `SELECT to_char(month, 'YYYY-MM-DD') AS month, target_amount::float8 AS target, note
FROM monthly_targets WHERE month >= $1::date AND month <= $2::date`,
      [first, last],
    ),
  ]);
  const actual = new Map(actualRows.map((r) => [String(r.month), num(r.actual)]));
  const target = new Map(targetRows.map((r) => [String(r.month), r]));

  const rows: TargetRow[] = [];
  for (let i = FUTURE; i >= -PAST; i--) {
    const month = addMonths(current, i);
    const t = target.get(month);
    const tv = t ? num(t.target) : null;
    const a = actual.get(month) ?? 0;
    rows.push({
      month,
      target: tv,
      note: t && t.note ? String(t.note) : null,
      actual: a,
      pct: tv && tv > 0 ? (a / tv) * 100 : null,
      isCurrent: i === 0,
      isFuture: i > 0,
    });
  }
  return { generatedAt: now.toISOString(), currentMonth: current, rows };
}
