import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildProjectInsights } from '@/lib/dashboard/project-insights';
import { parseFilters, type Filters } from '@/lib/filters/schema';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadProjects, projectRows } from './projects';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const filters = (qs = ''): Filters => parseFilters(new URLSearchParams(`p=custom&from=2026-10-01&to=2026-10-10&cmp=previous&${qs}`), '2026-10-14');
const NOW = new Date('2026-10-14T00:00:00Z');

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
      (1, 'invested', 10000, '2026-10-03', 1, 1), (2, 'invested', 20000, '2026-10-05', 2, 2),
      (3, 'invested', 4000, '2026-10-06', 3, 3), (5, 'closed', 3000, '2026-09-25', 3, 1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1, '2026-10-03', 10000, 'bank_deposit', 'approved', 1),
      (2, '2026-10-05', 20000, 'bank_deposit', 'approved', 2),
      (3, '2026-10-06',  4000, 'cash',         'approved', 3),
      (4, '2026-09-25',  3000, 'bank_deposit', 'approved', 5);
  `);
});

describe('projectRows', () => {
  it('ranks projects by value with ticket size and returning investors', async () => {
    const rows = await projectRows(q, filters(), filters().range);
    expect(rows.map((r) => [r.label, r.value, r.tenureMonths, r.returnType])).toEqual([
      ['Poultry B', 20000, 12, 'fixed'], ['Dairy A', 10000, 6, 'percentage'], ['Mixed C', 4000, 1, 'percentage'],
    ]);
    const mixed = rows.find((r) => r.key === '3');
    expect(mixed).toMatchObject({ investors: 1, returningInvestors: 1, returningShare: 100, avgTicket: 4000 }); // user 3 first invested on 25 Sep
    expect(rows.find((r) => r.key === '1')).toMatchObject({ returningInvestors: 0, returningShare: 0 });
  });
});

describe('loadProjects', () => {
  it('adds shares and comparison deltas for tenure and category', async () => {
    const d = await loadProjects(q, filters(), NOW);
    expect(d.total).toBe(34000);
    expect(d.scorecard[0]?.share).toBeCloseTo(58.82, 1);
    const six = d.tenure.find((t) => t.key === '6');
    expect(six).toMatchObject({ value: 10000, prevValue: 3000 });
    expect(six?.deltaPct).toBeCloseTo(233.33, 1);
    expect(d.tenure.find((t) => t.key === '12')).toMatchObject({ prevValue: 0, deltaPct: null }); // no base to compare to
    expect(d.category.find((c) => c.label === 'Dairy')).toMatchObject({ prevValue: 3000 });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('leaves comparison fields null when no comparison is selected', async () => {
    const none = parseFilters(new URLSearchParams('p=custom&from=2026-10-01&to=2026-10-10&cmp=none'), '2026-10-14');
    const d = await loadProjects(q, none, NOW);
    expect(d.compareRange).toBeNull();
    expect(d.tenure.every((t) => t.prevValue === null && t.deltaPct === null)).toBe(true);
  });
});

describe('buildProjectInsights', () => {
  it('names the preferred tenure, growth and concentration', async () => {
    const d = await loadProjects(q, filters(), NOW);
    const texts = buildProjectInsights(d, 'm').map((i) => i.text);
    expect(texts.some((t) => t.includes('projects attract the most investors'))).toBe(true);
    expect(texts.some((t) => t.includes('grew') && t.includes('Dairy'))).toBe(true);
    expect(texts.some((t) => t.includes('"Poultry B" alone drives 59%'))).toBe(true);
  });

  it('returns nothing for an empty period', async () => {
    const f = parseFilters(new URLSearchParams('p=custom&from=2025-01-01&to=2025-01-31&cmp=none'), '2026-10-14');
    expect(buildProjectInsights(await loadProjects(q, f, NOW), 'm')).toEqual([]);
  });
});
