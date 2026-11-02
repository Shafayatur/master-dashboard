import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFilters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadMoneyFlow } from './money-flow';
import { Params, salesBase, utcBounds, type QueryFn, type Row } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Row[];
};
const RANGE = { from: '2026-01-01', to: '2026-03-31' };
const TODAY = '2026-04-20';
const NOW = new Date('2026-04-20T00:00:00Z');

const num = (value: unknown): number => Number(value ?? 0);

async function oldReinvestmentReference(q: QueryFn) {
  const neutral = { ...parseFilters(new URLSearchParams(), TODAY), range: RANGE };
  const p = new Params();
  const base = salesBase(neutral, RANGE, p, true);
  const rows = await q(
    `WITH ${base.cte}, x AS (
  SELECT bs.dep_id, bs.amount, bs."userId", d."paymentMethod"::text AS method,
    EXISTS (SELECT 1 FROM returns r JOIN "order" ro ON ro.id = r."orderId" AND ro."deletedAt" IS NULL
      WHERE ro."userId" = bs."userId" AND r."deletedAt" IS NULL AND r.status::text = 'completed'
        AND r."date" <= bs.dep_date AND r."date" > bs.dep_date - interval '30 days') AS linked
  FROM base bs JOIN deposits d ON d.id = bs.dep_id
)
SELECT dep_id, amount, "userId" AS user_id, method, linked FROM x`,
    p.values,
  );
  const all = rows.length;
  const approvedAmount = rows.reduce((sum, row) => sum + num(row.amount), 0);
  const allInvestors = new Set(rows.map((row) => num(row.user_id)));
  const confirmed = rows.filter((row) => row.method === 'reinvest');
  const estimated = rows.filter((row) => row.method !== 'reinvest' && row.linked === true);
  return {
    result: {
      total: { count: all, amount: approvedAmount, investors: allInvestors.size },
      confirmed: {
        count: confirmed.length,
        amount: confirmed.reduce((sum, row) => sum + num(row.amount), 0),
        investors: new Set(confirmed.map((row) => num(row.user_id))).size,
      },
      estimated: {
        count: estimated.length,
        amount: estimated.reduce((sum, row) => sum + num(row.amount), 0),
        investors: new Set(estimated.map((row) => num(row.user_id))).size,
      },
    },
    linkedDepositIds: new Set(estimated.map((row) => num(row.dep_id))),
  };
}

