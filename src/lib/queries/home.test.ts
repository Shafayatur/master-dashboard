import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters, type Filters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadHome, topWithOthers, type DonutRow, type HomeData } from './home';
import type { QueryFn } from './sql-filters';

/**
 * Synthetic dataset built around the Dhaka midnight (UTC+6): 2026-09-30 19:00 UTC is already 1 Oct in Dhaka, and
 * 2026-10-10 20:00 UTC is already 11 Oct. Range under test is 1-10 Oct (daily buckets), "today" is 2026-10-14.
 *
 * Investors: 1 Alice, 2 Bob, 3 Carol, 5 Dan, 6 Eve, 7 Gus, 9 Finn, 10 Gwen. Not investors: 4 (staff), 8 (deleted).
 * Products 1-7 each sit in the category with the same id; product 2 is also in category 1.
 * Everything below was worked out by hand from these rows.
 */
let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const filters = (qs = '', range = 'from=2026-10-01&to=2026-10-10'): Filters =>
  parseFilters(new URLSearchParams(`p=custom&${range}&cmp=none&${qs}`), '2026-10-14');
const TODAY = '2026-10-14';
const NOW = new Date('2026-10-14T00:00:00Z');
const deps = { q, getTarget: async () => null };
const home = (qs = '', range?: string): Promise<HomeData> => loadHome(deps, filters(qs, range), TODAY, NOW);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "deletedAt", "userType", name) VALUES
      (1, '2026-10-02 10:00', NULL, 'investor', 'Alice'),
      (2, '2026-09-30 19:30', NULL, 'investor', 'Bob'),
      (3, '2026-09-20 10:00', NULL, 'investor', 'Carol'),
      (4, '2026-10-03 10:00', NULL, 'internal-staff', 'Staff'),
      (5, '2026-09-30 17:00', NULL, 'investor', 'Dan'),
      (6, '2026-05-15 10:00', NULL, 'investor', 'Eve'),
      (7, '2026-10-10 18:30', NULL, 'investor', 'Gus'),
      (8, '2026-10-04 10:00', '2026-10-05 00:00', 'investor', 'Deleted'),
      (9, '2026-01-10 10:00', NULL, 'investor', 'Finn'),
      (10, '2025-11-20 10:00', NULL, 'investor', 'Gwen');
    INSERT INTO products (id, name, "productDuration", "productReturnType", "isShariah") VALUES
      (1, 'Dairy A', '6 Months', 'percentage', false), (2, 'Poultry B', '12 Months', 'fixed', false),
      (3, 'Fish C', '1 Month', 'percentage', false), (4, 'Goat D', '3 Months', 'percentage', false),
      (5, 'Rice E', '3 Months', 'percentage', false), (6, 'Corn F', '3 Months', 'percentage', false),
      (7, 'Honey G', '3 Months', 'percentage', false);
    INSERT INTO categories (id, name) VALUES
      (1, 'Dairy'), (2, 'Poultry'), (3, 'Fish'), (4, 'Goat'), (5, 'Rice'), (6, 'Corn'), (7, 'Honey');
    INSERT INTO category_products ("categoriesId", "productsId") VALUES (1, 1), (2, 2), (1, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7);
    INSERT INTO "order" (id, status, quantity, "totalAmount", "investmentDate", "createdAt", "userId", "productId") VALUES
      (1,  'invested',  1, 10000, '2026-10-03', '2026-10-03 01:00', 1, 1),
      (2,  'invested',  1, 21000, '2026-10-05', '2026-10-05 01:00', 2, 2),
      (3,  'closed',    1,  5000, '2026-09-10', '2026-09-10 01:00', 3, 3),
      (4,  'booked',    1,  7000, '2026-10-06', '2026-10-06 01:00', 3, 4),
      (5,  'cancelled', 1,  3000, '2026-10-07', '2026-10-07 01:00', 1, 5),
      (6,  'invested',  1,  9000, '2026-10-04', '2026-10-04 01:00', 4, 1),
      (7,  'closed',    1,  4000, '2026-07-01', '2026-10-02 01:00', 1, 5),
      (8,  'invested',  1,  3000, '2026-10-08', '2026-10-08 01:00', 2, 6),
      (9,  'invested',  1,  2000, '2026-10-09', '2026-10-09 01:00', 5, 7),
      (10, 'verifying', 1,  4500, '2026-10-11', '2026-10-11 01:00', 3, 1),
      (11, 'invested',  1,   100, '2026-09-30', '2026-09-30 18:30', 2, 1),
      (12, 'closed',    1,  1000, '2026-03-01', '2026-03-01 01:00', 9, 1),
      (13, 'closed',    1,  1000, '2025-12-01', '2025-12-01 01:00', 10, 1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1,  '2026-10-03 00:00', 10000, 'bank_deposit', 'approved', 1),
      (2,  '2026-10-05 00:00', 20000, 'reinvest',     'approved', 2),
      (3,  '2026-09-10 00:00',  5000, 'bank_deposit', 'approved', 3),
      (4,  '2026-10-06 00:00',  7000, 'bank_deposit', 'approved', 4),
      (5,  '2026-10-07 00:00',  3000, 'bank_deposit', 'pending',  5),
      (6,  '2026-10-10 20:00',   500, 'bank_deposit', 'approved', 1),
      (7,  '2026-09-30 19:00',  1000, 'cash',         'approved', 2),
      (8,  '2026-10-04 00:00',  9000, 'bank_deposit', 'approved', 6),
      (9,  '2026-09-30 17:00',   700, 'bank_deposit', 'approved', 3),
      (10, '2026-10-02 00:00',  4000, 'bank_deposit', 'approved', 7),
      (11, '2026-10-08 00:00',  3000, 'bank_deposit', 'approved', 8),
      (12, '2026-10-09 00:00',  2000, 'bank_deposit', 'approved', 9),
      (13, '2026-10-10 17:00',  1500, 'bank_deposit', 'approved', 3),
      (14, '2026-10-05 02:00',   500, 'bank_deposit', 'approved', 2),
      (15, '2026-10-06 03:00',   800, 'bank_deposit', 'approved', 1),
      (16, '2026-10-08 06:00',   600, 'bank_deposit', 'approved', 2),
      (17, '2026-10-19 00:00',   100, 'bank_deposit', 'approved', 1),
      (18, '2026-05-31 18:30',   800, 'reinvest',     'approved', 3),
      (19, '2026-06-15 00:00',  1200, 'bank_deposit', 'approved', 3),
      (20, '2026-05-31 17:30',   400, 'bank_deposit', 'approved', 3),
      (21, '2026-08-10 00:00',  5000, 'reinvest',     'approved', 3),
      (22, '2026-04-30 19:00',   999, 'bank_deposit', 'approved', 3),
      (23, '2026-04-30 17:00',   777, 'bank_deposit', 'approved', 3),
      (24, '2026-10-10 19:00',   123, 'bank_deposit', 'approved', 6);
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES
      (1,  '2026-09-20 00:00',  500, 'completed', 3),
      (2,  '2026-10-12 00:00',  800, 'initiated', 2),
      (3,  '2026-10-02 12:00', 1200, 'completed', 1),
      (4,  '2026-09-30 19:00',  300, 'completed', 3),
      (5,  '2026-10-05 00:00',  900, 'completed', 2),
      (6,  '2026-10-05 05:00',  100, 'completed', 9),
      (7,  '2026-10-10 20:30',   50, 'completed', 1),
      (8,  '2026-10-03 00:00',  400, 'completed', 6),
      (9,  '2026-10-03 00:00',  250, 'completed', 1),
      (10, '2026-10-04 00:00',   80, 'completed', 4),
      (11, '2026-10-06 22:00',   60, 'completed', 7),
      (12, '2026-10-08 01:00',   40, 'completed', 8);
  `);
});

/** Asserts keys, labels, values and that shares are value / sum x 100 and add up to 100. */
function expectDonut(rows: DonutRow[], expected: [key: string, label: string, value: number][]) {
  expect(rows.map((r) => [r.key, r.label, r.value])).toEqual(expected);
  const total = expected.reduce((s, e) => s + e[2], 0);
  rows.forEach((r, i) => expect(r.share).toBeCloseTo(((expected[i] as [string, string, number])[2] / total) * 100, 9));
  expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 9);
}

describe('loadHome: sparklines (daily, 1-10 Oct, aligned with series)', () => {
  let d: HomeData;
  beforeAll(async () => {
    d = await home();
  });

  it('keeps the Command Center data and aligns every array with the series labels', () => {
    expect(d.series.map((s) => s.label)).toEqual(Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`));
    expect(d.bucket).toBe('day');
    expect(d.current.sales).toBe(50400);
    for (const arr of [...Object.values(d.kpiSpark), d.payouts]) expect(arr).toHaveLength(d.series.length);
    expect(d.series.map((s) => s.value)).toEqual(d.kpiSpark.sales);
  });

  it('sales: approved deposits by Dhaka day (30 Sep 19:00 UTC lands on 1 Oct, 10 Oct 20:00 UTC on 11 Oct)', () => {
    expect(d.kpiSpark.sales).toEqual([1000, 4000, 10000, 0, 20500, 7800, 0, 3600, 2000, 1500]);
  });

  it('tickets invested count distinct orders and unique investors distinct people per bucket', () => {
    expect(d.kpiSpark.ticketsInvested).toEqual([1, 1, 1, 0, 1, 2, 0, 2, 1, 1]); // 5 Oct: two deposits, one order; 8 Oct: orders 8 and 2
    expect(d.kpiSpark.uniqueInvestors).toEqual([1, 1, 1, 0, 1, 2, 0, 1, 1, 1]); // 8 Oct: both orders belong to Bob
  });

  it('new investors sit in the bucket of their first-ever approved deposit and add up to the KPI', () => {
    expect(d.kpiSpark.newInvestors).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 0]); // Bob 1 Oct, Alice 2 Oct (her 3 Oct deposit is not "new"), Dan 9 Oct
    expect(d.kpiSpark.newInvestors.reduce((s, n) => s + n, 0)).toBe(d.current.newInvestors);
    expect(d.current.oldInvestors).toBe(1); // Carol
  });

  it('registrations count investors only, by Dhaka day', () => {
    expect(d.kpiSpark.registrations).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]); // Bob 30 Sep 19:30 UTC = 1 Oct; staff, deleted, Dan (30 Sep) and Gus (11 Oct) are out
    expect(d.kpiSpark.registrations.reduce((s, n) => s + n, 0)).toBe(d.current.registrations);
  });

  it('tickets booked count orders of any status created in each Dhaka day', () => {
    expect(d.kpiSpark.ticketsBooked).toEqual([1, 1, 1, 0, 1, 1, 1, 1, 1, 0]); // order 11 at 30 Sep 18:30 UTC = 1 Oct; cancelled order 5 counts on 7 Oct
    expect(d.kpiSpark.ticketsBooked.reduce((s, n) => s + n, 0)).toBe(d.current.ticketsBooked);
  });

  it('average ticket is sales / tickets per bucket, 0 where there are no tickets', () => {
    expect(d.kpiSpark.avgTicket).toEqual([1000, 4000, 10000, 0, 20500, 3900, 0, 1800, 2000, 1500]);
  });

  it('payouts: completed only, investors only, by Dhaka day', () => {
    // 1 Oct: 300 (30 Sep 19:00 UTC); the 800 initiated payout, the staff payout (400) and the 11 Oct payout (50) are out
    expect(d.payouts).toEqual([300, 1200, 250, 80, 1000, 0, 60, 40, 0, 0]);
  });

  it('global filters apply to the sales sparklines but not to registrations or payouts', async () => {
    const x = await home('xr=1');
    expect(x.kpiSpark.sales).toEqual([1000, 4000, 10000, 0, 500, 7800, 0, 3600, 2000, 1500]); // the 20000 reinvest deposit is gone
    expect(x.kpiSpark.registrations).toEqual(d.kpiSpark.registrations);
    expect(x.payouts).toEqual(d.payouts);

    const p = await home('prod=1');
    expect(p.kpiSpark.sales).toEqual([0, 0, 10000, 0, 0, 800, 0, 0, 0, 0]);
    expect(p.kpiSpark.ticketsBooked).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 0, 0]); // orders 11 and 1
    expect(p.kpiSpark.newInvestors).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]); // Alice, in the bucket of her first deposit (2 Oct)
    expect(p.kpiSpark.registrations).toEqual(d.kpiSpark.registrations);
    expect(p.payouts).toEqual(d.payouts);
  });

  it('monthly buckets for ranges beyond 92 days, zero-filled', async () => {
    const m = await home('', 'from=2026-05-01&to=2026-10-10');
    expect(m.bucket).toBe('month');
    expect(m.series.map((s) => s.label)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(m.kpiSpark.sales).toEqual([1399, 2000, 0, 5000, 5700, 50400]);
    expect(m.kpiSpark.registrations).toEqual([1, 0, 0, 0, 2, 2]);
    expect(m.payouts).toEqual([0, 0, 0, 0, 500, 2930]);
  });

  it('returns zero-filled arrays and empty lists for an empty period', async () => {
    const e = await home('', 'from=2025-01-01&to=2025-01-31');
    const zeros = Array.from({ length: 31 }, () => 0);
    expect(e.kpiSpark).toEqual({
      sales: zeros, ticketsInvested: zeros, uniqueInvestors: zeros, newInvestors: zeros, registrations: zeros, ticketsBooked: zeros, avgTicket: zeros,
    });
    expect(e.payouts).toEqual(zeros);
    expect([e.byProject, e.byCategory, e.payoutsByCategory]).toEqual([[], [], []]);
    expect(e.recent).toHaveLength(10); // the feed is "latest", not range-bound
  });
});

