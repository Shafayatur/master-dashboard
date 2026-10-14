import { deltaPct, formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { CommandCenterData } from './types';

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  text: string;
}

const MAX_INSIGHTS = 6;
const rate = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

/** Rule-based "what changed" notes, in priority order. Pure, so it is easy to test and to extend. */
export function buildInsights(d: CommandCenterData, unit: MoneyUnit): Insight[] {
  const m = (n: number) => formatMoney(n, unit);
  const out: Insight[] = [];
  const { current: cur, previous: prev, target: t, attention: a } = d;

  if (t) {
    if (t.pct >= 100) {
      out.push({ tone: 'good', text: `Monthly target reached: ${m(t.actual)} of ${m(t.target)} (${t.pct.toFixed(0)}%).` });
    } else {
      const projPct = rate(t.projected, t.target);
      const gap = t.requiredPerDay !== null ? ` Closing the gap needs about ${m(t.requiredPerDay)} per day.` : '';
      out.push({
        tone: projPct >= 100 ? 'good' : projPct >= 85 ? 'info' : 'warn',
        text: `At the current pace the month closes near ${m(t.projected)}, ${projPct.toFixed(0)}% of the ${m(t.target)} target.${gap}`,
      });
    }
  }

  if (prev) {
    const dp = deltaPct(cur.sales, prev.sales);
    if (dp !== null && Math.abs(dp) >= 5) {
      out.push({
        tone: dp > 0 ? 'good' : 'warn',
        text: `Investment value is ${dp > 0 ? 'up' : 'down'} ${Math.abs(dp).toFixed(1)}% on the comparison period (${m(cur.sales)} vs ${m(prev.sales)}).`,
      });
    }
    const [cr, pr] = [rate(cur.ticketsCancelled, cur.ticketsBooked), rate(prev.ticketsCancelled, prev.ticketsBooked)];
    if (cur.ticketsBooked >= 20 && prev.ticketsBooked >= 20 && cr - pr >= 3) {
      out.push({ tone: 'warn', text: `Cancellations are rising: ${cr.toFixed(1)}% of booked tickets this period vs ${pr.toFixed(1)}% before.` });
    }
  }

  if (cur.uniqueInvestors > 0) {
    out.push({
      tone: 'info',
      text: `${rate(cur.newInvestors, cur.uniqueInvestors).toFixed(0)}% of investing investors are new (${formatInt(cur.newInvestors)} new, ${formatInt(cur.oldInvestors)} returning).`,
    });
  }

  if (a.pendingDeposits.count > 0) {
    out.push({ tone: 'warn', text: `${formatInt(a.pendingDeposits.count)} deposits worth ${m(a.pendingDeposits.amount)} are waiting for approval.` });
  }
  if (a.stuckBookings.count > 0) {
    out.push({ tone: 'warn', text: `${formatInt(a.stuckBookings.count)} bookings have been open for more than ${a.stuckBookings.olderThanDays} days without an investment.` });
  }
  if (a.maturingSoon.count > 0) {
    out.push({
      tone: 'info',
      text: `${formatInt(a.maturingSoon.count)} investments worth ${m(a.maturingSoon.amount)} mature in the next ${a.maturingSoon.withinDays} days: a good moment for reinvestment outreach.`,
    });
  }
  return out.slice(0, MAX_INSIGHTS);
}
