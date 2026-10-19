import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listExport, listToCsv } from '@/lib/export/action-list-csv';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { loadActionLists } from './action-lists';
import type { QueryFn } from './sql-filters';

let db: PGlite;
const q: QueryFn = async (sql, params = []) => {
  assertReadOnlySql(sql);
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
};
const NOW = new Date('2026-10-14T00:00:00Z');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), 'db/fixtures/schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO "user" (id, name, phone, email, "createdAt", "userType") VALUES
      (1,'User One','01711000001','u1@example.com','2026-01-01','investor'), (2,'User Two','01711000002','u2@example.com','2026-01-01','investor'),
      (3,'User Three','01711000003',NULL,'2026-01-01','investor'), (4,'User Four','+8801711000004','u4@example.com','2026-01-01','investor'),
      (5,'User Five','01711000005','u5@example.com','2026-01-01','investor'), (6,'User Six','01711000006','u6@example.com','2026-01-01','investor'),
      (7,'User Seven','01711000007','u7@example.com','2026-01-01','investor'), (8,'User Eight','01711000008','u8@example.com','2026-01-01','investor'),
      (9,'User Nine','+8801700000009','u9@example.com','2026-01-01','investor'), (10,'Staff','01700000010','s@example.com','2026-01-01','internal-staff');
    INSERT INTO products (id, name, "productDuration") VALUES (1, 'Dairy A', '6 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "createdAt", "userId", "productId") VALUES
      (1,'invested',15000,'2026-04-20','2026-04-20',1,1), (2,'invested',8000,'2026-04-01','2026-04-01',2,1), (3,'invested',9000,'2026-05-30','2026-05-30',3,1),
      (4,'closed',100000,'2026-03-01','2026-03-01',4,1), (5,'closed',20000,'2026-03-10','2026-03-10',5,1), (6,'closed',5000,'2026-04-05','2026-04-05',6,1),
      (7,'closed',7000,'2026-01-01','2026-01-01',7,1), (8,'closed',6000,'2026-03-05','2026-03-05',8,1), (9,'invested',6000,'2026-09-01','2026-09-01',8,1),
      (10,'booked',12000,NULL,'2026-10-01',9,1), (11,'verifying',3000,NULL,'2026-10-12',9,1), (12,'booked',4000,NULL,'2026-09-01',10,1);
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES (1, 1, '2026-10-20');
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1,'2026-03-01',500000,'bank_deposit','approved',4), (2,'2026-03-10',20000,'bank_deposit','approved',5),
      (3,'2026-10-10',7000,'bank_deposit','pending',10), (4,'2026-10-10',999,'bank_deposit','pending',12);
  `);
});

describe('loadActionLists', () => {
  it('maturing: running investments due within the window, plus recently overdue ones, soonest first', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    expect(d.maturing.rows.map((r) => [r.orderId, r.maturity, r.daysLeft])).toEqual([[2, '2026-10-01', -13], [1, '2026-10-20', 6]]);
    expect(d.maturing.total).toBe(2);
    expect(d.maturing.amount).toBe(23000);
    expect(d.maturing.rows[1]).toMatchObject({ name: 'User One', phone: '01711000001', project: 'Dairy A', amount: 15000, investments: 1 });
  });
  it('maturing window is adjustable', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 7, limit: 50 });
    expect(d.maturing.rows.map((r) => r.orderId)).toEqual([2, 1]);
    const none = await loadActionLists(q, NOW, { maturingDays: 3, limit: 50 });
    expect(none.maturing.rows.map((r) => r.orderId)).toEqual([2]);
  });
  it('cooling: last project matured 30-60 days ago, nothing running, richest first', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    expect(d.cooling.rows.map((r) => [r.userId, r.daysSince, r.lifetimeValue])).toEqual([[4, 43, 500000], [5, 34, 20000]]);
    expect(d.cooling.rows[0]).toMatchObject({ lastProject: 'Dairy A', lastMaturity: '2026-09-01' });
    expect(d.cooling.total).toBe(2);
    expect(d.cooling.amount).toBe(520000); // user 8 (also matured 39 days ago) is excluded: they have a running project
  });
  it('stuck bookings: open more than 3 days, investors only', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    expect(d.stuck.rows.map((r) => [r.orderId, r.status, r.daysOpen, r.amount])).toEqual([[10, 'booked', 13, 12000]]);
  });
  it('pending deposits: oldest first, staff excluded', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    expect(d.pending.rows).toEqual([expect.objectContaining({ depositId: 3, orderId: 10, amount: 7000, method: 'bank_deposit', date: '2026-10-10', daysWaiting: 4, phone: '+8801700000009' })]);
    expect(d.pending.total).toBe(1);
  });
  it('keeps the true total when the row limit cuts the list', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 1 });
    expect(d.maturing.rows).toHaveLength(1);
    expect(d.maturing.total).toBe(2);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
  it('builds a call-sheet CSV per list', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    const csv = listToCsv('cooling', d);
    expect(csv.split('\r\n')[0]).toBe('\uFEFFName,Phone,Email,Last project,Matured on,Days since,Lifetime value,Investments');
    expect(csv).toContain('User Four,+8801711000004,u4@example.com,Dairy A,2026-09-01,43,500000,1');
    expect(listToCsv('pending', d)).toContain('User Nine,+8801700000009,u9@example.com,7000,bank_deposit,2026-10-10,4');
  });
  it('builds an Excel call sheet with real numbers and text phone numbers', async () => {
    const d = await loadActionLists(q, NOW, { maturingDays: 14, limit: 50 });
    const buf = await listExport('pending', d).toXlsx();
    const wb = new (await import('exceljs')).default.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.name).toBe('Pending deposits');
    expect(ws.getRow(2).getCell(2).value).toBe('+8801700000009');
    expect(ws.getRow(2).getCell(4).value).toBe(7000);
  });
});
