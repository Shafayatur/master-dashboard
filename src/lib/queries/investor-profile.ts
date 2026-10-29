import 'server-only';
import { DEFAULT_THRESHOLDS, type SegmentKey } from './investors';
import { pgTs, type QueryFn, type Row } from './sql-filters';
import { perInvestorCte, segmentCase } from './segment-sql';

export interface InvestorHit {
  userId: number;
  name: string;
  phone: string;
  email: string;
  orderId: number | null;
}
export interface ProfileOrder {
  orderId: number;
  project: string;
  status: string;
  amount: number;
  created: string;
  investmentDate: string | null;
  /** Dhaka date. Only for invested and closed orders. */
  maturity: string | null;
  tenureMonths: number;
}
export interface ProfileDeposit {
  depositId: number;
  orderId: number;
  date: string;
  amount: number;
  method: string;
  status: string;
}
export interface ProfilePayout {
  payoutId: number;
  orderId: number;
  date: string;
  amount: number;
  status: string;
}
export interface InvestorProfile extends Omit<InvestorHit, 'orderId'> {
  generatedAt: string;
  registered: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  segment: SegmentKey;
  lifetimeValue: number;
  approvedDeposits: number;
  firstInvestment: string | null;
  lastInvestment: string | null;
  reinvestDeposits: number;
  reinvestAmount: number;
  totalPaidOut: number;
  preferredTenureMonths: number | null;
  nextMaturity: { orderId: number; project: string; amount: number; date: string; daysLeft: number } | null;
  orders: ProfileOrder[];
  deposits: ProfileDeposit[];
  payouts: ProfilePayout[];
}

const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? '');
const dhaka = (col: string) => `to_char(${col} + interval '6 hours', 'YYYY-MM-DD')`;
const INVESTOR = `u."deletedAt" IS NULL AND u."userType"::text = 'investor'`;
const LIST_LIMIT = 200;
export const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 64;

