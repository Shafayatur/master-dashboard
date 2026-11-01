import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadMoneyFlow } from './money-flow';
import { attention, loadCommandCenter } from './overview';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';
const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const EXPECTED = { count: 1, amount: 110 };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES
      (1, '2026-01-01', 'investor'),
      (2, '2026-01-02', 'investor'),
      (3, '2026-01-03', 'internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Project', '6 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId") VALUES
      (1, 'invested', 1000, '2026-01-01', 1, 1),
      (2, 'invested', 2000, '2026-01-02', 2, 1),
      (3, 'invested', 3000, '2026-01-03', 3, 1);
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId", "deletedAt") VALUES
      (4, 'invested', 4000, '2026-01-04', 1, 1, '2026-01-05');
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES
      (1, '2026-10-10', 110, 'initiated', 1),
      (2, '2026-10-10', 220, 'initiated', 4),
      (3, '2026-10-10', 330, 'initiated', 3),
      (4, '2026-10-10', 440, 'initiated', 1),
      (5, '2026-10-10', 550, 'completed', 1);
    UPDATE returns SET "deletedAt" = '2026-10-11' WHERE id = 4;
  `);
});

describe('payouts in flight', () => {
  it('counts only initiated payouts on live investor orders consistently', async () => {
    const directAttention = await attention(q, NOW);
    expect(directAttention.payoutsInFlight).toEqual(EXPECTED);

    const filters = parseFilters(
      new URLSearchParams('p=custom&from=2026-09-01&to=2026-09-30&cmp=none'),
      TODAY,
    );
    const commandCenter = await loadCommandCenter({ q, getTarget: async () => null }, filters, TODAY, NOW);
    expect(commandCenter.attention.payoutsInFlight).toEqual(EXPECTED);

    const moneyFlow = await loadMoneyFlow(q, RANGE, TODAY, NOW);
    expect(moneyFlow.inFlight).toEqual(EXPECTED);
  });
});
