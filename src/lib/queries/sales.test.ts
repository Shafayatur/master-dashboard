import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters, type Filters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadSales, salesBreakdown } from './sales';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const filters = (qs = ''): Filters => parseFilters(new URLSearchParams(`p=custom&from=2026-10-01&to=2026-10-10&cmp=none&${qs}`), '2026-10-14');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES (1, '2026-10-02', 'investor'), (2, '2026-10-04', 'investor'), (3, '2026-09-20', 'investor');
    INSERT INTO categories (id, name) VALUES (1, 'Dairy'), (2, 'Poultry');
    INSERT INTO products (id, name, "productDuration", "productReturnType", "isShariah") VALUES
      (1, 'Dairy A', '6 Months', 'percentage', false), (2, 'Poultry B', '12 Months', 'fixed', true), (3, 'Mixed C', '1 Month', 'percentage', false);
    INSERT INTO category_products ("categoriesId", "productsId") VALUES (1, 1), (2, 2), (1, 3), (2, 3);
    INSERT INTO "order" (id, status, "totalAmount", "createdAt", "userId", "productId") VALUES
      (1, 'invested', 10000, '2026-10-03', 1, 1), (2, 'invested', 21000, '2026-10-05', 2, 2),
      (3, 'invested', 4000, '2026-10-06', 3, 3), (4, 'cancelled', 3000, '2026-10-07', 1, 1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1, '2026-10-03', 10000, 'bank_deposit', 'approved', 1),
      (2, '2026-10-05', 20000, 'reinvest',     'approved', 2),
      (3, '2026-10-06',  4000, 'cash',         'approved', 3),
      (4, '2026-10-07',  3000, 'bank_deposit', 'pending',  4),
      (5, '2026-10-08',  1500, 'bank_deposit', 'rejected', 1);
  `);
});

const by = (rows: { key: string; value: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r.value]));

describe('salesBreakdown', () => {
  it('by product, with shares that add up to 100', async () => {
    const rows = await salesBreakdown(q, filters(), filters().range, 'product');
    expect(rows.map((r) => [r.label, r.value])).toEqual([['Poultry B', 20000], ['Dairy A', 10000], ['Mixed C', 4000]]);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
    expect(rows[0]).toMatchObject({ deposits: 1, investors: 1 });
  });

  it('by category counts a product in each of its categories', async () => {
    const rows = await salesBreakdown(q, filters(), filters().range, 'category');
    expect(by(rows)).toEqual({ '1': 14000, '2': 24000 }); // Dairy = A + C, Poultry = B + C
  });

  it('by tenure sorts numerically and labels months', async () => {
    const rows = await salesBreakdown(q, filters(), filters().range, 'tenure');
    expect(rows.map((r) => r.label)).toEqual(['1 month', '6 months', '12 months']);
  });

  it('by return type and payment method', async () => {
    expect(by(await salesBreakdown(q, filters(), filters().range, 'returnType'))).toEqual({ percentage: 14000, fixed: 20000 });
    expect(by(await salesBreakdown(q, filters(), filters().range, 'paymentMethod'))).toEqual({ bank_deposit: 10000, reinvest: 20000, cash: 4000 });
  });

  it('status split ignores the deposit-status filter and shows every status', async () => {
    const rows = await salesBreakdown(q, filters('ds=approved'), filters().range, 'depositStatus');
    expect(by(rows)).toEqual({ approved: 34000, pending: 3000, rejected: 1500 });
  });

  it('respects the other filters', async () => {
    expect(by(await salesBreakdown(q, filters('xr=1'), filters().range, 'product'))).toEqual({ '1': 10000, '3': 4000 });
    expect(await salesBreakdown(q, filters('ten=24'), filters().range, 'product')).toEqual([]);
  });
});

describe('loadSales', () => {
  it('returns the total and every breakdown as plain JSON', async () => {
    const d = await loadSales(q, filters(), new Date('2026-10-14T00:00:00Z'));
    expect(d.total.sales).toBe(34000);
    expect(Object.keys(d.breakdowns).sort()).toEqual(['category', 'depositStatus', 'paymentMethod', 'product', 'returnType', 'tenure']);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