async function oldConversionReference(q: QueryFn) {
  const { start, end } = utcBounds(RANGE);
  const p = new Params();
  const s = p.add(start);
  const e = p.add(end);
  const rows = await q(
    `WITH fp AS (
  SELECT o."userId", MIN(r."date") AS first_payout, SUM(r.amount) AS paid
  FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL
  JOIN "user" u ON u.id = o."userId" AND u."deletedAt" IS NULL AND u."userType"::text = 'investor'
  WHERE r."deletedAt" IS NULL AND r.status::text = 'completed'
    AND r."date" >= ${s}::timestamp AND r."date" < ${e}::timestamp
  GROUP BY o."userId"
)
SELECT fp."userId" AS user_id, fp.first_payout, fp.paid,
  EXISTS (SELECT 1 FROM deposits d JOIN "order" o2 ON o2.id = d."orderId" AND o2."deletedAt" IS NULL
    JOIN "user" u2 ON u2.id = o2."userId" AND u2."deletedAt" IS NULL AND u2."userType"::text = 'investor'
    WHERE o2."userId" = fp."userId" AND d."deletedAt" IS NULL AND d.status::text = 'approved'
      AND d."date" >= fp.first_payout AND d."date" < fp.first_payout + interval '30 days') AS r30,
  EXISTS (SELECT 1 FROM deposits d JOIN "order" o2 ON o2.id = d."orderId" AND o2."deletedAt" IS NULL
    JOIN "user" u2 ON u2.id = o2."userId" AND u2."deletedAt" IS NULL AND u2."userType"::text = 'investor'
    WHERE o2."userId" = fp."userId" AND d."deletedAt" IS NULL AND d.status::text = 'approved'
      AND d."date" >= fp.first_payout AND d."date" < fp.first_payout + interval '60 days') AS r60,
  EXISTS (SELECT 1 FROM deposits d JOIN "order" o2 ON o2.id = d."orderId" AND o2."deletedAt" IS NULL
    JOIN "user" u2 ON u2.id = o2."userId" AND u2."deletedAt" IS NULL AND u2."userType"::text = 'investor'
    WHERE o2."userId" = fp."userId" AND d."deletedAt" IS NULL AND d.status::text = 'approved'
      AND d."date" >= fp.first_payout AND d."date" < fp.first_payout + interval '90 days') AS r90
FROM fp`,
    p.values,
  );
  return {
    result: {
      paidInvestors: rows.length,
      paidAmount: rows.reduce((sum, row) => sum + num(row.paid), 0),
      r30: rows.filter((row) => row.r30 === true).length,
      r60: rows.filter((row) => row.r60 === true).length,
      r90: rows.filter((row) => row.r90 === true).length,
    },
    byUser: new Map(rows.map((row) => [num(row.user_id), row])),
  };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));

  const users = Array.from({ length: 28 }, (_, index) => {
    const id = index + 1;
    return `(${id}, 'User ${id}', '${id === 8 ? 'internal-staff' : 'investor'}', NULL)`;
  });
  await db.exec(`
    INSERT INTO "user" (id, name, "userType", "deletedAt") VALUES ${users.join(',')};
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Project', '6 Months');
  `);
  const orderRows = Array.from({ length: 28 }, (_, index) => {
    const userId = index + 1;
    const deletedAt = userId === 7 ? "'2026-01-02'" : 'NULL';
    return `(${1000 + userId}, 'closed', 1000, '2026-01-01', ${userId}, 1, ${deletedAt})`;
  });
  await db.exec(`
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId", "deletedAt")
    VALUES ${orderRows.join(',')};
  `);

  const deposits: Array<[number, string, number, string, string, number, string | null]> = [
    [1, '2026-01-20 12:00:00', 100, 'bank_deposit', 'approved', 1, null],
    [2, '2026-03-02 12:00:00', 200, 'bank_deposit', 'approved', 2, null],
    [3, '2026-03-02 12:00:00', 300, 'bank_deposit', 'approved', 3, null],
    [4, '2026-02-01 12:00:00', 400, 'bank_deposit', 'approved', 4, null],
    [5, '2026-02-01 12:00:00', 500, 'bank_deposit', 'pending', 5, null],
    [6, '2026-02-01 12:00:00', 510, 'bank_deposit', 'rejected', 5, null],
    [7, '2026-02-01 12:00:00', 600, 'bank_deposit', 'approved', 6, null],
    [8, '2026-02-01 12:00:00', 700, 'bank_deposit', 'approved', 7, null],
    [9, '2026-02-01 12:00:00', 800, 'bank_deposit', 'approved', 8, null],
    [10, '2026-02-20 12:00:00', 900, 'bank_deposit', 'approved', 9, null],
    [11, '2026-01-30 23:59:59', 1000, 'bank_deposit', 'approved', 10, null],
    [12, '2026-01-31 00:00:00', 1100, 'bank_deposit', 'approved', 11, null],
    [13, '2026-03-02 00:00:00', 1200, 'bank_deposit', 'approved', 12, null],
    [14, '2026-04-01 00:00:00', 1300, 'bank_deposit', 'approved', 13, null],
    [15, '2025-12-31 23:59:59', 1400, 'bank_deposit', 'approved', 14, null],
    [16, '2026-04-15 12:00:00', 1500, 'bank_deposit', 'approved', 15, null],
    [17, '2026-01-10 00:00:00', 1600, 'bank_deposit', 'approved', 16, null],
    [18, '2026-02-01 00:00:00', 1700, 'bank_deposit', 'approved', 6, '2026-02-02'],
  ];
  for (let userId = 17; userId <= 28; userId += 1) {
    deposits.push([userId + 10, '2026-02-10 12:00:00', userId * 100, 'bank_deposit', 'approved', userId, null]);
  }
  const depositValues: unknown[] = [];
  const depositSql = deposits.map(([id, date, amount, method, status, userId, deletedAt]) => {
    depositValues.push(id, date, amount, method, status, 1000 + userId, deletedAt);
    const i = depositValues.length - 6;
    return `($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`;
  });
  await db.query(
    `INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId", "deletedAt") VALUES ${depositSql.join(',')}`,
    depositValues,
  );

  const returns: Array<[number, string, number, string, number, string | null]> = [
    [1, '2026-01-20 12:00:00', 10, 'completed', 1, null],
    [2, '2026-01-31 12:00:00', 20, 'completed', 2, null],
    [3, '2026-01-31 11:59:59', 30, 'completed', 3, null],
    [4, '2026-02-02 12:00:00', 40, 'completed', 4, null],
    [5, '2026-02-01 12:00:00', 50, 'completed', 5, null],
    [6, '2026-02-01 12:00:00', 60, 'completed', 6, '2026-02-03'],
    [7, '2026-02-01 12:00:00', 70, 'completed', 7, null],
    [8, '2026-02-01 12:00:00', 80, 'completed', 8, null],
    [9, '2026-02-01 12:00:00', 90, 'completed', 9, null],
    [10, '2026-02-15 12:00:00', 91, 'completed', 9, null],
    [11, '2026-01-01 00:00:00', 100, 'completed', 10, null],
    [12, '2026-01-01 00:00:00', 110, 'completed', 11, null],
    [13, '2026-01-01 00:00:00', 120, 'completed', 12, null],
    [14, '2026-01-01 00:00:00', 130, 'completed', 13, null],
    [15, '2026-01-01 00:00:00', 140, 'completed', 14, null],
    [16, '2026-03-31 12:00:00', 150, 'completed', 15, null],
    [17, '2026-01-01 00:00:00', 160, 'completed', 16, null],
    [18, '2026-01-05 00:00:00', 161, 'completed', 16, null],
  ];
  for (let userId = 17; userId <= 28; userId += 1) {
    returns.push([userId + 10, '2026-02-10 12:00:00', userId * 10, 'completed', userId, null]);
  }
  const returnValues: unknown[] = [];
  const returnSql = returns.map(([id, date, amount, status, userId, deletedAt]) => {
    returnValues.push(id, date, amount, status, 1000 + userId, deletedAt);
    const i = returnValues.length - 5;
    return `($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`;
  });
  await db.query(
    `INSERT INTO returns (id, "date", amount, status, "orderId", "deletedAt") VALUES ${returnSql.join(',')}`,
    returnValues,
  );
});

