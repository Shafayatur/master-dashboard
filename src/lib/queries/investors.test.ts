import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildInvestorInsights } from '@/lib/dashboard/investor-insights';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { cohorts, concentration, loadInvestors, medianDaysToFirst, segments, tiers } from './investors';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES
      (1,'2026-09-10','investor'),(2,'2026-09-20','investor'),(3,'2026-09-25','investor'),(4,'2026-08-05','investor'),
      (5,'2026-10-02','investor'),(6,'2026-10-03','investor'),(7,'2026-08-20','investor'),(8,'2026-09-01','internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'A', '6 Months');
    INSERT INTO "order" (id, status, "investmentDate", "userId", "productId") VALUES
      (1,'invested','2026-09-12',1,1), (2,'closed','2026-04-01',2,1), (3,'closed','2026-03-01',3,1),
      (4,'closed','2026-01-01',4,1), (5,'cancelled','2026-10-04',6,1), (6,'invested','2026-10-05',7,1), (7,'closed','2026-01-05',7,1);
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES (1,2,'2026-09-01'), (2,2,'2026-10-01');
    INSERT INTO deposits (id, "date", amount, status, "orderId") VALUES
      (1,'2026-09-12',10000,'approved',1), (2,'2026-10-10',20000,'approved',2), (3,'2026-09-27',3000,'approved',3),
      (4,'2026-08-10',500000,'approved',4), (5,'2026-10-05',1200000,'approved',6), (6,'2026-10-06',800000,'approved',7),
      (7,'2026-10-07',99999,'pending',5);
  `);
});

describe('segments', () => {
  it('classifies by running project, then by how long ago the last project matured', async () => {
    const rows = await segments(q, NOW);
    const n = Object.fromEntries(rows.map((r) => [r.key, r.investors]));
    // u1 and u7 have running projects; u2 matured 13d ago; u3 (no schedule, 1 Mar + 6 months) 43d; u4 105d; u5 and u6 never invested
    expect(n).toEqual({ active: 2, recently_active: 1, cooling: 1, inactive: 1, prospect: 2 });
    expect(rows.find((r) => r.key === 'active')).toMatchObject({ lifetimeValue: 2010000, avgLifetimeValue: 1005000 });
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
  });
  it('respects custom thresholds', async () => {
    const rows = await segments(q, NOW, { recentlyActiveDays: 10, coolingDays: 50 });
    expect(Object.fromEntries(rows.map((r) => [r.key, r.investors]))).toMatchObject({ recently_active: 0, cooling: 2, inactive: 1 });
  });
});

describe('tiers and concentration', () => {
  it('buckets investors by lifetime value, ignoring pending deposits and staff', async () => {
    const t = await tiers(q);
    expect(t.map((x) => x.investors)).toEqual([3, 0, 1, 1, 0]);
    expect(t[4]).toMatchObject({ min: 5_000_000, max: null });
    expect(t.reduce((s, x) => s + x.investorShare, 0)).toBeCloseTo(100);
  });
  it('measures how concentrated the money is', async () => {
    const c = await concentration(q);
    expect(c).toMatchObject({ investors: 5, total: 2533000 });
    expect(c.top10Share).toBeCloseTo(100);
    expect(c.top20PctShare).toBeCloseTo(78.96, 1); // top 20% of 5 investors = 1 investor (2,000,000)
  });
});

describe('cohorts', () => {
  it('counts conversions within 7, 30 and 90 days of registration', async () => {
    const c = await cohorts(q, TODAY);
    expect(c).toHaveLength(12);
    expect(c[0]?.month).toBe('2025-11-01');
    expect(c.find((x) => x.month === '2026-08-01')).toMatchObject({ registered: 2, d7: 1, d30: 1, d90: 2, ever: 2, complete30: true, complete90: false });
    expect(c.find((x) => x.month === '2026-09-01')).toMatchObject({ registered: 3, d7: 2, d30: 3, ever: 3, complete7: true, complete30: false });
    expect(c.find((x) => x.month === '2026-10-01')).toMatchObject({ registered: 2, ever: 0, complete7: false });
  });
  it('median days from registration to first approved deposit', async () => {
    expect(await medianDaysToFirst(q)).toBe(5);
  });
});

describe('loadInvestors and insights', () => {
  it('returns plain JSON with the investor total', async () => {
    const d = await loadInvestors(q, TODAY, NOW);
    expect(d.totalInvestors).toBe(7);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    const texts = buildInvestorInsights(d, 'm').map((i) => i.text);
    expect(texts.some((t) => t.includes('1 investors are cooling'))).toBe(true);
    expect(texts.some((t) => t.includes('typical investor makes a first investment 5 days'))).toBe(true);
  });
});
