import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { deleteTarget, loadTargetsOverview, upsertTarget } from './targets';
import type { QueryFn } from './sql-filters';

let src: PGlite;
let cfg: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await src.query(sql, params)).rows as Record<string, unknown>[];
};
const cq: QueryFn = async (sql, params = []) => (await cfg.query(sql, params)).rows as Record<string, unknown>[];
const NOW = new Date('2026-10-14T00:00:00Z');
const TODAY = '2026-10-14';

beforeAll(async () => {
  src = new PGlite();
  await src.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await src.exec(`
    INSERT INTO "user" (id, "createdAt", "userType") VALUES (1,'2026-01-01','investor'), (2,'2026-01-01','internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'A', '6 Months');
    INSERT INTO "order" (id, status, "userId", "productId") VALUES (1,'invested',1,1), (2,'invested',2,1);
    INSERT INTO deposits (id, "date", amount, status, "orderId") VALUES
      (1,'2026-09-05',30000,'approved',1), (2,'2026-09-20',3000,'approved',1), (3,'2026-09-21',9999,'pending',1),
      (4,'2026-10-03',20000,'approved',1), (5,'2026-10-04',77777,'approved',2),
      (6,'2026-09-30 19:00',1000,'approved',1);
  `);
  cfg = new PGlite();
  await cfg.exec(readFileSync(path.join(process.cwd(), 'db/config/001_init.sql'), 'utf8'));
});

describe('targets', () => {
  it('upsert inserts, then updates the same month', async () => {
    await upsertTarget(cq, '2026-09-01', 40000, 'Sept push');
    await upsertTarget(cq, '2026-09-01', 50000, null);
    const rows = await cq(`SELECT to_char(month,'YYYY-MM-DD') AS month, target_amount::float8 AS t, note FROM monthly_targets`);
    expect(rows).toEqual([{ month: '2026-09-01', t: 50000, note: null }]);
  });

  it('the database refuses a month that is not the first day', async () => {
    await expect(upsertTarget(cq, '2026-09-15', 1, null)).rejects.toThrow();
  });

  it('overview joins targets with approved investor sales per Dhaka month', async () => {
    await upsertTarget(cq, '2026-12-01', 99000, 'Year end');
    const o = await loadTargetsOverview(q, cq, TODAY, NOW);
    expect(o.rows).toHaveLength(14);
    expect(o.rows[0]).toMatchObject({ month: '2026-12-01', target: 99000, note: 'Year end', actual: 0, isFuture: true });
    const oct = o.rows.find((r) => r.month === '2026-10-01');
    expect(oct).toMatchObject({ target: null, pct: null, isCurrent: true, actual: 21000 }); // 20000 + 1000 (Dhaka 1 Oct); staff deposit and pending excluded
    const sep = o.rows.find((r) => r.month === '2026-09-01');
    expect(sep).toMatchObject({ target: 50000, actual: 33000 });
    expect(sep?.pct).toBeCloseTo(66);
    expect(o.rows.at(-1)?.month).toBe('2025-11-01');
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });

  it('delete removes the target', async () => {
    await deleteTarget(cq, '2026-12-01');
    const o = await loadTargetsOverview(q, cq, TODAY, NOW);
    expect(o.rows[0]?.target).toBeNull();
  });
});