describe('loadHome: sales vs reinvest (last 6 Dhaka months)', () => {
  it('splits approved investor deposits into reinvest and other, by Dhaka month', async () => {
    const d = await home();
    expect(d.salesVsReinvest).toEqual([
      { month: '2026-05-01', reinvest: 0, other: 1399 }, // 999 at 30 Apr 19:00 UTC = 1 May in Dhaka; the 777 deposit at 17:00 UTC is still April
      { month: '2026-06-01', reinvest: 800, other: 1200 }, // 31 May 18:30 UTC = 1 Jun in Dhaka
      { month: '2026-07-01', reinvest: 0, other: 0 },
      { month: '2026-08-01', reinvest: 5000, other: 0 },
      { month: '2026-09-01', reinvest: 0, other: 5700 }, // 30 Sep 17:00 UTC is still September
      { month: '2026-10-01', reinvest: 20000, other: 30900 }, // up to today; the 19 Oct deposit, pending and staff rows are out
    ]);
  });

  it('ignores the dashboard filters and the selected range', async () => {
    const a = await home();
    expect((await home('xr=1&prod=1')).salesVsReinvest).toEqual(a.salesVsReinvest);
    expect((await home('', 'from=2025-01-01&to=2025-01-31')).salesVsReinvest).toEqual(a.salesVsReinvest);
  });
});

