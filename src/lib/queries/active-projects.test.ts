import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadActiveProjects } from './active-projects';
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
    INSERT INTO "user" (id, "userType") VALUES
      (1, 'investor'), (2, 'investor'), (3, 'investor'), (4, 'internal-staff');
    INSERT INTO products (id, name, "productDuration", "productReturnType", price, stock, "isActive", "deletedAt") VALUES
      (1, 'Open project', '6 Months', 'percentage', 1000, 4, TRUE, NULL),
      (2, 'Fully funded project', '12 Months', 'fixed', 2500, 0, TRUE, NULL),
      (3, 'Running project', '3 Months', 'percentage-range', 1500, 3, FALSE, NULL),
      (4, 'Inactive without running orders', '1 Month', 'fixed', 500, 8, FALSE, NULL),
      (5, 'Deleted project', '6 Months', 'percentage', 2000, 2, TRUE, '2026-10-01'),
      (6, 'Staff only project', '6 Months', 'percentage', 2000, 2, FALSE, NULL);
    INSERT INTO "order" (id, status, quantity, "totalAmount", "investmentDate", "createdAt", "userId", "productId", "deletedAt") VALUES
      (1, 'invested', 3, 2700, '2026-02-01', '2026-02-01', 1, 1, NULL),
      (2, 'invested', 2, 2000, '2026-03-01', '2026-03-01', 2, 1, NULL),
      (3, 'closed', 2, 5000, '2026-01-01', '2026-01-01', 1, 2, NULL),
      (4, 'invested', 1, 1200, '2026-04-01', '2026-04-01', 3, 3, NULL),
      (5, 'invested', 7, 7000, '2026-05-01', '2026-05-01', 4, 1, NULL),
      (6, 'invested', 9, 9000, '2026-05-01', '2026-05-01', 4, 6, NULL);
    INSERT INTO return_schedules ("orderId", "paymentDate", "deletedAt") VALUES
      (1, '2026-10-10', NULL), (2, '2026-09-10', NULL), (2, '2026-08-01', '2026-08-02');
  `);
});

describe('loadActiveProjects', () => {
  it('includes open, fully funded, and running projects with snapshot metrics', async () => {
    const projects = await loadActiveProjects(q);
    expect(projects.map((project) => [project.projectId, project.status])).toEqual([
      [1, 'open'], [3, 'running'], [2, 'fully_funded'],
    ]);
    expect(projects[0]).toMatchObject({
      name: 'Open project',
      tenureMonths: 6,
      returnType: 'percentage',
      unitPrice: 1000,
      unitsLeft: 4,
      unitsSold: 5,
      fundedPct: (5 / 9) * 100,
      isActive: true,
      runningOrders: 2,
      runningAmount: 4700,
      runningInvestors: 2,
      nextMaturity: '2026-09-10',
    });
    expect(projects.find((project) => project.projectId === 3)).toMatchObject({
      unitsLeft: 3,
      unitsSold: 1,
      fundedPct: 25,
      runningOrders: 1,
      runningAmount: 1200,
      runningInvestors: 1,
      nextMaturity: '2026-07-01',
    });
    expect(projects.find((project) => project.projectId === 2)).toMatchObject({
      unitsSold: 2,
      fundedPct: 100,
      runningOrders: 0,
      runningAmount: 0,
      runningInvestors: 0,
      nextMaturity: null,
    });
  });

  it('excludes inactive projects without running orders, deleted projects, and staff orders', async () => {
    const projects = await loadActiveProjects(q);
    expect(projects.some((project) => project.projectId === 4)).toBe(false);
    expect(projects.some((project) => project.projectId === 5)).toBe(false);
    expect(projects.some((project) => project.projectId === 6)).toBe(false);
    expect(projects.find((project) => project.projectId === 1)).toMatchObject({
      unitsSold: 5,
      runningOrders: 2,
      runningAmount: 4700,
      runningInvestors: 2,
    });
  });
});
