import 'server-only';
import { DEFAULT_THRESHOLDS } from './investors';
import { STUCK_BOOKING_DAYS } from './overview';
import { pgTs, type QueryFn, type Row } from './sql-filters';

export type ListKey = 'maturing' | 'cooling' | 'stuck' | 'pending';
export const LIST_KEYS: ListKey[] = ['maturing', 'cooling', 'stuck', 'pending'];

export interface Contact {
  userId: number;
  name: string;
  phone: string;
  email: string;
}
export interface MaturingRow extends Contact {
  orderId: number;
  project: string;
  amount: number;
  /** Maturity date in Dhaka time, YYYY-MM-DD. */
  maturity: string;
  /** Negative = already past maturity but the order is still marked invested. */
  daysLeft: number;
  lifetimeValue: number;
  investments: number;
}
export interface CoolingRow extends Contact {
  lastProject: string;
  lastMaturity: string;
  daysSince: number;
  lifetimeValue: number;
  investments: number;
}
export interface StuckRow extends Contact {
  orderId: number;
  project: string;
  status: string;
  amount: number;
  created: string;
  daysOpen: number;
}
export interface PendingRow extends Contact {
  depositId: number;
  orderId: number;
  amount: number;
  method: string;
  date: string;
  daysWaiting: number;
}
/** `total` and `amount` cover the whole list even when `rows` is cut at the limit. */
export interface ListResult<T> {
  total: number;
  amount: number;
  rows: T[];
}
export interface ActionListsData {
  generatedAt: string;
  maturingDays: number;
  maturing: ListResult<MaturingRow>;
  cooling: ListResult<CoolingRow>;
  stuck: ListResult<StuckRow>;
  pending: ListResult<PendingRow>;
}

export const SCREEN_LIMIT = 200;
export const EXPORT_LIMIT = 5000;
/** Past-maturity orders that are still marked invested are listed for this many days. */
const OVERDUE_DAYS = 30;

const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? '');
const contact = (r: Row): Contact => ({ userId: num(r.user_id), name: str(r.name), phone: str(r.phone), email: str(r.email) });
const result = <T>(rows: Row[], map: (r: Row) => T): ListResult<T> => ({
  total: num(rows[0]?.total),
  amount: num(rows[0]?.total_amount),
  rows: rows.map(map),
});

const WHO = `u.id AS user_id, COALESCE(u.name, '') AS name, COALESCE(u.phone, '') AS phone, COALESCE(u.email, '') AS email`;
const INVESTOR = `u."deletedAt" IS NULL AND u."userType"::text = 'investor'`;
const DAYS = (a: string, b: string) => `FLOOR(EXTRACT(EPOCH FROM (${a} - ${b})) / 86400)::int`;

/** Investments with their maturity (last scheduled payout, else investment date + duration). */
const ORD = `sched AS (
  SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
), ord AS (
  SELECT o.id AS order_id, o."userId", o.status::text AS status, o."totalAmount" AS amount, p.name AS project,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o.status::text IN ('invested', 'closed')
), ltv AS (
  SELECT o."userId", SUM(d.amount) AS ltv FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  WHERE d."deletedAt" IS NULL AND d.status::text = 'approved' GROUP BY o."userId"
), cnt AS (SELECT "userId", COUNT(*)::int AS n FROM ord GROUP BY "userId")`;

async function maturing(q: QueryFn, now: string, days: number, limit: number) {
  const rows = await q(
    `WITH ${ORD}
SELECT ord.order_id, ${WHO}, ord.project, ord.amount::float8 AS amount,
  to_char(ord.maturity + interval '6 hours', 'YYYY-MM-DD') AS maturity,
  ${DAYS('ord.maturity', '$1::timestamp')} AS days_left,
  COALESCE(l.ltv, 0)::float8 AS ltv, COALESCE(c.n, 0)::int AS investments,
  COUNT(*) OVER ()::int AS total, SUM(ord.amount) OVER ()::float8 AS total_amount
FROM ord JOIN "user" u ON u.id = ord."userId" AND ${INVESTOR}
LEFT JOIN ltv l ON l."userId" = ord."userId" LEFT JOIN cnt c ON c."userId" = ord."userId"
WHERE ord.status = 'invested'
  AND ord.maturity >= $1::timestamp - ($2::int * interval '1 day') AND ord.maturity < $1::timestamp + ($3::int * interval '1 day')
ORDER BY ord.maturity ASC LIMIT $4::int`,
    [now, OVERDUE_DAYS, days, limit],
  );
  return result(rows, (r): MaturingRow => ({
    ...contact(r), orderId: num(r.order_id), project: str(r.project), amount: num(r.amount), maturity: str(r.maturity),
    daysLeft: num(r.days_left), lifetimeValue: num(r.ltv), investments: num(r.investments),
  }));
}

