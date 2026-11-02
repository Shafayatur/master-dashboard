import ExcelJS from 'exceljs';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cashFlowExport } from '@/lib/export/cash-flow';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadMoneyFlow } from './money-flow';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const TODAY = '2026-10-14';
const NOW = new Date('2026-10-14T00:00:00Z');
const RANGE = { from: '2026-10-01', to: TODAY };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, "userType", "deletedAt") VALUES
      (1, 'Investor', 'investor', NULL),
      (2, 'Other investor', 'investor', NULL),
      (3, 'Staff', 'internal-staff', NULL);
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Project', '6 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "userId", "productId", "deletedAt") VALUES
      (10, 'closed', 1000, '2026-01-01', 1, 1, NULL),
      (11, 'closed', 1000, '2026-01-01', 1, 1, NULL),
      (12, 'closed', 1000, '2026-01-01', 2, 1, NULL),
      (13, 'closed', 1000, '2026-01-01', 1, 1, '2026-01-02'),
      (14, 'closed', 1000, '2026-01-01', 3, 1, NULL);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId", "deletedAt") VALUES
      (10, '2026-03-15', 250, 'bank_deposit', 'approved', 10, NULL),
      (1, '2026-09-20', 1000, 'bank_deposit', 'approved', 10, NULL),
      (2, '2026-10-10', 2000, 'bank_deposit', 'approved', 10, NULL),
      (3, '2026-09-30 20:00', 3000, 'reinvest', 'approved', 11, NULL),
      (4, '2026-09-21', 900, 'bank_deposit', 'pending', 10, NULL),
      (5, '2026-09-22', 800, 'bank_deposit', 'rejected', 10, NULL),
      (6, '2026-09-23', 7000, 'bank_deposit', 'approved', 10, '2026-09-24'),
      (7, '2026-09-24', 10000, 'bank_deposit', 'approved', 13, NULL),
      (8, '2026-09-25', 11000, 'bank_deposit', 'approved', 14, NULL),
      (9, '2026-10-15', 4000, 'bank_deposit', 'approved', 10, NULL);
    INSERT INTO returns (id, "date", amount, status, "orderId", "deletedAt") VALUES
      (10, '2026-03-15', 50, 'completed', 10, NULL),
      (1, '2026-09-20', 400, 'completed', 10, NULL),
      (2, '2026-10-12', 600, 'completed', 11, NULL),
      (3, '2026-09-21', 700, 'initiated', 10, NULL),
      (4, '2026-09-22', 9000, 'completed', 13, NULL),
      (5, '2026-09-23', 10000, 'completed', 14, NULL),
      (6, '2026-10-15', 5000, 'completed', 10, NULL);
  `);
});

describe('cash flow by month', () => {
  it('counts only eligible transactions, zero-fills months, and reconciles completed payouts', async () => {
    const data = await loadMoneyFlow(q, RANGE, TODAY, NOW);
    expect(data.cashFlowByMonth).toHaveLength(8);
    expect(data.cashFlowByMonth[0]?.month).toBe('2026-03-01');
    expect(data.cashFlowByMonth.at(-1)?.month).toBe('2026-10-01');
    for (const month of data.cashFlowByMonth.filter((entry) => entry.month >= '2026-04-01' && entry.month <= '2026-08-01')) {
      expect(month).toEqual({
      month: month.month,
      moneyIn: 0,
      reinvest: 0,
      moneyOut: 0,
      net: 0,
      });
    }
    expect(data.cashFlowByMonth.find((month) => month.month === '2026-03-01')).toEqual({
      month: '2026-03-01',
      moneyIn: 250,
      reinvest: 0,
      moneyOut: 50,
      net: 200,
    });
    expect(data.cashFlowByMonth.find((month) => month.month === '2026-09-01')).toEqual({
      month: '2026-09-01',
      moneyIn: 1000,
      reinvest: 0,
      moneyOut: 400,
      net: 600,
    });
    expect(data.cashFlowByMonth.find((month) => month.month === '2026-10-01')).toEqual({
      month: '2026-10-01',
      moneyIn: 5000,
      reinvest: 3000,
      moneyOut: 600,
      net: 4400,
    });
    for (const month of data.cashFlowByMonth) {
      expect(month.moneyOut).toBe(
        data.payoutsByMonth.find((payout) => payout.month === month.month)?.completed.amount ?? 0,
      );
    }

    const csv = cashFlowExport(data.cashFlowByMonth).toCsv();
    expect(csv.split('\r\n')[0]).toBe(
      '\uFEFFMonth,Money in,Of which reinvest,Money out,Net',
    );
    expect(csv).toContain('Total,6250,3000,1050,5200');
  });

  it('keeps exported amounts numeric in Excel', async () => {
    const data = await loadMoneyFlow(q, RANGE, TODAY, NOW);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await cashFlowExport(data.cashFlowByMonth).toXlsx() as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0]!;
    expect(worksheet.getRow(1).values).toMatchObject([
      undefined,
      'Month',
      'Money in',
      'Of which reinvest',
      'Money out',
      'Net',
    ]);
    expect(worksheet.getRow(9).getCell(1).value).toBe('2026-10-01');
    expect(worksheet.getRow(9).getCell(2).value).toBe(5000);
    expect(worksheet.getRow(9).getCell(3).value).toBe(3000);
    expect(worksheet.getRow(10).getCell(1).value).toBe('Total');
    expect(worksheet.getRow(10).getCell(2).value).toBe(6250);
  });
});
