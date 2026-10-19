import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '@/lib/sql/guard';
import { escapeLike, investorProfile, searchInvestors } from './investor-profile';
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
    INSERT INTO "user" (id, name, phone, email, "createdAt", "userType", "isEmailVerified", "isPhoneVerified") VALUES
      (1,'Ayesha Rahman','+8801711000001','ayesha@example.com','2026-01-05','investor',TRUE,FALSE),
      (2,'Karim Rahman','01711000002','karim@example.com','2026-01-06','investor',TRUE,TRUE),
      (3,'Salma Akter','01711000003','salma@example.com','2026-02-01','investor',FALSE,FALSE),
      (4,'Rafi 100%','01711000004','rafi@example.com','2026-02-02','investor',FALSE,FALSE),
      (5,'Staff Rahman','01711000005','staff@example.com','2026-02-03','internal-staff',TRUE,TRUE);
    INSERT INTO products (id, name, "productDuration") VALUES (1,'Dairy A','6 Months'), (2,'Poultry B','12 Months');
    INSERT INTO "order" (id, status, "totalAmount", "investmentDate", "createdAt", "userId", "productId") VALUES
      (1,'invested',10000,'2026-04-20','2026-04-19',1,1), (2,'closed',5000,'2025-08-01','2025-07-30',1,2),
      (3,'closed',8000,'2026-03-01','2026-02-28',2,1), (4,'cancelled',3000,'2026-09-01','2026-09-01',4,1);
    INSERT INTO return_schedules (id, "orderId", "paymentDate") VALUES (1,1,'2026-10-20');
    INSERT INTO deposits (id, "date", amount, "paymentMethod", status, "orderId") VALUES
      (1,'2026-04-20',10000,'bank_deposit','approved',1), (2,'2025-08-01',5000,'reinvest','approved',2), (3,'2026-04-21',700,'bank_deposit','pending',1),
      (4,'2026-03-01',8000,'bank_deposit','approved',3);
    INSERT INTO returns (id, "date", amount, status, "orderId") VALUES (1,'2026-02-01',300,'completed',2), (2,'2026-10-12',100,'initiated',1);
  `);
});

describe('escapeLike', () => {
  it('escapes wildcards and backslashes', () => expect(escapeLike('100%_a\\')).toBe('100\\%\\_a\\\\'));
});

describe('searchInvestors', () => {
  it('finds by name, phone, email and exact id; never returns staff', async () => {
    expect((await searchInvestors(q, 'rahman')).map((h) => h.userId)).toEqual([1, 2]);
    expect((await searchInvestors(q, '0002')).map((h) => h.userId)).toEqual([2]);
    expect((await searchInvestors(q, 'salma@')).map((h) => h.userId)).toEqual([3]);
    expect((await searchInvestors(q, '3')).map((h) => h.userId)).toEqual([]); // under the minimum length
    expect((await searchInvestors(q, '03')).map((h) => h.userId)).toEqual([3]);
  });
  it('puts names that start with the term first', async () => {
    expect((await searchInvestors(q, 'karim')).map((h) => h.userId)).toEqual([2]);
    expect((await searchInvestors(q, 'ra')).map((h) => h.userId)).toEqual([4, 1, 2]);
  });
  it('treats % and _ literally, and ignores short or blank terms', async () => {
    expect((await searchInvestors(q, '100%')).map((h) => h.userId)).toEqual([4]);
    expect(await searchInvestors(q, 'a%')).toEqual([]);
    expect(await searchInvestors(q, '  ')).toEqual([]);
    expect(await searchInvestors(q, '')).toEqual([]);
  });
});

describe('investorProfile', () => {
  it('builds the full profile for an active investor', async () => {
    const p = await investorProfile(q, 1, NOW);
    expect(p).toMatchObject({
      name: 'Ayesha Rahman', registered: '2026-01-05', emailVerified: true, phoneVerified: false, segment: 'active',
      lifetimeValue: 15000, approvedDeposits: 2, firstInvestment: '2025-08-01', lastInvestment: '2026-04-20',
      reinvestDeposits: 1, reinvestAmount: 5000, totalPaidOut: 300, preferredTenureMonths: 6,
    });
    expect(p?.nextMaturity).toEqual({ orderId: 1, project: 'Dairy A', amount: 10000, date: '2026-10-20', daysLeft: 6 });
    expect(p?.orders.map((o) => [o.orderId, o.status, o.maturity])).toEqual([[1, 'invested', '2026-10-20'], [2, 'closed', '2026-08-01']]);
    expect(p?.deposits.map((d) => [d.depositId, d.status])).toEqual([[3, 'pending'], [1, 'approved'], [2, 'approved']]); // newest first
    expect(p?.payouts.map((x) => x.status)).toEqual(['initiated', 'completed']);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
  it('classifies by how long ago the last closed project matured', async () => {
    expect((await investorProfile(q, 2, NOW))?.segment).toBe('cooling'); // 1 Mar + 6 months = 1 Sep, 43 days before the test date
    expect((await investorProfile(q, 2, new Date('2026-12-01T00:00:00Z')))?.segment).toBe('inactive'); // 91 days
    expect((await investorProfile(q, 2, new Date('2026-09-20T00:00:00Z')))?.segment).toBe('recently_active'); // 19 days
  });
  it('handles investors without investments', async () => {
    const p = await investorProfile(q, 3, NOW);
    expect(p).toMatchObject({ segment: 'prospect', lifetimeValue: 0, nextMaturity: null, preferredTenureMonths: null, firstInvestment: null });
    expect((await investorProfile(q, 4, NOW))?.segment).toBe('prospect'); // a cancelled order is not an investment
  });
  it('returns null for staff and unknown ids', async () => {
    expect(await investorProfile(q, 5, NOW)).toBeNull();
    expect(await investorProfile(q, 999, NOW)).toBeNull();
  });
});
