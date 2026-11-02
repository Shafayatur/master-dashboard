import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { investmentDepthExport } from '@/lib/export/investment-depth';
import { assertReadOnlySql } from '@/lib/sql/guard';
import {
  investmentDepth,
  listInvestmentDepth,
  parseInvestmentDepthBucket,
} from './investment-depth';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, phone, email, "userType", "deletedAt") VALUES
      (1, 'One investment', '01700000001', 'one@example.com', 'investor', NULL),
      (2, 'Two investments', '01700000002', 'two@example.com', 'investor', NULL),
      (3, 'Three investments', '01700000003', 'three@example.com', 'investor', NULL),
      (4, 'Five investments', '01700000004', 'five@example.com', 'investor', NULL),
      (5, 'Booked only', '01700000005', 'booked@example.com', 'investor', NULL),
      (6, 'Live and deleted', '01700000006', 'live@example.com', 'investor', NULL),
      (7, 'Closed only', '01700000007', 'closed@example.com', 'investor', NULL),
      (8, 'Not an investor', '01700000008', 'staff@example.com', 'internal-staff', NULL),
      (9, 'Deleted user', '01700000009', 'deleted@example.com', 'investor', '2026-01-01');
    INSERT INTO "order" (id, status, "investmentDate", "userId", "deletedAt") VALUES
      (101, 'invested', '2026-01-01 12:00', 1, NULL),
      (201, 'invested', '2026-01-01 12:00', 2, NULL),
      (202, 'closed', '2026-02-01 12:00', 2, NULL),
      (301, 'invested', '2026-01-01 12:00', 3, NULL),
      (302, 'invested', '2026-02-01 12:00', 3, NULL),
      (303, 'closed', '2026-03-01 12:00', 3, NULL),
      (401, 'invested', '2026-01-01 20:00', 4, NULL),
      (402, 'invested', '2026-01-02 20:00', 4, NULL),
      (403, 'invested', '2026-01-03 20:00', 4, NULL),
      (404, 'invested', '2026-01-04 20:00', 4, NULL),
      (405, 'closed', '2026-01-05 20:00', 4, NULL),
      (501, 'booked', '2026-01-01 12:00', 5, NULL),
      (601, 'invested', '2026-01-01 12:00', 6, NULL),
      (602, 'closed', '2026-01-02 12:00', 6, '2026-01-03'),
      (701, 'closed', '2026-01-01 12:00', 7, NULL),
      (801, 'invested', '2026-01-01 12:00', 8, NULL),
      (901, 'invested', '2026-01-01 12:00', 9, NULL);
    INSERT INTO deposits (id, amount, status, "orderId", "deletedAt") VALUES
      (1, 300, 'approved', 101, NULL),
      (2, 100, 'approved', 201, NULL),
      (3, 50, 'approved', 202, NULL),
      (4, 100, 'approved', 301, NULL),
      (5, 100, 'approved', 302, NULL),
      (6, 100, 'approved', 303, NULL),
      (7, 80, 'approved', 401, NULL),
      (8, 80, 'approved', 402, NULL),
      (9, 80, 'approved', 403, NULL),
      (10, 80, 'approved', 404, NULL),
      (11, 80, 'approved', 405, NULL),
      (12, 1200, 'approved', 601, NULL),
      (13, 5000, 'approved', 602, NULL),
      (14, 600, 'approved', 701, NULL);
  `);
});

describe('investment depth', () => {
  it('counts live investors by qualifying investment orders and calculates shares', async () => {
    const data = await investmentDepth(q);
    expect(data.total).toBe(6);
    expect(data.buckets.map(({ key, investors }) => [key, investors])).toEqual([
      ['1', 3],
      ['2', 1],
      ['3', 1],
      ['4plus', 1],
    ]);
    expect(data.buckets[0]?.share).toBe(50);
    data.buckets.slice(1).forEach(({ share }) => expect(share).toBeCloseTo(100 / 6));
    expect(data.buckets.reduce((sum, bucket) => sum + bucket.share, 0)).toBeCloseTo(100);
    expect(data.singleInvestors).toBe(3);
    expect(data.multipleInvestors).toBe(3);
  });

  it('exports the correct rows for each bucket and all investors in the required order', async () => {
    const depth = await investmentDepth(q);
    for (const bucket of depth.buckets) {
      expect((await listInvestmentDepth(q, bucket.key)).length).toBe(bucket.investors);
    }

    const rows = await listInvestmentDepth(q, 'all');
    expect(rows).toHaveLength(depth.total);
    expect(rows.map((row) => row.userId)).toEqual([4, 3, 2, 6, 7, 1]);
    expect(rows[3]).toMatchObject({
      userId: 6,
      investments: 1,
      lifetimeValue: 1200,
      firstInvestmentDate: '2026-01-01',
      latestInvestmentDate: '2026-01-01',
    });
    expect(rows[0]).toMatchObject({
      userId: 4,
      investments: 5,
      firstInvestmentDate: '2026-01-02',
      latestInvestmentDate: '2026-01-06',
    });

    const csv = investmentDepthExport(rows).toCsv();
    expect(csv.split('\r\n')[0]).toBe(
      '\uFEFFUser ID,Name,Phone,Email,Investments,Lifetime value,First investment date,Latest investment date',
    );
    expect(csv).toContain('01700000004');
  });

  it('parses only supported bucket names for route validation', () => {
    expect(['all', '1', '2', '3', '4plus'].map(parseInvestmentDepthBucket)).toEqual([
      'all',
      '1',
      '2',
      '3',
      '4plus',
    ]);
    expect(parseInvestmentDepthBucket('unknown')).toBeNull();
    expect(parseInvestmentDepthBucket(null)).toBeNull();
  });
});
