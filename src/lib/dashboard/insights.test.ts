import { describe, expect, it } from 'vitest';
import { buildInsights } from './insights';
import type { CommandCenterData, PeriodKpis } from './types';

const kpis = (o: Partial<PeriodKpis> = {}): PeriodKpis => ({
  sales: 1_000_000, deposits: 10, ticketsInvested: 8, uniqueInvestors: 5, newInvestors: 2, oldInvestors: 3,
  registrations: 20, ticketsBooked: 30, ticketsCancelled: 3, ...o,
});

const data = (o: Partial<CommandCenterData> = {}): CommandCenterData => ({
  generatedAt: '2026-10-14T00:00:00.000Z',
  range: { from: '2026-10-01', to: '2026-10-10' },
  compareRange: null,
  bucket: 'day',
  current: kpis(),
  previous: null,
  series: [],
  attention: {
    pendingDeposits: { count: 0, amount: 0 },
    stuckBookings: { count: 0, olderThanDays: 3 },
    payoutsInFlight: { count: 0, amount: 0 },
    maturingSoon: { count: 0, amount: 0, withinDays: 14 },
  },
  target: null,
  ...o,
});

describe('buildInsights', () => {
  it('reports the new vs returning mix', () => {
    const [i] = buildInsights(data(), 'm');
    expect(i?.text).toContain('40% of investing investors are new');
  });

  it('flags a sales drop of 5% or more, but not smaller moves', () => {
    const down = buildInsights(data({ previous: kpis({ sales: 2_000_000 }) }), 'm');
    expect(down[0]).toMatchObject({ tone: 'warn' });
    expect(down[0]?.text).toContain('down 50.0%');
    const flat = buildInsights(data({ previous: kpis({ sales: 1_020_000 }) }), 'm');
    expect(flat.some((i) => i.text.includes('Investment value'))).toBe(false);
  });

  it('puts target pacing first and reports the daily amount needed', () => {
    const t = { month: '2026-10-01', target: 30_000_000, actual: 10_000_000, pct: 33.3, daysInMonth: 31, daysElapsed: 10, projected: 31_000_000, requiredPerDay: 952_381 };
    const [i] = buildInsights(data({ target: t }), 'm');
    expect(i).toMatchObject({ tone: 'good' });
    expect(i?.text).toContain('103%');
    expect(i?.text).toContain('952.4K per day');
  });

  it('warns about pending deposits and stuck bookings, and notes upcoming maturities', () => {
    const a = {
      pendingDeposits: { count: 9, amount: 120_000 },
      stuckBookings: { count: 2, olderThanDays: 3 },
      payoutsInFlight: { count: 0, amount: 0 },
      maturingSoon: { count: 4, amount: 2_000_000, withinDays: 14 },
    };
    const texts = buildInsights(data({ attention: a }), 'm').map((i) => i.text);
    expect(texts.some((t) => t.includes('9 deposits worth 120.0K'))).toBe(true);
    expect(texts.some((t) => t.includes('2 bookings'))).toBe(true);
    expect(texts.some((t) => t.includes('mature in the next 14 days'))).toBe(true);
  });

  it('never returns more than six notes', () => {
    const a = {
      pendingDeposits: { count: 1, amount: 1 }, stuckBookings: { count: 1, olderThanDays: 3 },
      payoutsInFlight: { count: 1, amount: 1 }, maturingSoon: { count: 1, amount: 1, withinDays: 14 },
    };
    const t = { month: '2026-10-01', target: 1, actual: 0, pct: 0, daysInMonth: 31, daysElapsed: 10, projected: 0, requiredPerDay: 1 };
    expect(buildInsights(data({ attention: a, target: t, previous: kpis({ sales: 9e9, ticketsCancelled: 0 }), current: kpis({ ticketsCancelled: 25, ticketsBooked: 30 }) }), 'm').length).toBeLessThanOrEqual(6);
  });
});
