import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { InvestorsData } from '@/lib/queries/investors';
import type { Insight } from './insights';

/** Notes for the Investors tab. Pure. */
export function buildInvestorInsights(d: InvestorsData, unit: MoneyUnit): Insight[] {
  const out: Insight[] = [];
  const seg = (k: string) => d.segments.find((s) => s.key === k);

  const cooling = seg('cooling');
  if (cooling && cooling.investors > 0) {
    out.push({ tone: 'warn', text: `${formatInt(cooling.investors)} investors are cooling (last project matured 30-60 days ago) with ${formatMoney(cooling.lifetimeValue, unit)} invested over their lifetime. Reach out before they turn inactive.` });
  }
  const everInvested = d.segments.filter((s) => s.key !== 'prospect').reduce((a, s) => a + s.investors, 0);
  const inactive = seg('inactive');
  if (inactive && everInvested > 0 && (inactive.investors / everInvested) * 100 >= 40) {
    out.push({ tone: 'warn', text: `${((inactive.investors / everInvested) * 100).toFixed(0)}% of investors who ever invested are inactive (${formatInt(inactive.investors)}), worth ${formatMoney(inactive.lifetimeValue, unit)} in past investment.` });
  }
  const c = d.concentration;
  if (c.investors >= 10 && c.top20PctShare >= 80) {
    out.push({ tone: 'warn', text: `The top 20% of investors account for ${c.top20PctShare.toFixed(0)}% of lifetime investment, and the top 10 alone for ${c.top10Share.toFixed(0)}%.` });
  }

  const done = d.cohorts.filter((x) => x.complete30 && x.registered >= 20);
  const last = done[done.length - 1];
  const earlier = done.slice(0, -1);
  if (last && earlier.length >= 2) {
    const rate = (x: { d30: number; registered: number }) => (x.d30 / x.registered) * 100;
    const avg = earlier.reduce((s, x) => s + rate(x), 0) / earlier.length;
    const drop = avg - rate(last);
    if (drop >= 5) {
      out.push({ tone: 'warn', text: `30-day conversion of the latest complete cohort is ${rate(last).toFixed(1)}%, ${drop.toFixed(1)} points below the ${avg.toFixed(1)}% average of earlier cohorts.` });
    }
  }
  if (d.medianDaysToFirst !== null) {
    out.push({ tone: 'info', text: `The typical investor makes a first investment ${d.medianDaysToFirst} days after registering.` });
  }
  return out;
}
