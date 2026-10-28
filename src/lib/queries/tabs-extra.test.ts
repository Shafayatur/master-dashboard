import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters, type Filters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadExplorer, parseExplorerParams } from './explorer';
import { registrations } from './overview';
import type { QueryFn } from './sql-filters';
import {
  bookingActivity,
  loadInvestorsExtras,
  loadSalesExtras,
  type BookingView,
  type InvestorsExtras,
  parseBookingView,
  resolveBookingAnchor,
  type SalesExtras,
} from './tabs-extra';

/**
 * Synthetic dataset built around the Dhaka midnight (UTC+6). Range under test is 1-10 Oct 2026 (daily buckets), "today" is
 * 2026-10-14. Precise boundaries used below:
 *   2026-09-30 17:59 UTC = 30 Sep 23:59 Dhaka (outside)   2026-09-30 18:00 UTC = 1 Oct 00:00 Dhaka (first minute inside)
 *   2026-10-10 17:59 UTC = 10 Oct 23:59 Dhaka (inside)    2026-10-10 18:00 UTC = 11 Oct 00:00 Dhaka (outside)
 *   2025-10-31 17:59 UTC = 31 Oct 2025 Dhaka (before the 12-month window)   2025-10-31 18:00 UTC = 1 Nov 2025 Dhaka (first minute)
 * Weekdays (Dhaka): 1 Oct 2026 is a Thursday, so 2 Oct Fri, 4 Oct Sun, 6 Oct Tue, 8 Oct Thu, 9 Oct Fri, 10 Oct Sat.
 *
 * Investors: 1 Alice, 2 Bob, 3 Carol, 5 Dan, 6 Eve, 8 Finn (registers after today), 9 Gus, 10 Hal, 11 Ivy.
 * Not investors: 4 (staff), 7 (deleted investor). Products: 1 Dairy A (6 months), 2 Poultry B (12 months).
 * Everything below was worked out by hand from these rows.
 */
let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const TODAY = '2026-10-14';
const NOW = new Date('2026-10-14T00:00:00Z');
const DAILY = 'from=2026-10-01&to=2026-10-10';
const MONTHLY = 'from=2026-07-01&to=2026-10-10';
const filters = (qs = '', range = DAILY): Filters => parseFilters(new URLSearchParams(`p=custom&${range}&cmp=none&${qs}`), TODAY);
const sales = (
  qs = '',
  range = DAILY,
  view: BookingView = 'day',
  anchor = '2026-10-10',
  today = TODAY,
): Promise<SalesExtras> => loadSalesExtras(q, filters(qs, range), NOW, view, anchor, today);

describe('booking activity URL values', () => {
  it('whitelists views and defaults an invalid anchor to the clamped range end', () => {
    expect(parseBookingView('month')).toBe('month');
    expect(parseBookingView('invalid')).toBe('day');
    expect(resolveBookingAnchor('2026-02-31', filters().range, TODAY)).toBe('2026-10-10');
    expect(resolveBookingAnchor(undefined, filters().range, '2026-10-05')).toBe('2026-10-05');
  });
});

const DAYS = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
/** One [new, returning] pair per day of 1-10 Oct. */
const pairs = (byDay: Record<number, [number, number]>) =>
  DAYS.map((label, i) => ({ label, newInvestors: byDay[i + 1]?.[0] ?? 0, returning: byDay[i + 1]?.[1] ?? 0 }));
/** Weekday rows Monday first; days not listed are zero. */
const week = (byDay: Record<number, [amount: number, deposits: number]>) =>
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, day) => ({
    day,
    label,
    amount: byDay[day]?.[0] ?? 0,
    deposits: byDay[day]?.[1] ?? 0,
  }));
