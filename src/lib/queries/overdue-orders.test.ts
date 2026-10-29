import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listExport } from '@/lib/export/action-list-csv';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadActionLists } from './action-lists';
import { loadMoneyFlow } from './money-flow';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, "createdAt", "userType") VALUES
      (1, 'Ten days overdue', '2026-01-01', 'investor'),
      (2, 'Forty-five days overdue', '2026-01-02', 'investor'),
      (3, 'One hundred twenty days overdue', '2026-01-03', 'investor'),
      (4, 'Closed order', '2026-01-04', 'investor'),
      (5, 'Soft-deleted order', '2026-01-05', 'investor');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Project', '6 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId") VALUES
      (10, 'invested', 100, '2026-01-01', 1, 1),
      (11, 'invested', 200, '2026-01-02', 2, 1),
      (12, 'invested', 300, '2026-01-03', 3, 1),
      (13, 'closed', 400, '2026-01-04', 4, 1);
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId", "deletedAt") VALUES
      (14, 'invested', 500, '2026-01-05', 5, 1, '2026-01-06');
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES
      (10, 10, '2026-10-04'),
      (11, 11, '2026-08-30'),
      (12, 12, '2026-06-16'),
      (13, 13, '2026-06-16'),
      (14, 14, '2026-06-16');
  `);
});

describe('overdue investments', () => {
  it('separates recent maturity from stale invested orders and counts all past maturities', async () => {
    const actions = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    expect(actions.maturing.rows.map(({ orderId, daysLeft }) => [orderId, daysLeft])).toEqual([[10, -10]]);
    expect(actions.overdue.rows.map(({ orderId, daysOverdue, bucket }) => [orderId, daysOverdue, bucket])).toEqual([
      [12, 120, '90+'],
      [11, 45, '31-90'],
    ]);
    expect(actions.overdue.total).toBe(2);
    expect(actions.overdue.amount).toBe(500);
    expect(actions.maturing.rows.some((row) => actions.overdue.rows.some((overdueRow) => overdueRow.orderId === row.orderId))).toBe(false);

    const flow = await loadMoneyFlow(q, RANGE, TODAY, NOW);
    expect(flow.maturity.overdue).toEqual({ count: 3, amount: 600 });
  });

  it('exports the overdue list', async () => {
    const actions = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    const output = listExport('overdue', actions);
    expect(output.title).toBe('Overdue: status needs update');
    expect(output.toCsv()).toContain('One hundred twenty days overdue');
    expect(output.toCsv()).toContain('90+');
  });
});
