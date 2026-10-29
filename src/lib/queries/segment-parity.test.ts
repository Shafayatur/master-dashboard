import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadActionLists } from './action-lists';
import { loadExplorer, parseExplorerParams } from './explorer';
import { investorProfile } from './investor-profile';
import { SEGMENT_ORDER, segments } from './investors';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';
const EXPECTED = new Map<number, string>([
  [101, 'cooling'],
  [102, 'active'],
  [103, 'recently_active'],
  [104, 'prospect'],
  [105, 'inactive'],
]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, "createdAt", "userType") VALUES
      (101, 'Matured invested', '2026-01-01', 'investor'),
      (102, 'Mixed maturity', '2026-01-02', 'investor'),
      (103, 'Recently closed', '2026-01-03', 'investor'),
      (104, 'No orders', '2026-01-04', 'investor'),
      (105, 'Long matured invested', '2026-01-05', 'investor');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Project', '6 Months');
    INSERT INTO "order" (id, status, "investmentDate", "userId", "productId") VALUES
      (101, 'invested', '2025-01-01', 101, 1),
      (102, 'invested', '2025-01-01', 102, 1),
      (103, 'invested', '2026-10-01', 102, 1),
      (104, 'closed', '2025-01-01', 103, 1),
      (105, 'invested', '2025-01-01', 105, 1);
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES
      (101, 101, '2026-09-04'),
      (102, 102, '2026-09-01'),
      (103, 103, '2026-10-20'),
      (104, 104, '2026-10-04'),
      (105, 105, '2026-07-01');
  `);
});

describe('investor segment parity', () => {
  it('classifies maturity snapshots consistently across segment surfaces', async () => {
    const aggregate = await segments(q, NOW);
    expect(aggregate.map(({ key }) => key)).toEqual(SEGMENT_ORDER);
    expect(Object.fromEntries(aggregate.map(({ key, investors }) => [key, investors]))).toEqual({
      active: 1,
      recently_active: 1,
      cooling: 1,
      inactive: 1,
      prospect: 1,
    });

    const params = parseExplorerParams(
      new URLSearchParams('t=investors&p=custom&from=2015-01-01&to=2026-10-14'),
      TODAY,
    );
    const explorer = await loadExplorer(q, params, NOW);
    const explorerSegments = new Map(explorer.rows.map((row) => [Number(row.userId), String(row.segment)]));
    const profileSegments = new Map<number, string>();
    for (const userId of EXPECTED.keys()) {
      profileSegments.set(userId, String((await investorProfile(q, userId, NOW))?.segment));
    }

    const actions = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    const coolingIds = new Set(actions.cooling.rows.map(({ userId }) => userId));
    for (const [userId, expected] of EXPECTED) {
      expect(explorerSegments.get(userId)).toBe(expected);
      expect(profileSegments.get(userId)).toBe(expected);
      expect(coolingIds.has(userId)).toBe(expected === 'cooling');
    }
    expect(actions.cooling.rows.map(({ userId, daysSince }) => [userId, daysSince])).toEqual([[101, 40]]);
  });
});