/** 7 x 24 matrix of zeros with the given [weekday, hour] cells set. */
const heat = (cells: [day: number, hour: number, n: number][]) => {
  const m = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [d, h, n] of cells) (m[d] as number[])[h] = n;
  return m;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "deletedAt", "userType", name) VALUES
      (1,  '2026-09-30 18:00', NULL, 'investor', 'Alice'),
      (2,  '2026-09-30 17:59', NULL, 'investor', 'Bob'),
      (3,  '2026-08-15 10:00', NULL, 'investor', 'Carol'),
      (4,  '2026-10-03 10:00', NULL, 'internal-staff', 'Staff'),
      (5,  '2025-10-31 18:00', NULL, 'investor', 'Dan'),
      (6,  '2025-10-31 17:59', NULL, 'investor', 'Eve'),
      (7,  '2026-10-04 10:00', '2026-10-05 00:00', 'investor', 'Deleted'),
      (8,  '2026-10-20 10:00', NULL, 'investor', 'Finn'),
      (9,  '2026-10-13 20:00', NULL, 'investor', 'Gus'),
      (10, '2024-01-01 10:00', NULL, 'investor', 'Hal'),
      (11, '2025-01-01 10:00', NULL, 'investor', 'Ivy');
    INSERT INTO products (id, name, "productDuration", "productReturnType", "isShariah") VALUES
      (1, 'Dairy A', '6 Months', 'percentage', false), (2, 'Poultry B', '12 Months', 'fixed', false);
    INSERT INTO "order" (id, status, quantity, "totalAmount", "investmentDate", "createdAt", "deletedAt", "userId", "productId") VALUES
      (1,  'invested',  1, 1000, '2026-09-30 18:00', '2026-09-30 18:00', NULL, 1, 1),
      (2,  'cancelled', 1, 1000, '2026-10-01 05:30', '2026-10-01 05:30', NULL, 2, 1),
      (3,  'invested',  1, 1000, '2026-10-05 20:30', '2026-10-05 20:30', NULL, 3, 2),
      (4,  'invested',  1, 1000, '2026-10-04 06:00', '2026-10-04 06:00', NULL, 4, 1),
      (5,  'invested',  1, 1000, '2026-10-09 17:59', '2026-10-09 17:59', NULL, 5, 1),
      (6,  'closed',    1, 1000, '2026-10-10 18:00', '2026-10-10 18:00', NULL, 6, 1),
      (7,  'booked',    1, 1000, '2026-10-04 06:00', '2026-10-04 06:00', NULL, 7, 1),
      (8,  'booked',    1, 1000, '2026-10-05 20:45', '2026-10-05 20:45', NULL, 3, 2),
      (9,  'verifying', 1, 1000, '2026-10-10 17:59', '2026-10-10 17:59', NULL, 2, 1),
      (10, 'invested',  1, 1000, '2026-10-04 06:00', '2026-10-04 06:00', '2026-10-05 00:00', 1, 1),
      (11, 'booked',    1, 1000, '2026-09-30 17:59', '2026-09-30 17:59', NULL, 1, 1),
      (12, 'closed',    1, 1000, '2026-10-19 00:00', '2026-10-19 00:00', NULL, 9, 1),
      (13, 'closed',    1, 1000, '2025-10-31 17:59', '2025-10-31 17:59', NULL, 10, 1),
      (14, 'closed',    1, 1000, '2025-10-31 18:00', '2025-10-31 18:00', NULL, 11, 1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId", "deletedAt") VALUES
      (1,  '2026-09-30 18:00', 1000, 'bank_deposit', 'approved', 1,  NULL),
      (2,  '2026-09-30 17:59',  700, 'bank_deposit', 'approved', 2,  NULL),
      (3,  '2026-09-10 00:00', 5000, 'bank_deposit', 'approved', 2,  NULL),
      (4,  '2026-10-02 00:00', 2000, 'bank_deposit', 'approved', 2,  NULL),
      (5,  '2026-10-05 20:00', 3000, 'bank_deposit', 'approved', 3,  NULL),
      (6,  '2026-10-06 04:00',  500, 'cash',         'approved', 3,  NULL),
      (7,  '2026-10-08 00:00',  900, 'bank_deposit', 'approved', 5,  NULL),
      (8,  '2026-10-03 00:00',  400, 'bank_deposit', 'pending',  5,  NULL),
      (9,  '2026-10-10 17:59', 1100, 'cheque',       'approved', 2,  NULL),
      (10, '2026-10-10 18:00',  250, 'bank_deposit', 'approved', 6,  NULL),
      (11, '2026-09-20 00:00',  800, 'bank_deposit', 'approved', 6,  NULL),
      (12, '2026-10-04 00:00', 9999, 'bank_deposit', 'approved', 4,  NULL),
      (13, '2026-10-04 00:00', 8888, 'bank_deposit', 'approved', 7,  NULL),
      (14, '2026-10-07 00:00', 7777, 'bank_deposit', 'approved', 2,  '2026-10-08 00:00'),
      (15, '2026-10-04 00:00', 1500, 'bank_deposit', 'approved', 1,  NULL),
      (16, '2026-10-09 00:00',  600, 'reinvest',     'approved', 2,  NULL),
      (17, '2026-10-19 00:00',  300, 'bank_deposit', 'approved', 12, NULL),
      (18, '2025-10-31 17:59',  100, 'bank_deposit', 'approved', 13, NULL),
      (19, '2025-10-31 18:00',  100, 'bank_deposit', 'approved', 14, NULL);
  `);
});

describe('loadSalesExtras: new vs returning investors (daily, 1-10 Oct)', () => {
  it('splits the investors with sales in each day by where their first approved deposit falls', async () => {
    const d = await sales();
    expect(d.bucket).toBe('day');
    // 1 Oct 00:00 Dhaka (boundary): Alice's first deposit -> new. 2 Oct Bob (first deposit Sep 10) returning. 4 Oct Alice returning.
    // 6 Oct Carol has two deposits the same day and counts once, as new. 8 Oct Dan new. 9 and 10 Oct Bob returning.
    // Left out: 30 Sep 23:59 and 11 Oct 00:00 Dhaka rows, the pending deposit, staff, the deleted investor, the deleted deposit, the future deposit.
    expect(d.newVsReturning).toEqual(pairs({ 1: [1, 0], 2: [0, 1], 4: [0, 1], 6: [1, 0], 8: [1, 0], 9: [0, 1], 10: [0, 1] }));
  });

  it('uses monthly buckets beyond 92 days, in Dhaka months', async () => {
    const d = await sales('', MONTHLY);
    expect(d.bucket).toBe('month');
    // Sep: Bob (first deposit Sep 10, incl. 30 Sep 23:59 Dhaka) and Eve (Sep 20) are new. Oct: Alice (1 Oct 00:00 Dhaka), Carol and Dan are new, Bob is returning.
    expect(d.newVsReturning).toEqual([
      { label: '2026-07-01', newInvestors: 0, returning: 0 },
      { label: '2026-08-01', newInvestors: 0, returning: 0 },
      { label: '2026-09-01', newInvestors: 2, returning: 0 },
      { label: '2026-10-01', newInvestors: 3, returning: 1 },
    ]);
  });

  it('applies the dashboard filters', async () => {
    // Excluding reinvest drops Bob's 9 Oct deposit.
    expect((await sales('xr=1')).newVsReturning).toEqual(pairs({ 1: [1, 0], 2: [0, 1], 4: [0, 1], 6: [1, 0], 8: [1, 0], 10: [0, 1] }));
    // Product 2 is only Carol's order.
    expect((await sales('prod=2')).newVsReturning).toEqual(pairs({ 6: [1, 0] }));
    // Cash only: just Carol's 500 on 6 Oct.
    expect((await sales('pm=cash')).newVsReturning).toEqual(pairs({ 6: [1, 0] }));
  });

  it('leaves out an investor whose first approved deposit comes after the deposit shown', async () => {
    // Dan's pending deposit on 3 Oct precedes his first approved one (8 Oct): neither new nor returning that day.
    const d = await sales('ds=approved,pending');
    expect(d.newVsReturning).toEqual(pairs({ 1: [1, 0], 2: [0, 1], 4: [0, 1], 6: [1, 0], 8: [1, 0], 9: [0, 1], 10: [0, 1] }));
  });
});

describe('loadSalesExtras: weekday pattern', () => {
  it('sums the filtered sales by Dhaka weekday, Monday first, with all 7 days present', async () => {
    const d = await sales();
    // Tue 6 Oct 3000 + 500; Thu 1 Oct 1000 + 8 Oct 900; Fri 2 Oct 2000 + 9 Oct 600 (reinvest counts); Sat 10 Oct 23:59 1100; Sun 4 Oct 1500.
    expect(d.weekday).toEqual(week({ 1: [3500, 2], 3: [1900, 2], 4: [2600, 2], 5: [1100, 1], 6: [1500, 1] }));
  });

  it('follows the filters', async () => {
    expect((await sales('xr=1')).weekday).toEqual(week({ 1: [3500, 2], 3: [1900, 2], 4: [2000, 1], 5: [1100, 1], 6: [1500, 1] }));
    expect((await sales('prod=2')).weekday).toEqual(week({ 1: [3500, 2] }));
    // Including pending adds Dan's 400 on Saturday 3 Oct.
    expect((await sales('ds=approved,pending')).weekday).toEqual(week({ 1: [3500, 2], 3: [1900, 2], 4: [2600, 2], 5: [1500, 2], 6: [1500, 1] }));
  });

  it('counts a deposit stamped 23:59 Dhaka on the right day', async () => {
    const d = await sales('', 'from=2026-10-10&to=2026-10-10');
    expect(d.bucket).toBe('day');
    expect(d.weekday).toEqual(week({ 5: [1100, 1] }));
  });
});

describe('loadSalesExtras: booking heatmap (weekday x hour, Dhaka)', () => {
  it('counts orders of any status by Dhaka weekday and hour', async () => {
    const d = await sales();
    // o1 1 Oct 00:00 Thu; o2 (cancelled) 1 Oct 11:30 Thu; o3 and o8 6 Oct 02:30 / 02:45 Tue; o5 9 Oct 23:59 Fri; o9 (verifying) 10 Oct 23:59 Sat.
    // Left out: staff, deleted investor, deleted order, 30 Sep 23:59 and 11 Oct 00:00 Dhaka, and orders outside the range.
    expect(d.bookingHeat.rows).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(d.bookingHeat.cols).toHaveLength(24);
    expect(d.bookingHeat.cols[0]).toBe('00');
    expect(d.bookingHeat.cols[23]).toBe('23');
    expect(d.bookingHeat.matrix).toEqual(
      heat([
        [3, 0, 1],
        [3, 11, 1],
        [1, 2, 2],
        [4, 23, 1],
        [5, 23, 1],
      ]),
    );
    expect(d.bookingActivity).toMatchObject({
      view: 'day',
      rows: d.bookingHeat.rows,
      cols: d.bookingHeat.cols,
      matrix: d.bookingHeat.matrix,
      total: 6,
    });
  });

  it('applies the product and order filters', async () => {
    expect((await sales('prod=2')).bookingHeat.matrix).toEqual(heat([[1, 2, 2]]));
    expect((await sales('os=booked')).bookingHeat.matrix).toEqual(heat([[1, 2, 1]]));
  });

  it('is not affected by the deposit filters', async () => {
    expect((await sales('ds=pending')).bookingHeat.matrix).toEqual((await sales()).bookingHeat.matrix);
  });

  it('builds ten Monday-start weeks and assigns Sunday 20:30 UTC to Monday in Dhaka', async () => {
    await db.query(`
      INSERT INTO "order" (id, status, "totalAmount", "createdAt", "userId", "productId")
      VALUES (20, 'booked', 1000, '2026-10-04 20:30', 1, 1)
    `);
    try {
      const { bookingActivity: activity } = await sales('', DAILY, 'week', '2026-10-10');
      expect(activity.rows).toEqual(['3 Aug', '10 Aug', '17 Aug', '24 Aug', '31 Aug', '7 Sep', '14 Sep', '21 Sep', '28 Sep', '5 Oct']);
      expect(activity.cols).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
      expect(activity.matrix).toEqual([
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 2, 0, 0, 0],
        [1, 2, 0, 0, 1, 1, 1],
      ]);
      expect(activity.total).toBe(9);
      expect(activity.subtitle).toBe('Bookings per day, 10 weeks to 5 Oct 2026');
    } finally {
      await db.query('DELETE FROM "order" WHERE id = 20');
    }
  });

  it('builds a month grid with day labels and leaves future dates at zero', async () => {
    const { bookingActivity: activity } = await sales('', DAILY, 'month', '2026-10-01');
    expect(activity.title).toBe('October 2026');
    expect(activity.rows).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']);
    expect(activity.matrix).toEqual([
      [0, 0, 0, 2, 0, 0, 0],
      [0, 2, 0, 0, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0],
    ]);
    expect(activity.cellLabels).toEqual([
      ['', '', '', '1', '2', '3', '4'],
      ['5', '6', '7', '8', '9', '10', '11'],
      ['12', '13', '14', '15', '16', '17', '18'],
      ['19', '20', '21', '22', '23', '24', '25'],
      ['26', '27', '28', '29', '30', '31', ''],
    ]);
    expect(activity.total).toBe(7);
  });

  it('builds the correct five-week grid for February', async () => {
    const { bookingActivity: activity } = await sales('', DAILY, 'month', '2026-02-01');
    expect(activity.rows).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']);
    expect(activity.cellLabels).toEqual([
      ['', '', '', '', '', '', '1'],
      ['2', '3', '4', '5', '6', '7', '8'],
      ['9', '10', '11', '12', '13', '14', '15'],
      ['16', '17', '18', '19', '20', '21', '22'],
      ['23', '24', '25', '26', '27', '28', ''],
    ]);
    expect(activity.total).toBe(0);
  });

  it('builds year totals by Dhaka weekday and month and applies product filters', async () => {
    const { bookingActivity: activity } = await sales('', DAILY, 'year', '2026-10-01');
    expect(activity.rows).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(activity.cols).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(activity.matrix).toEqual([
      Array(12).fill(0),
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    ]);
    expect(activity.total).toBe(8);
    const explorer = await loadExplorer(
      q,
      parseExplorerParams(
        new URLSearchParams(`t=orders&p=custom&from=2026-01-01&to=${TODAY}`),
        TODAY,
      ),
    );
    expect(activity.total).toBe(explorer.total);
    const filtered = await sales('prod=2', DAILY, 'year', '2026-10-01');
    expect(filtered.bookingActivity.total).toBe(2);
    expect(filtered.bookingActivity.matrix[1]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0]);
  });

  it('returns an empty matrix for a window after today', async () => {
    const activity = await bookingActivity(q, filters(), 'week', '2027-01-03', TODAY);
    expect(activity.total).toBe(0);
    expect(activity.matrix.flat().every((value) => value === 0)).toBe(true);
  });
});

describe('loadInvestorsExtras: registrations vs first investments', () => {
  let d: InvestorsExtras;
  beforeAll(async () => {
    d = await loadInvestorsExtras(q, TODAY, filters().range);
  });

  it('counts selected-period registrations in Dhaka time and marks those with approved deposits', () => {
    expect(d.registrationsOverTime).toEqual({
      bucket: 'day',
      points: [
        { label: '2026-10-01', registered: 1, invested: 1 },
        { label: '2026-10-02', registered: 0, invested: 0 },
        { label: '2026-10-03', registered: 0, invested: 0 },
        { label: '2026-10-04', registered: 0, invested: 0 },
        { label: '2026-10-05', registered: 0, invested: 0 },
        { label: '2026-10-06', registered: 0, invested: 0 },
        { label: '2026-10-07', registered: 0, invested: 0 },
        { label: '2026-10-08', registered: 0, invested: 0 },
        { label: '2026-10-09', registered: 0, invested: 0 },
        { label: '2026-10-10', registered: 0, invested: 0 },
      ],
    });
  });

  it('matches the Command Center registrations total for the same range', async () => {
    const total = d.registrationsOverTime.points.reduce((sum, point) => sum + point.registered, 0);
    expect(total).toBe(await registrations(q, filters().range));
  });

  it('counts an investor as invested when their approved deposit is later than registration', async () => {
    const range = filters('', 'from=2026-10-11&to=2026-10-20').range;
    const extras = await loadInvestorsExtras(q, TODAY, range);
    expect(extras.registrationsOverTime).toEqual({
      bucket: 'day',
      points: [
        { label: '2026-10-11', registered: 0, invested: 0 },
        { label: '2026-10-12', registered: 0, invested: 0 },
        { label: '2026-10-13', registered: 0, invested: 0 },
        { label: '2026-10-14', registered: 1, invested: 1 },
        { label: '2026-10-15', registered: 0, invested: 0 },
        { label: '2026-10-16', registered: 0, invested: 0 },
        { label: '2026-10-17', registered: 0, invested: 0 },
        { label: '2026-10-18', registered: 0, invested: 0 },
        { label: '2026-10-19', registered: 0, invested: 0 },
        { label: '2026-10-20', registered: 1, invested: 0 },
      ],
    });
  });

  it('uses zero-filled monthly buckets beyond 92 days', async () => {
    const range = filters('', MONTHLY).range;
    const extras = await loadInvestorsExtras(q, TODAY, range);
    expect(extras.registrationsOverTime).toEqual({
      bucket: 'month',
      points: [
        { label: '2026-07-01', registered: 0, invested: 0 },
        { label: '2026-08-01', registered: 1, invested: 1 },
        { label: '2026-09-01', registered: 1, invested: 1 },
        { label: '2026-10-01', registered: 1, invested: 1 },
      ],
    });
  });

  it('zero-fills an empty selected period', async () => {
    const empty = new PGlite();
    await empty.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
    const eq: QueryFn = async (sql, params = []) => {
      assertReadOnlySql(sql);
      return (await empty.query(sql, params)).rows as Record<string, unknown>[];
    };
    const range = filters('', 'from=2025-01-01&to=2025-01-03').range;
    const extras = await loadInvestorsExtras(eq, TODAY, range);
    expect(extras.registrationsOverTime).toEqual({
      bucket: 'day',
      points: [
        { label: '2025-01-01', registered: 0, invested: 0 },
        { label: '2025-01-02', registered: 0, invested: 0 },
        { label: '2025-01-03', registered: 0, invested: 0 },
      ],
    });
    await empty.close();
  });

  it('covers the last 12 Dhaka months, current included, as first-of-month dates', () => {
    expect(d.registrationsVsFirst.map((r) => r.month)).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
  });

  it('counts investors registered per month', () => {
    // Nov 2025: Dan (1 Nov 00:00 Dhaka, first minute of the window). Aug: Carol. Sep: Bob (30 Sep 23:59 Dhaka). Oct: Alice (1 Oct 00:00 Dhaka) and Gus (today).
    // Left out: Eve (31 Oct 2025 Dhaka), Hal, Ivy (earlier), Finn (after today), staff, the deleted investor.
    expect(d.registrationsVsFirst.map((r) => r.registered)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
  });

  it('counts investors whose first-ever approved deposit falls in the month', () => {
    // Nov 2025: Ivy (1 Nov 00:00 Dhaka). Sep: Bob (Sep 10) and Eve (Sep 20). Oct: Alice (1 Oct 00:00 Dhaka), Carol (6 Oct), Dan (8 Oct).
    // Left out: Hal (31 Oct 2025 Dhaka, before the window), Gus (deposit dated after today), staff, the deleted investor, the pending deposit.
    expect(d.registrationsVsFirst.map((r) => r.firstInvestments)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3]);
  });

  it('moves the window with today', async () => {
    const earlier = await loadInvestorsExtras(q, '2026-09-30', filters().range);
    expect(earlier.registrationsVsFirst).toHaveLength(12);
    expect(earlier.registrationsVsFirst[0]?.month).toBe('2025-10-01');
    expect(earlier.registrationsVsFirst[11]?.month).toBe('2026-09-01');
    // Up to 30 Sep: Eve (Oct 2025 registration, 31 Oct 17:59 UTC = 31 Oct Dhaka) is now inside the window.
    expect(earlier.registrationsVsFirst[0]).toEqual({ month: '2025-10-01', registered: 1, firstInvestments: 1 });
    // Alice (1 Oct) is after that today, so September only has Bob.
    expect(earlier.registrationsVsFirst[11]).toEqual({ month: '2026-09-01', registered: 1, firstInvestments: 2 });
  });
});

describe('empty database', () => {
  it('returns zero-filled series, never missing entries', async () => {
    const empty = new PGlite();
    await empty.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
    const eq: QueryFn = async (sql, params = []) => {
      assertReadOnlySql(sql);
      return (await empty.query(sql, params)).rows as Record<string, unknown>[];
    };
    const s = await loadSalesExtras(eq, filters(), NOW, 'day', '2026-10-10', TODAY);
    expect(s.newVsReturning).toEqual(pairs({}));
    expect(s.weekday).toEqual(week({}));
    expect(s.bookingHeat.matrix).toEqual(heat([]));
    const i = await loadInvestorsExtras(eq, TODAY, filters().range);
    expect(i.registrationsVsFirst).toHaveLength(12);
    expect(i.registrationsVsFirst.every((r) => r.registered === 0 && r.firstInvestments === 0)).toBe(true);
  }, 15_000);
});

describe('result shape', () => {
  it('is plain JSON (safe for unstable_cache)', async () => {
    const s = await sales();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const i = await loadInvestorsExtras(q, TODAY, filters().range);
    expect(JSON.parse(JSON.stringify(i))).toEqual(i);
  });
});
