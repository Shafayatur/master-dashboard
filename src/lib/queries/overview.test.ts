import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters, type Filters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { attention, loadCommandCenter, salesKpis, ticketsBooked, registrations, targetPacing } from './overview';
import type { QueryFn } from './sql-filters';

/**
 * Runs the real SQL on an in-memory Postgres with a small synthetic dataset. Dates are chosen around the
 * Dhaka day boundary (UTC+6): 2026-09-30 19:00 UTC is already 1 Oct in Dhaka; 2026-10-10 20:00 UTC is 11 Oct.
 */
let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql); // the same guard the production connection applies
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};

const filters = (qs = ''): Filters => parseFilters(new URLSearchParams(`p=custom&from=2026-10-01&to=2026-10-10&cmp=none&${qs}`), '2026-10-14');
const NOW = new Date('2026-10-14T00:00:00Z');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES
      (1, '2026-10-02 10:00', 'investor'), (2, '2026-10-04 10:00', 'investor'), (3, '2026-09-20 10:00', 'investor'),
      (4, '2026-10-03 10:00', 'internal-staff');
    INSERT INTO products (id, name, "productDuration", "productReturnType", "isShariah") VALUES
      (1, 'Dairy A', '6 Months', 'percentage', false), (2, 'Poultry B', '12 Months', 'fixed', true);
    INSERT INTO "order" (id, status, quantity, "totalAmount", "investmentDate", "createdAt", "userId", "productId") VALUES
      (1, 'invested',  1, 10000, '2026-10-03 00:00', '2026-10-03 01:00', 1, 1),
      (2, 'invested',  2, 21000, '2026-10-05 00:00', '2026-10-05 01:00', 2, 2),
      (3, 'closed',    1,  5000, '2026-09-10 00:00', '2026-09-10 01:00', 3, 1),
      (4, 'booked',    1,  7000, '2026-10-06 00:00', '2026-10-06 01:00', 3, 1),
      (5, 'cancelled', 1,  3000, '2026-10-07 00:00', '2026-10-07 01:00', 1, 1),
      (6, 'invested',  1, 15000, '2026-04-20 00:00', '2026-04-20 01:00', 2, 1),
      (7, 'invested',  1,  9000, '2026-10-04 00:00', '2026-10-04 01:00', 4, 1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1, '2026-10-03 00:00', 10000, 'bank_deposit', 'approved', 1),
      (2, '2026-10-05 00:00', 20000, 'reinvest',     'approved', 2),
      (3, '2026-09-10 00:00',  5000, 'bank_deposit', 'approved', 3),
      (4, '2026-10-06 00:00',  7000, 'bank_deposit', 'approved', 4),
      (5, '2026-10-07 00:00',  3000, 'bank_deposit', 'pending',  5),
      (6, '2026-10-10 20:00',   500, 'bank_deposit', 'approved', 1),
      (7, '2026-09-30 19:00',  1000, 'cash',         'approved', 2),
      (8, '2026-10-04 00:00',  9000, 'bank_deposit', 'approved', 7);
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES
      (1, '2026-09-20 00:00', 500, 'completed', 3), (2, '2026-10-12 00:00', 800, 'initiated', 2);
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES (1, 6, '2026-10-20 00:00');
  `);
});

describe('salesKpis', () => {
  it('counts approved deposits by Dhaka date, for investors only', async () => {
    const k = await salesKpis(q, filters(), filters().range);
    // included: #1 10000, #2 20000, #4 7000, #7 1000 (Dhaka 1 Oct); excluded: #3 (Sep), #5 pending, #6 (Dhaka 11 Oct), #8 (staff)
    expect(k.sales).toBe(38000);
    expect(k.deposits).toBe(4);
    expect(k.ticketsInvested).toBe(3); // orders 1, 2, 4
    expect(k.uniqueInvestors).toBe(3);
  });

  it('splits new and returning investors by first-ever approved deposit', async () => {
    const k = await salesKpis(q, filters(), filters().range);
    expect(k.newInvestors).toBe(2); // users 1 and 2 first invested inside the range
    expect(k.oldInvestors).toBe(1); // user 3 invested in September
  });

  it('applies the deposit status filter', async () => {
    const k = await salesKpis(q, filters('ds=approved,pending'), filters().range);
    expect(k.sales).toBe(41000);
    const onlyPending = await salesKpis(q, filters('ds=pending'), filters().range);
    expect(onlyPending.sales).toBe(3000);
  });

  it('can exclude reinvest deposits and filter by payment method', async () => {
    expect((await salesKpis(q, filters('xr=1'), filters().range)).sales).toBe(18000);
    expect((await salesKpis(q, filters('pm=cash'), filters().range)).sales).toBe(1000);
  });

  it('filters by tenure, return type, shariah and product', async () => {
    expect((await salesKpis(q, filters('ten=12'), filters().range)).sales).toBe(21000);
    expect((await salesKpis(q, filters('rt=fixed'), filters().range)).sales).toBe(21000);
    expect((await salesKpis(q, filters('sh=yes'), filters().range)).sales).toBe(21000);
    expect((await salesKpis(q, filters('sh=no'), filters().range)).sales).toBe(17000);
    expect((await salesKpis(q, filters('prod=2'), filters().range)).sales).toBe(21000);
  });

  it('filters by investor kind', async () => {
    expect((await salesKpis(q, filters('ik=new'), filters().range)).sales).toBe(31000);
    expect((await salesKpis(q, filters('ik=old'), filters().range)).sales).toBe(7000);
  });

  it('returns zeros, not nulls, for an empty period', async () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=2025-01-01&to=2025-01-31&cmp=none'), '2026-10-14');
    expect(await salesKpis(q, f, f.range)).toEqual({ sales: 0, deposits: 0, ticketsInvested: 0, uniqueInvestors: 0, newInvestors: 0, oldInvestors: 0 });
  });
});

describe('funnel counts', () => {
  it('registrations are investors created in the range', async () => {
    expect(await registrations(q, filters().range)).toBe(2); // users 1 and 2 (3 is September, 4 is staff)
  });
  it('tickets booked count orders created in the range, with the cancelled share', async () => {
    expect(await ticketsBooked(q, filters(), filters().range)).toEqual({ booked: 4, cancelled: 1 }); // orders 1, 2, 4, 5 (7 is staff)
  });
});

describe('attention', () => {
  it('reports what needs action right now', async () => {
    const a = await attention(q, NOW);
    expect(a.pendingDeposits).toEqual({ count: 1, amount: 3000 });
    expect(a.stuckBookings.count).toBe(1); // order 4, booked 8 days ago
    expect(a.payoutsInFlight).toEqual({ count: 1, amount: 800 });
    expect(a.maturingSoon).toEqual({ count: 1, amount: 15000, withinDays: 14 }); // order 6, last schedule 20 Oct
  });
});

describe('targetPacing', () => {
  it('returns null when no target is set', async () => {
    expect(await targetPacing(q, async () => null, filters(), '2026-10-10')).toBeNull();
  });
  it('projects the month from month-to-date approved sales', async () => {
    const t = await targetPacing(q, async () => 100000, filters(), '2026-10-10');
    expect(t).toMatchObject({ month: '2026-10-01', target: 100000, actual: 38000, daysInMonth: 31, daysElapsed: 10 });
    expect(t?.projected).toBeCloseTo(117800);
    expect(t?.requiredPerDay).toBeCloseTo(62000 / 21);
  });
  it('ignores the dashboard filters (the target is for total sales)', async () => {
    const t = await targetPacing(q, async () => 100000, filters('ik=new&pm=cash'), '2026-10-10');
    expect(t?.actual).toBe(38000);
  });
});

describe('loadCommandCenter', () => {
  it('assembles zero-filled daily series with a compare line', async () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=2026-10-01&to=2026-10-10&cmp=previous'), '2026-10-14');
    const d = await loadCommandCenter({ q, getTarget: async () => null }, f, '2026-10-14', NOW);
    expect(d.bucket).toBe('day');
    expect(d.series).toHaveLength(10);
    expect(d.series.map((s) => s.value)).toEqual([1000, 0, 10000, 0, 20000, 7000, 0, 0, 0, 0]);
    expect(d.series[0]?.compareLabel).toBe('2026-09-21');
    expect(d.series[0]?.compare).toBe(0);
    expect(d.previous?.sales).toBe(0); // Sep 21-30 holds no approved deposit: #3 is on 10 Sep and #7 is already 1 Oct in Dhaka
    expect(JSON.parse(JSON.stringify(d))).toEqual(d); // plain JSON, safe for unstable_cache
  });

  it('switches to monthly buckets for long ranges', async () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=2026-01-01&to=2026-10-10&cmp=none'), '2026-10-14');
    const d = await loadCommandCenter({ q, getTarget: async () => null }, f, '2026-10-14', NOW);
    expect(d.bucket).toBe('month');
    expect(d.series.map((s) => s.label)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(d.series.at(-1)?.value).toBe(38000);
    expect(d.series.at(-2)?.value).toBe(5000);
  });
});
