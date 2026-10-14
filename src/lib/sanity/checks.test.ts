import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '../sql/guard';
import { SANITY_CHECKS } from './checks';

/**
 * Runs every sanity query against an in-memory Postgres (PGlite) built from a structure-only
 * snapshot of the source schema, with a handful of synthetic rows. Catches typos, bad casts and
 * enum mismatches before the queries ever touch the real database.
 */
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, uuid, "createdAt", "updatedAt", "userType") VALUES
      (1, gen_random_uuid(), '2026-08-01 10:00', '2026-08-01 10:00', 'investor'),
      (2, gen_random_uuid(), '2026-09-01 10:00', '2026-09-01 10:00', 'investor'),
      (3, gen_random_uuid(), '2026-09-02 10:00', '2026-09-02 10:00', 'internal-staff');
    INSERT INTO products (id, uuid, "createdAt", "updatedAt", name, "productDuration", price, stock, "isActive", "isShariah") VALUES
      (1, gen_random_uuid(), now(), now(), 'Dairy A', '6 Months', 10000, 50, true, false);
    INSERT INTO "order" (id, uuid, "createdAt", "updatedAt", status, quantity, "totalAmount", "investmentDate", "userId", "productId") VALUES
      (1, gen_random_uuid(), now(), now(), 'invested', 1, 10000, '2026-09-10 08:00', 1, 1),
      (2, gen_random_uuid(), now(), now(), 'closed', 2, 20000, '2026-01-10 08:00', 2, 1),
      (3, gen_random_uuid(), now(), now(), 'cancelled', 1, 10000, '2026-09-11 08:00', 2, 1),
      (4, gen_random_uuid(), now(), now(), 'invested', 1, 10000, '2025-01-01 08:00', 1, 1);
    INSERT INTO deposits (id, uuid, "createdAt", "updatedAt", "date", amount, "paymentMethod", status, "orderId") VALUES
      (1, gen_random_uuid(), now(), now(), '2026-09-10 00:00', 10000, 'bank_deposit', 'approved', 1),
      (2, gen_random_uuid(), now(), now(), '2026-01-10 00:00', 20000, 'reinvest', 'approved', 2),
      (3, gen_random_uuid(), now(), now(), '2026-09-11 00:00', 10000, 'bank_deposit', 'pending', 3),
      (4, gen_random_uuid(), now(), now(), '2099-01-01 00:00', 10000, 'bank_deposit', 'approved', 1);
    INSERT INTO returns (id, uuid, "createdAt", "updatedAt", "date", amount, status, "orderId") VALUES
      (1, gen_random_uuid(), now(), now(), '2026-07-10 00:00', 500, 'completed', 2),
      (2, gen_random_uuid(), now(), now(), '2099-01-01 00:00', 500, 'initiated', 4);
    INSERT INTO return_schedules (id, uuid, "createdAt", "updatedAt", "installmentNumber", "totalInstallments", "paymentDate", "profitAmount", "principalAmount", "totalAmount", "orderId") VALUES
      (1, gen_random_uuid(), now(), now(), 1, 1, '2026-07-10 00:00', 500, 20000, 20500, 2);
  `);
});

describe('sanity report SQL', () => {
  it('has the 16 checks', () => expect(SANITY_CHECKS).toHaveLength(16));

  for (const check of SANITY_CHECKS) {
    it(`${check.title} passes the read-only guard and executes`, async () => {
      expect(() => assertReadOnlySql(check.sql)).not.toThrow();
      const res = await db.query(check.sql);
      expect(res.rows.length).toBeGreaterThan(0);
    });
  }
});

/** The synthetic rows above are shaped so each new check has a known right answer. */
describe('new checks return the expected values', () => {
  const run = async (n: number) => {
    const c = SANITY_CHECKS.find((x) => x.title.startsWith(`${n}.`))!;
    return (await db.query<Record<string, unknown>>(c.sql)).rows;
  };
  const num = (v: unknown) => Number(v);

  it('13 finds the future deposit and payout, and nothing dated today or earlier', async () => {
    const rows = await run(13);
    expect(rows.map((r) => r.tbl).sort()).toEqual(['deposits', 'returns']);
    for (const r of rows) {
      expect(num(r.n)).toBe(1);
      expect(num(r.days_ahead)).toBeGreaterThan(0);
    }
  });
  it('14 buckets the one overdue invested order by how late it is', async () => {
    const rows = await run(14);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ overdue_by: 'over 90 days' });
    expect(num(rows[0]!.orders)).toBe(1);
    expect(num(rows[0]!.with_initiated_payout)).toBe(1);
    expect(num(rows[0]!.with_any_completed_payout)).toBe(0);
  });
  it('15 computes the fill rate as sold / (sold + left)', async () => {
    const [r] = await run(15);
    expect(num(r!.units_left)).toBe(50);
    expect(num(r!.units_sold)).toBe(4); // orders 1, 2 and 4: invested or closed, 1 + 2 + 1 units
    expect(num(r!.pct_sold_if_stock_is_remaining)).toBe(7.4);
  });
  it('16 separates a negative gap from a normal one', async () => {
    const [r] = await run(16);
    expect(num(r!.investors)).toBe(2);
    expect(num(r!.converted)).toBe(2);
    expect(num(r!.negative_gap)).toBe(1); // investor 2 invested before their registration date
    expect(num(r!.d30_to_90)).toBe(1); // investor 1: about 40 days
  });
});
