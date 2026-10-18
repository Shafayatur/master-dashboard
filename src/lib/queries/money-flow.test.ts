import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildMoneyFlowInsights } from '@/lib/dashboard/money-flow-insights';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadMoneyFlow, mondayOf } from './money-flow';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';
const SEPT = { from: '2026-09-01', to: '2026-09-30' };
const AUG = { from: '2026-08-01', to: '2026-08-31' };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES (1,'2026-01-01','investor'),(2,'2026-01-01','investor'),(3,'2026-01-01','investor'),(4,'2026-01-01','investor'),(5,'2026-01-01','investor'),(6,'2026-01-01','internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'A', '6 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId") VALUES
      (1,'closed',10000,'2026-01-01',1,1), (2,'closed',20000,'2026-01-01',2,1), (3,'closed',30000,'2026-01-01',3,1),
      (4,'invested',20000,'2026-06-01',1,1), (5,'invested',10000,'2026-05-18',4,1), (6,'invested',8000,'2026-04-01',5,1),
      (7,'invested',12000,'2026-05-01',1,1), (8,'invested',99999,'2026-05-01',6,1);
    INSERT INTO return_schedules (id, "orderId", "paymentDate", "profitAmount", "principalAmount", "totalAmount") VALUES
      (1,5,'2026-10-16',500,0,500), (2,5,'2026-11-18',500,10000,10500);
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES
      (1,'2026-09-05',1000,'completed',1), (2,'2026-09-10',2000,'completed',2), (3,'2026-09-20',3000,'completed',3),
      (4,'2026-10-12',800,'initiated',4), (5,'2026-08-15',500,'completed',1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (0,'2026-01-10',3000,'bank_deposit','approved',2),
      (1,'2026-09-20',5000,'reinvest','approved',4), (2,'2026-09-25',4000,'bank_deposit','approved',2),
      (3,'2026-10-10',9000,'bank_deposit','approved',3), (4,'2026-09-28',6000,'bank_deposit','approved',5),
      (5,'2026-09-02',2500,'bank_deposit','approved',6), (6,'2026-09-15',777,'bank_deposit','approved',8);
  `);
});

describe('helpers', () => {
  it('mondayOf returns the Monday of the week', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12'); // Wednesday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // Sunday
  });
});

describe('loadMoneyFlow', () => {
  it('payouts by month: completed and initiated, 12 months, zero-filled', async () => {
    const d = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(d.payoutsByMonth).toHaveLength(12);
    expect(d.payoutsByMonth[0]?.month).toBe('2025-11-01');
    expect(d.payoutsByMonth.find((x) => x.month === '2026-09-01')?.completed).toEqual({ count: 3, amount: 6000 });
    expect(d.payoutsByMonth.find((x) => x.month === '2026-08-01')?.completed).toEqual({ count: 1, amount: 500 });
    expect(d.payoutsByMonth.find((x) => x.month === '2026-10-01')?.initiated).toEqual({ count: 1, amount: 800 });
    expect(d.inFlight).toEqual({ count: 1, amount: 800 });
  });

  it('scheduled payouts per week for running investments, with schedule coverage', async () => {
    const d = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(d.schedule.weeks).toHaveLength(12);
    expect(d.schedule.weeks[0]).toEqual({ week: '2026-10-12', count: 1, total: 500, profit: 500, principal: 0 });
    expect(d.schedule.weeks.find((w) => w.week === '2026-11-16')).toMatchObject({ total: 10500, principal: 10000 });
    expect(d.schedule.coverage).toEqual({ invested: 4, withSchedule: 1 }); // staff order excluded
  });

  it('maturity calendar: principal per week, plus past-maturity orders still marked invested', async () => {
    const d = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(d.maturity.overdue).toEqual({ count: 1, amount: 8000 });
    const by = Object.fromEntries(d.maturity.weeks.filter((w) => w.count).map((w) => [w.week, w.principal]));
    expect(by).toEqual({ '2026-10-26': 12000, '2026-11-16': 10000, '2026-11-30': 20000 });
  });

  it('reinvestment levels: confirmed, estimated (payout in the previous 30 days) and repeat investors', async () => {
    const d = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(d.reinvest.total).toEqual({ count: 4, amount: 17500, investors: 4 });
    expect(d.reinvest.confirmed).toEqual({ count: 1, amount: 5000, investors: 1 });
    expect(d.reinvest.estimated).toEqual({ count: 1, amount: 4000, investors: 1 }); // user 2 was paid on 10 Sep
    expect(d.reinvest.repeat).toEqual({ investing: 4, returning: 1 }); // user 2 first invested in January
  });

  it('payout to reinvest rate with completeness flags', async () => {
    const sept = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(sept.conversion).toMatchObject({ paidInvestors: 3, paidAmount: 6000, r30: 3, r60: 3, r90: 3, complete30: false });
    const aug = await loadMoneyFlow(q, AUG, TODAY, NOW);
    expect(aug.conversion).toMatchObject({ paidInvestors: 1, paidAmount: 500, r30: 0, r60: 1, complete30: true, complete60: false });
  });

  it('is plain JSON', async () => {
    const d = await loadMoneyFlow(q, SEPT, TODAY, NOW);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});

describe('buildMoneyFlowInsights', () => {
  it('flags overdue orders, thin schedule coverage and the reinvestment split', async () => {
    const texts = buildMoneyFlowInsights(await loadMoneyFlow(q, SEPT, TODAY, NOW), 'm').map((i) => i.text);
    expect(texts.some((t) => t.includes('past maturity but still marked invested'))).toBe(true);
    expect(texts.some((t) => t.includes('Only 25% of running investments have a payout schedule'))).toBe(true);
    expect(texts.some((t) => t.includes('5.0K confirmed') && t.includes('4.0K estimated'))).toBe(true);
    expect(texts.some((t) => t.includes('window is still open'))).toBe(true);
  });
});