describe('loadHome: donuts', () => {
  it('byProject: top 5 by sales plus an Others row that folds in the rest', async () => {
    const d = await home();
    expectDonut(d.byProject, [
      ['2', 'Poultry B', 22100],
      ['1', 'Dairy A', 10800],
      ['4', 'Goat D', 7000],
      ['5', 'Rice E', 4000],
      ['6', 'Corn F', 3000],
      ['others', 'Others', 3500], // Honey G 2000 + Fish C 1500
    ]);
  });

  it('byProject follows the filters; a single product gives a single full slice', async () => {
    expectDonut((await home('xr=1')).byProject, [
      ['1', 'Dairy A', 10800],
      ['4', 'Goat D', 7000],
      ['5', 'Rice E', 4000],
      ['6', 'Corn F', 3000],
      ['2', 'Poultry B', 2100],
      ['others', 'Others', 3500],
    ]);
    expectDonut((await home('prod=1')).byProject, [['1', 'Dairy A', 10800]]);
  });

  it('byCategory counts a product in each of its categories; shares are of that sum', async () => {
    const d = await home();
    expectDonut(d.byCategory, [
      ['1', 'Dairy', 32900], // Dairy A 10800 + Poultry B 22100 (Poultry B is in two categories)
      ['2', 'Poultry', 22100],
      ['4', 'Goat', 7000],
      ['5', 'Rice', 4000],
      ['6', 'Corn', 3000],
      ['others', 'Others', 3500], // Honey 2000 + Fish 1500
    ]);
    expect(d.byCategory.reduce((s, r) => s + r.value, 0)).toBe(72500); // more than the 50400 of total sales, by design
  });

  it('payoutsByCategory: completed payouts in the range by the paid order category, top 5 plus Others', async () => {
    const d = await home();
    expectDonut(d.payoutsByCategory, [
      ['1', 'Dairy', 2350], // 1200 + 250 (order 1) + 900 (order 2, Poultry B is also Dairy)
      ['2', 'Poultry', 900],
      ['3', 'Fish', 300], // 30 Sep 19:00 UTC = 1 Oct in Dhaka
      ['7', 'Honey', 100],
      ['4', 'Goat', 80],
      ['others', 'Others', 100], // Rice 60 + Corn 40
    ]);
  });

  it('topWithOthers: no Others row for 5 or fewer rows, nothing for empty or zero input, shares sum to 100', () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `P${n}`, value: n * 10 }));
    expect(topWithOthers(five)).toHaveLength(5);
    expect(topWithOthers([])).toEqual([]);
    expect(topWithOthers([{ key: 'a', label: 'A', value: 0 }])).toEqual([]);
    const seven = [...five, { key: '6', label: 'P6', value: 1 }, { key: '7', label: 'P7', value: 2 }];
    const out = topWithOthers(seven);
    expect(out.at(-1)).toMatchObject({ key: 'others', label: 'Others', value: 3 });
    expect(out.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 9);
  });
});

