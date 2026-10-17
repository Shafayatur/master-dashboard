import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { CompareRow, ProjectsData } from '@/lib/queries/projects';
import type { Insight } from './insights';

const MIN_GROWTH_PCT = 20;
const CONCENTRATION_PCT = 30;

/** "What to launch next" notes from tenure, category and project performance. Pure and easy to extend. */
export function buildProjectInsights(d: ProjectsData, unit: MoneyUnit): Insight[] {
  const out: Insight[] = [];

  const topTenure = [...d.tenure].sort((a, b) => b.investors - a.investors || b.value - a.value)[0];
  if (topTenure) {
    out.push({ tone: 'info', text: `${topTenure.label} projects attract the most investors (${formatInt(topTenure.investors)}), with ${formatMoney(topTenure.value, unit)} invested.` });
  }

  const ticket = [...d.tenure].filter((t) => t.deposits > 0).sort((a, b) => b.value / b.deposits - a.value / a.deposits);
  if (ticket.length >= 2 && ticket[0]) {
    out.push({ tone: 'info', text: `${ticket[0].label} projects have the largest average ticket (${formatMoney(ticket[0].value / ticket[0].deposits, unit)}).` });
  }

  const moved = (kind: string, rows: CompareRow[]) =>
    rows.flatMap((r) => (r.deltaPct !== null && r.prevValue !== null && r.prevValue > 0 ? [{ kind, row: r, pct: r.deltaPct }] : []));
  const all = [...moved('Category', d.category), ...moved('Tenure', d.tenure)];
  const up = [...all].sort((a, b) => b.pct - a.pct)[0];
  const down = [...all].sort((a, b) => a.pct - b.pct)[0];
  if (up && up.pct >= MIN_GROWTH_PCT) {
    out.push({ tone: 'good', text: `${up.kind} "${up.row.label}" grew ${up.pct.toFixed(0)}% on the comparison period (${formatMoney(up.row.value, unit)} vs ${formatMoney(up.row.prevValue ?? 0, unit)}).` });
  }
  if (down && down.pct <= -MIN_GROWTH_PCT) {
    out.push({ tone: 'warn', text: `${down.kind} "${down.row.label}" fell ${Math.abs(down.pct).toFixed(0)}% on the comparison period (${formatMoney(down.row.value, unit)} vs ${formatMoney(down.row.prevValue ?? 0, unit)}).` });
  }

  const top = d.scorecard[0];
  if (top && top.share >= CONCENTRATION_PCT) {
    out.push({ tone: 'warn', text: `"${top.label}" alone drives ${top.share.toFixed(0)}% of investment value in this period.` });
  }
  return out;
}
