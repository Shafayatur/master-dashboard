import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { exportExplorer, loadExplorer, parseExplorerParams, type ExplorerParams } from './explorer';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const TODAY = '2026-10-14';
const params = (qs: string): ExplorerParams => parseExplorerParams(new URLSearchParams(`p=custom&from=2026-10-01&to=2026-10-10&cmp=none&${qs}`), TODAY);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, phone, email, "createdAt", "userType") VALUES
      (1,'Ayesha Rahman','01711000001','a@example.com','2026-10-02','investor'), (2,'Karim 100%','01711000002','k@example.com','2026-10-05','investor'),
      (3,'Old Timer','01711000003','o@example.com','2026-01-05','investor'), (4,'Staff','01711000004','s@example.com','2026-10-03','internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1,'Dairy A','6 Months'), (2,'Poultry B','12 Months');
    INSERT INTO "order" (id, status, quantity, "totalAmount", "investmentDate", "createdAt", "userId", "productId") VALUES
      (1,'invested',1,10000,'2026-10-03','2026-10-03',1,1), (2,'invested',2,20000,'2026-10-05','2026-10-05',2,2),
      (3,'closed',1,5000,'2026-01-10','2026-01-10',3,1), (4,'booked',1,7000,NULL,'2026-10-06',1,1), (5,'invested',1,999,'2026-10-04','2026-10-04',4,1);
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1,'2026-10-03',10000,'bank_deposit','approved',1), (2,'2026-10-05',20000,'reinvest','approved',2), (3,'2026-10-06',7000,'bank_deposit','pending',4),
      (4,'2026-01-10',5000,'cash','approved',3), (5,'2026-10-04',999,'cash','approved',5), (6,'2026-10-10 20:00',50,'cash','approved',1);
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES (1,'2026-10-07',300,'completed',3), (2,'2026-10-08',100,'initiated',1);
  `);
});

describe('parseExplorerParams', () => {
  it('falls back safely on junk input', () => {
    const p = parseExplorerParams(new URLSearchParams('t=users;drop&sort=password&dir=sideways&page=-4&st=approved,bogus&q=' + 'x'.repeat(200)), TODAY);
    expect(p).toMatchObject({ table: 'deposits', sort: 'date', dir: 'desc', page: 1, status: ['approved'] });
    expect(p.search).toHaveLength(64);
  });
  it('accepts a valid table, sort and direction', () => {
    expect(params('t=orders&sort=amount&dir=asc&page=3')).toMatchObject({ table: 'orders', sort: 'amount', dir: 'asc', page: 3 });
  });
});

describe('loadExplorer', () => {
  it('deposits: date range in Dhaka time, investors only, newest first', async () => {
    const r = await loadExplorer(q, params('t=deposits'));
    expect(r.total).toBe(3); // #1, #2, #3. #4 is January, #5 belongs to staff, #6 is Dhaka 11 Oct
    expect(r.rows.map((x) => x.id)).toEqual([3, 2, 1]);
    expect(r.rows[2]).toMatchObject({ date: '2026-10-03', investor: 'Ayesha Rahman', amount: 10000, method: 'bank_deposit', status: 'approved', userId: 1 });
    expect(r.columns.map((c) => c.key)).toEqual(['id', 'date', 'investor', 'phone', 'project', 'orderId', 'amount', 'method', 'status']);
  });
  it('status filter, sorting and search', async () => {
    expect((await loadExplorer(q, params('t=deposits&st=pending'))).rows.map((x) => x.id)).toEqual([3]);
    expect((await loadExplorer(q, params('t=deposits&sort=amount&dir=asc'))).rows.map((x) => x.amount)).toEqual([7000, 10000, 20000]);
    expect((await loadExplorer(q, params('t=deposits&q=ayesha'))).rows.map((x) => x.id)).toEqual([3, 1]);
    expect((await loadExplorer(q, params('t=deposits&q=100%25'))).rows.map((x) => x.id)).toEqual([2]); // literal "100%"
    expect((await loadExplorer(q, params('t=deposits&q=%25'))).total).toBe(3); // a lone % is too short to search, so no filter
  });
  it('orders, payouts and investors', async () => {
    const o = await loadExplorer(q, params('t=orders&sort=amount'));
    expect(o.rows.map((x) => x.id)).toEqual([2, 1, 4]); // 20000, 10000, 7000
    expect(o.rows[0]).toMatchObject({ tenure: 12, quantity: 2, status: 'invested' });
    expect((await loadExplorer(q, params('t=payouts'))).rows.map((x) => [x.id, x.status])).toEqual([[2, 'initiated'], [1, 'completed']]);
    const inv = await loadExplorer(q, params('t=investors&sort=lifetime'));
    expect(inv.rows.map((x) => [x.id, x.lifetime, x.investments])).toEqual([[2, 20000, 1], [1, 10050, 1]]);
  });
  it('paginates and reports the true total', async () => {
    const r = await loadExplorer(q, params('t=deposits&page=2'));
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(3);
    expect(r.page).toBe(2);
  });
  it('is plain JSON', async () => {
    const r = await loadExplorer(q, params('t=investors'));
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('exportExplorer', () => {
  it('returns all filtered rows with labelled columns', async () => {
    const e = await exportExplorer(q, params('t=deposits&st=approved'));
    expect(e.rows.map((x) => x.id)).toEqual([2, 1]);
    expect(e.columns[0]).toEqual({ key: 'id', label: 'Deposit', kind: 'int' });
  });
});