describe('loadHome: investors', () => {
  it('segments reuse the Investors tab rules', async () => {
    const d = await home();
    expect(d.segments.map((s) => [s.key, s.investors, s.share])).toEqual([
      ['active', 3, 37.5], // Alice, Bob, Dan
      ['recently_active', 1, 12.5], // Carol: last order matured 10 Oct
      ['cooling', 1, 12.5], // Finn: matured 1 Sep
      ['inactive', 1, 12.5], // Gwen: matured 1 Jun
      ['prospect', 2, 25], // Eve, Gus
    ]);
    expect(d.segments.find((s) => s.key === 'active')?.lifetimeValue).toBe(42500);
    expect(d.segments.find((s) => s.key === 'recently_active')?.lifetimeValue).toBe(23376);
  });

  it('investorTotals: all-time registered, ever invested, active', async () => {
    const d = await home();
    // registered: 8 (staff and the deleted user are excluded); everInvested: Alice, Bob, Carol, Dan
    expect(d.investorTotals).toEqual({ registered: 8, everInvested: 4, active: 3 });
  });
});

describe('loadHome: recent activity', () => {
  it('lists the latest 10 events across deposits, payouts, registrations and bookings, newest first', async () => {
    const { recent } = await home();
    expect(recent).toEqual([
      { kind: 'booking', at: '2026-10-11T01:00:00Z', title: 'Ticket verifying', name: 'Carol', userId: 3, amount: 4500, status: 'verifying', orderId: 10 },
      { kind: 'payout', at: '2026-10-10T20:30:00Z', title: 'Payout completed', name: 'Alice', userId: 1, amount: 50, status: 'completed', orderId: 1 },
      { kind: 'deposit', at: '2026-10-10T20:00:00Z', title: 'Deposit approved', name: 'Alice', userId: 1, amount: 500, status: 'approved', orderId: 1 },
      { kind: 'registration', at: '2026-10-10T18:30:00Z', title: 'New registration', name: 'Gus', userId: 7, amount: null, status: null, orderId: null },
      { kind: 'deposit', at: '2026-10-10T17:00:00Z', title: 'Deposit approved', name: 'Carol', userId: 3, amount: 1500, status: 'approved', orderId: 3 },
      { kind: 'deposit', at: '2026-10-09T00:00:00Z', title: 'Deposit approved', name: 'Dan', userId: 5, amount: 2000, status: 'approved', orderId: 9 },
      { kind: 'deposit', at: '2026-10-08T06:00:00Z', title: 'Deposit approved', name: 'Bob', userId: 2, amount: 600, status: 'approved', orderId: 2 },
      { kind: 'payout', at: '2026-10-08T01:00:00Z', title: 'Payout completed', name: 'Bob', userId: 2, amount: 40, status: 'completed', orderId: 8 },
      { kind: 'deposit', at: '2026-10-08T00:00:00Z', title: 'Deposit approved', name: 'Bob', userId: 2, amount: 3000, status: 'approved', orderId: 8 },
      { kind: 'deposit', at: '2026-10-07T00:00:00Z', title: 'Deposit pending', name: 'Alice', userId: 1, amount: 3000, status: 'pending', orderId: 5 },
    ]);
  });

  it('leaves out staff activity (19:00 UTC deposit on 10 Oct), the future-dated deposit and non-open bookings', async () => {
    const { recent } = await home();
    expect(recent.some((r) => r.amount === 123)).toBe(false); // staff deposit
    expect(recent.some((r) => r.at > NOW.toISOString())).toBe(false); // the 19 Oct deposit and the 12 Oct initiated payout
    expect(recent.filter((r) => r.kind === 'booking').map((r) => r.orderId)).toEqual([10]); // order 4 (booked) is older than the cut
  });

  it('is not affected by the dashboard filters', async () => {
    const a = (await home()).recent;
    expect((await home('prod=1&xr=1&ds=pending')).recent).toEqual(a);
  });
});

describe('loadHome: output shape', () => {
  it('is plain JSON (safe for unstable_cache)', async () => {
    const d = await home();
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(JSON.stringify(d)).not.toMatch(/NaN|undefined/);
  });
});