describe('set-based money flow query equivalence', () => {
  it('matches the old correlated reinvestment and conversion query results', async () => {
    const actual = await loadMoneyFlow(q, RANGE, TODAY, NOW);
    const oldReinvestment = await oldReinvestmentReference(q);
    const oldConversion = await oldConversionReference(q);

    expect(actual.reinvest.total).toEqual(oldReinvestment.result.total);
    expect(actual.reinvest.confirmed).toEqual(oldReinvestment.result.confirmed);
    expect(actual.reinvest.estimated).toEqual(oldReinvestment.result.estimated);
    expect(actual.reinvest.estimated).toEqual({ count: 16, amount: 30600, investors: 16 });
    expect(actual.conversion).toMatchObject(oldConversion.result);
    expect(actual.conversion).toMatchObject({ paidInvestors: 25, r30: 17, r60: 20, r90: 21 });

    expect(oldReinvestment.linkedDepositIds.has(1)).toBe(true);
    expect(oldReinvestment.linkedDepositIds.has(2)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(3)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(4)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(5)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(6)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(7)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(8)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(9)).toBe(false);
    expect(oldReinvestment.linkedDepositIds.has(10)).toBe(true);
    expect(oldReinvestment.linkedDepositIds.has(18)).toBe(false);

    expect(oldConversion.byUser.get(10)).toMatchObject({ r30: true, r60: true, r90: true });
    expect(oldConversion.byUser.get(11)).toMatchObject({ r30: false, r60: true, r90: true });
    expect(oldConversion.byUser.get(12)).toMatchObject({ r30: false, r60: false, r90: true });
    expect(oldConversion.byUser.get(13)).toMatchObject({ r30: false, r60: false, r90: false });
    expect(oldConversion.byUser.get(14)).toMatchObject({ r30: false, r60: false, r90: false });
    expect(oldConversion.byUser.get(15)).toMatchObject({ r30: true, r60: true, r90: true });
    expect(oldConversion.byUser.get(16)).toMatchObject({ r30: true, r60: true, r90: true });
  });
});
