import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { MoneyFlowData } from '@/lib/queries/money-flow';
import type { Insight } from './insights';

const pct = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);

/** Notes for the Money Flow tab. Pure. */
export function buildMoneyFlowInsights(d: MoneyFlowData, unit: MoneyUnit): Insight[] {
  const m = (n: number) => formatMoney(n, unit);
  const out: Insight[] = [];

  const next4 = d.schedule.weeks.slice(0, 4);
  const due = next4.reduce((s, w) => s + w.total, 0);
  const maturing = next4.reduce((s, _, i) => s + (d.maturity.weeks[i]?.principal ?? 0), 0);
  if (due > 0 || maturing > 0) {
    out.push({ tone: 'info', text: `Over the next 4 weeks ${m(due)} is scheduled to be paid out and ${m(maturing)} of principal reaches maturity. That money is the reinvestment pool.` });
  }
  if (d.maturity.overdue.count > 0) {
    out.push({ tone: 'warn', text: `${formatInt(d.maturity.overdue.count)} investments worth ${m(d.maturity.overdue.amount)} are past maturity but still marked invested. Check whether they were paid or their status is stale.` });
  }
  const cov = pct(d.schedule.coverage.withSchedule, d.schedule.coverage.invested);
  if (d.schedule.coverage.invested > 0 && cov < 70) {
    out.push({ tone: 'warn', text: `Only ${cov.toFixed(0)}% of running investments have a payout schedule, so the scheduled payouts shown understate what is due.` });
  }
  const c = d.conversion;
  if (c.paidInvestors > 0 && c.complete30) {
    out.push({ tone: 'info', text: `${pct(c.r30, c.paidInvestors).toFixed(0)}% of the ${formatInt(c.paidInvestors)} investors paid out in this period invested again within 30 days.` });
  } else if (c.paidInvestors > 0) {
    out.push({ tone: 'info', text: `${formatInt(c.paidInvestors)} investors were paid out in this period. The 30-day reinvestment window is still open, so the rate will rise.` });
  }
  const r = d.reinvest;
  if (r.total.amount > 0) {
    out.push({ tone: 'info', text: `Reinvestment in this period: ${m(r.confirmed.amount)} confirmed (marked reinvest) plus about ${m(r.estimated.amount)} estimated (investors paid out in the previous ${d.windowDays} days).` });
  }
  if (d.inFlight.count > 0) {
    out.push({ tone: 'info', text: `${formatInt(d.inFlight.count)} payouts worth ${m(d.inFlight.amount)} are initiated but not completed.` });
  }
  return out;
}