/** Escapes LIKE wildcards so "100%" is searched literally. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchInvestors(q: QueryFn, term: string, limit = 8): Promise<InvestorHit[]> {
  const t = term.trim().slice(0, MAX_SEARCH_LENGTH).replace(/^#/, '');
  if (t.length < MIN_SEARCH_LENGTH) return [];
  const like = `%${escapeLike(t)}%`;
  const rows = await q(
    `SELECT u.id AS user_id, COALESCE(u.name,'') AS name, COALESCE(u.phone,'') AS phone, COALESCE(u.email,'') AS email,
  (SELECT ox.id FROM "order" ox WHERE ox."userId" = u.id AND ox."deletedAt" IS NULL AND ox.id::text = $2 LIMIT 1) AS order_id
FROM "user" u
WHERE ${INVESTOR} AND (u.name ILIKE $1 OR u.phone ILIKE $1 OR u.email ILIKE $1 OR u.id::text = $2
  OR EXISTS (SELECT 1 FROM "order" ox WHERE ox."userId" = u.id AND ox."deletedAt" IS NULL AND ox.id::text = $2))
ORDER BY (EXISTS (SELECT 1 FROM "order" oy WHERE oy."userId" = u.id AND oy."deletedAt" IS NULL AND oy.id::text = $2)) DESC,
  (u.name ILIKE $3) DESC, u.name ASC, u.id ASC LIMIT $4::int`,
    [like, t, `${escapeLike(t)}%`, Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((r) => ({
    userId: num(r.user_id),
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    orderId: r.order_id == null ? null : num(r.order_id),
  }));
}

const ORD = (userParam: string) => `sched AS (
  SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
), ord AS (
  SELECT o.id AS order_id, o."userId", o.status::text AS status, o."totalAmount" AS amount, p.name AS project,
    COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
  FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
  WHERE o."deletedAt" IS NULL AND o."userId" = ${userParam} AND o.status::text IN ('invested', 'closed')
)`;

/** Everything the profile page shows, or null when the id is not a real investor. */
export async function investorProfile(q: QueryFn, userId: number, now: Date): Promise<InvestorProfile | null> {
  const nowTs = pgTs(now);
  const { recentlyActiveDays, coolingDays } = DEFAULT_THRESHOLDS;
  const segmentNow = '$2::timestamp';
  const recent = '$3::int';
  const cooling = '$4::int';
  const [who] = await q(
    `SELECT u.id AS user_id, COALESCE(u.name, '') AS name, COALESCE(u.phone, '') AS phone, COALESCE(u.email, '') AS email,
  ${dhaka('u."createdAt"')} AS registered, COALESCE(u."isEmailVerified", FALSE) AS email_ok, COALESCE(u."isPhoneVerified", FALSE) AS phone_ok
FROM "user" u WHERE u.id = $1::int AND ${INVESTOR}`,
    [userId],
  );
  if (!who) return null;

  const [seg, next, stats, tenure, paid, orders, deposits, payouts] = await Promise.all([
    q(
      `WITH ${ORD('$1::int')}, ${perInvestorCte(segmentNow)}
SELECT ${segmentCase(segmentNow, recent, cooling)} AS seg FROM per WHERE per.user_id = $1::int`,
      [userId, nowTs, recentlyActiveDays, coolingDays],
    ),
    q(
      `WITH ${ORD('$1::int')}
SELECT order_id, project, amount::float8 AS amount, ${dhaka('maturity')} AS date,
  FLOOR(EXTRACT(EPOCH FROM (maturity - $2::timestamp)) / 86400)::int AS days_left
FROM ord WHERE status = 'invested' ORDER BY maturity ASC LIMIT 1`,
      [userId, nowTs],
    ),
    q(
      `SELECT COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'approved'), 0)::float8 AS ltv,
  COUNT(*) FILTER (WHERE d.status::text = 'approved')::int AS n,
  ${dhaka('MIN(d."date") FILTER (WHERE d.status::text = \'approved\')')} AS first_inv,
  ${dhaka('MAX(d."date") FILTER (WHERE d.status::text = \'approved\')')} AS last_inv,
  COUNT(*) FILTER (WHERE d.status::text = 'approved' AND d."paymentMethod"::text = 'reinvest')::int AS re_n,
  COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'approved' AND d."paymentMethod"::text = 'reinvest'), 0)::float8 AS re_amt
FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL AND o."userId" = $1::int WHERE d."deletedAt" IS NULL`,
      [userId],
    ),
    q(
      `SELECT split_part(p."productDuration"::text, ' ', 1)::int AS months, SUM(d.amount)::float8 AS v
FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL AND o."userId" = $1::int
JOIN products p ON p.id = o."productId" WHERE d."deletedAt" IS NULL AND d.status::text = 'approved'
GROUP BY 1 ORDER BY v DESC, months ASC LIMIT 1`,
      [userId],
    ),
    q(
      `SELECT COALESCE(SUM(r.amount) FILTER (WHERE r.status::text = 'completed'), 0)::float8 AS paid
FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL AND o."userId" = $1::int WHERE r."deletedAt" IS NULL`,
      [userId],
    ),
    q(
      `WITH sched AS (SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1)
SELECT o.id AS order_id, p.name AS project, o.status::text AS status, o."totalAmount"::float8 AS amount,
  ${dhaka('o."createdAt"')} AS created, ${dhaka('o."investmentDate"')} AS investment_date,
  CASE WHEN o.status::text IN ('invested', 'closed')
    THEN ${dhaka(`COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month'))`)} END AS maturity,
  split_part(p."productDuration"::text, ' ', 1)::int AS months
FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
WHERE o."deletedAt" IS NULL AND o."userId" = $1::int ORDER BY o."createdAt" DESC, o.id DESC LIMIT ${LIST_LIMIT}`,
      [userId],
    ),
    q(
      `SELECT d.id AS deposit_id, d."orderId" AS order_id, ${dhaka('d."date"')} AS date, d.amount::float8 AS amount,
  d."paymentMethod"::text AS method, d.status::text AS status
FROM deposits d JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL AND o."userId" = $1::int
WHERE d."deletedAt" IS NULL ORDER BY d."date" DESC, d.id DESC LIMIT ${LIST_LIMIT}`,
      [userId],
    ),
    q(
      `SELECT r.id AS payout_id, r."orderId" AS order_id, ${dhaka('r."date"')} AS date, r.amount::float8 AS amount, r.status::text AS status
FROM returns r JOIN "order" o ON o.id = r."orderId" AND o."deletedAt" IS NULL AND o."userId" = $1::int
WHERE r."deletedAt" IS NULL ORDER BY r."date" DESC, r.id DESC LIMIT ${LIST_LIMIT}`,
      [userId],
    ),
  ]);

  const s = stats[0];
  const n = next[0];
  return {
    generatedAt: now.toISOString(),
    userId: num(who.user_id),
    name: str(who.name),
    phone: str(who.phone),
    email: str(who.email),
    registered: str(who.registered),
    emailVerified: who.email_ok === true,
    phoneVerified: who.phone_ok === true,
    segment: str(seg[0]?.seg || 'prospect') as SegmentKey,
    lifetimeValue: num(s?.ltv),
    approvedDeposits: num(s?.n),
    firstInvestment: s?.first_inv ? str(s.first_inv) : null,
    lastInvestment: s?.last_inv ? str(s.last_inv) : null,
    reinvestDeposits: num(s?.re_n),
    reinvestAmount: num(s?.re_amt),
    totalPaidOut: num(paid[0]?.paid),
    preferredTenureMonths: tenure[0] ? num(tenure[0].months) : null,
    nextMaturity: n ? { orderId: num(n.order_id), project: str(n.project), amount: num(n.amount), date: str(n.date), daysLeft: num(n.days_left) } : null,
    orders: orders.map((r: Row): ProfileOrder => ({
      orderId: num(r.order_id), project: str(r.project), status: str(r.status), amount: num(r.amount), created: str(r.created),
      investmentDate: r.investment_date ? str(r.investment_date) : null, maturity: r.maturity ? str(r.maturity) : null, tenureMonths: num(r.months),
    })),
    deposits: deposits.map((r: Row): ProfileDeposit => ({
      depositId: num(r.deposit_id), orderId: num(r.order_id), date: str(r.date), amount: num(r.amount), method: str(r.method), status: str(r.status),
    })),
    payouts: payouts.map((r: Row): ProfilePayout => ({
      payoutId: num(r.payout_id), orderId: num(r.order_id), date: str(r.date), amount: num(r.amount), status: str(r.status),
    })),
  };
}