async function cooling(q: QueryFn, now: string, limit: number) {
  const { recentlyActiveDays, coolingDays } = DEFAULT_THRESHOLDS;
  const rows = await q(
    `WITH ${ORD}, active AS (SELECT DISTINCT "userId" FROM ord WHERE status = 'invested' AND maturity >= $1::timestamp),
lc AS (SELECT DISTINCT ON ("userId") "userId", maturity, project FROM ord
  WHERE status = 'closed' OR maturity < $1::timestamp ORDER BY "userId", maturity DESC)
SELECT ${WHO}, lc.project AS last_project, to_char(lc.maturity + interval '6 hours', 'YYYY-MM-DD') AS last_maturity,
  ${DAYS('$1::timestamp', 'lc.maturity')} AS days_since,
  COALESCE(l.ltv, 0)::float8 AS ltv, COALESCE(c.n, 0)::int AS investments,
  COUNT(*) OVER ()::int AS total, SUM(COALESCE(l.ltv, 0)) OVER ()::float8 AS total_amount
FROM lc JOIN "user" u ON u.id = lc."userId" AND ${INVESTOR}
LEFT JOIN ltv l ON l."userId" = lc."userId" LEFT JOIN cnt c ON c."userId" = lc."userId"
WHERE NOT EXISTS (SELECT 1 FROM active a WHERE a."userId" = lc."userId")
  AND lc.maturity < $1::timestamp - ($2::int * interval '1 day') AND lc.maturity >= $1::timestamp - ($3::int * interval '1 day')
ORDER BY COALESCE(l.ltv, 0) DESC LIMIT $4::int`,
    [now, recentlyActiveDays, coolingDays, limit],
  );
  return result(rows, (r): CoolingRow => ({
    ...contact(r), lastProject: str(r.last_project), lastMaturity: str(r.last_maturity), daysSince: num(r.days_since),
    lifetimeValue: num(r.ltv), investments: num(r.investments),
  }));
}

async function stuck(q: QueryFn, now: string, limit: number) {
  const rows = await q(
    `SELECT o.id AS order_id, ${WHO}, p.name AS project, o.status::text AS status, o."totalAmount"::float8 AS amount,
  to_char(o."createdAt" + interval '6 hours', 'YYYY-MM-DD') AS created, ${DAYS('$1::timestamp', 'o."createdAt"')} AS days_open,
  COUNT(*) OVER ()::int AS total, SUM(o."totalAmount") OVER ()::float8 AS total_amount
FROM "order" o JOIN products p ON p.id = o."productId" JOIN "user" u ON u.id = o."userId" AND ${INVESTOR}
WHERE o."deletedAt" IS NULL AND o.status::text IN ('booked', 'verifying') AND o."createdAt" < $1::timestamp - ($2::int * interval '1 day')
ORDER BY o."createdAt" ASC LIMIT $3::int`,
    [now, STUCK_BOOKING_DAYS, limit],
  );
  return result(rows, (r): StuckRow => ({
    ...contact(r), orderId: num(r.order_id), project: str(r.project), status: str(r.status), amount: num(r.amount),
    created: str(r.created), daysOpen: num(r.days_open),
  }));
}

async function pending(q: QueryFn, now: string, limit: number) {
  const rows = await q(
    `SELECT d.id AS deposit_id, o.id AS order_id, ${WHO}, d.amount::float8 AS amount, d."paymentMethod"::text AS method,
  to_char(d."date" + interval '6 hours', 'YYYY-MM-DD') AS date, ${DAYS('$1::timestamp', 'd."date"')} AS days_waiting,
  COUNT(*) OVER ()::int AS total, SUM(d.amount) OVER ()::float8 AS total_amount
FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL JOIN "user" u ON u.id = o."userId" AND ${INVESTOR}
WHERE d."deletedAt" IS NULL AND d.status::text = 'pending'
ORDER BY d."date" ASC LIMIT $2::int`,
    [now, limit],
  );
  return result(rows, (r): PendingRow => ({
    ...contact(r), depositId: num(r.deposit_id), orderId: num(r.order_id), amount: num(r.amount), method: str(r.method),
    date: str(r.date), daysWaiting: num(r.days_waiting),
  }));
}

export async function loadActionLists(q: QueryFn, now: Date, opts: { maturingDays: number; limit: number }): Promise<ActionListsData> {
  const t = pgTs(now);
  const [m, c, s, p] = await Promise.all([maturing(q, t, opts.maturingDays, opts.limit), cooling(q, t, opts.limit), stuck(q, t, opts.limit), pending(q, t, opts.limit)]);
  return { generatedAt: now.toISOString(), maturingDays: opts.maturingDays, maturing: m, cooling: c, stuck: s, pending: p };
}
