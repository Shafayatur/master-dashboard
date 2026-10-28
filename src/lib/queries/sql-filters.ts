import 'server-only';
import type { DateRange } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import { dhakaRangeToUtc } from '@/lib/time';

export type Row = Record<string, unknown>;
export type QueryFn = (sql: string, params?: unknown[]) => Promise<Row[]>;

/** Collects bind parameters and hands out `$n` placeholders. */
export class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/**
 * UTC text for a `timestamp without time zone` comparison. Never bind a JS Date there: node-postgres
 * serialises it in the process timezone with an offset, which a timestamp-without-tz column silently drops.
 */
export const pgTs = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ');

/** Inclusive Dhaka date range -> half-open UTC bounds as pg timestamp text. */
export function utcBounds(r: DateRange): { start: string; end: string } {
  const { start, endExclusive } = dhakaRangeToUtc(r.from, r.to);
  return { start: pgTs(start), end: pgTs(endExclusive) };
}

/** Real investors only (staff/admin accounts excluded). */
export const investorJoin = (userKey: string, alias = 'u'): string =>
  `JOIN "user" ${alias} ON ${alias}.id = ${userKey} AND ${alias}."deletedAt" IS NULL AND ${alias}."userType"::text = 'investor'`;

/** Filters that describe the product/order (aliases: o = "order", p = products). */
export function productPredicates(
  f: Pick<Filters, 'products' | 'categories' | 'tenures' | 'returnTypes' | 'shariah' | 'orderStatus'>,
  p: Params,
): string[] {
  const out: string[] = [];
  if (f.products.length) out.push(`o."productId" = ANY(${p.add(f.products)}::int[])`);
  if (f.categories.length) {
    out.push(
      `EXISTS (SELECT 1 FROM category_products cp WHERE cp."productsId" = p.id AND cp."categoriesId" = ANY(${p.add(f.categories)}::int[]))`,
    );
  }
  if (f.tenures.length) out.push(`split_part(p."productDuration"::text, ' ', 1)::int = ANY(${p.add(f.tenures)}::int[])`);
  if (f.returnTypes.length) out.push(`p."productReturnType"::text = ANY(${p.add(f.returnTypes)}::text[])`);
  if (f.shariah !== 'all') out.push(`p."isShariah" = ${f.shariah === 'yes' ? 'TRUE' : 'FALSE'}`);
  if (f.orderStatus.length) out.push(`o.status::text = ANY(${p.add(f.orderStatus)}::text[])`);
  return out;
}

const FIRST_DEPOSIT = (materialized: boolean): string => `first_dep AS ${materialized ? 'MATERIALIZED ' : ''}(
  SELECT o2."userId", MIN(d2."date") AS first_dep
  FROM deposits d2 JOIN "order" o2 ON o2.id = d2."orderId"
  WHERE d2."deletedAt" IS NULL AND o2."deletedAt" IS NULL AND d2.status::text = 'approved'
  GROUP BY o2."userId"
)`;

export interface SalesBase {
  /** CTE list (without the leading WITH) defining `first_dep` and `base`. */
  cte: string;
  /** Placeholders of the range start / end bounds. */
  s: string;
  e: string;
}

export interface SalesBaseOptions {
  materializeFirstDeposit?: boolean;
  /** Omit for caller-managed FULL JOINs, avoiding misestimated nested-loop CTE rescans. */
  joinFirstDeposit?: boolean;
}

/**
 * Deposits in a Dhaka date range, joined to order, product and investor, with every dashboard filter applied.
 * `plain` = approved deposits only and no other filter (used for the monthly target).
 * Columns of `base`: dep_id, amount, payment_method, "orderId", dep_date and "userId"; `first_dep` is optional.
 */
export function salesBase(f: Filters, r: DateRange, p: Params, plain = false, options: SalesBaseOptions = {}): SalesBase {
  const { start, end } = utcBounds(r);
  const s = `${p.add(start)}::timestamp`;
  const e = `${p.add(end)}::timestamp`;
  const joinFirstDeposit = options.joinFirstDeposit ?? true;
  const preds = [`d."deletedAt" IS NULL`, `d."date" >= ${s}`, `d."date" < ${e}`];
  if (plain) {
    preds.push(`d.status::text = 'approved'`);
  } else {
    preds.push(`d.status::text = ANY(${p.add(f.depositStatus)}::text[])`);
    if (f.paymentMethod.length) preds.push(`d."paymentMethod"::text = ANY(${p.add(f.paymentMethod)}::text[])`);
    if (f.excludeReinvest) preds.push(`d."paymentMethod"::text <> 'reinvest'`);
    preds.push(...productPredicates(f, p));
    if (joinFirstDeposit && f.investorKind === 'new') preds.push(`fd.first_dep >= ${s} AND fd.first_dep < ${e}`);
    if (joinFirstDeposit && f.investorKind === 'old') preds.push(`fd.first_dep < ${s}`);
  }
  const cte = `${FIRST_DEPOSIT(options.materializeFirstDeposit || (!plain && f.investorKind !== 'all'))},
base AS (
  SELECT d.id AS dep_id, d.amount, d."paymentMethod"::text AS payment_method, d."orderId", d."date" AS dep_date, o."userId"${joinFirstDeposit ? ', fd.first_dep' : ''}
  FROM deposits d
  JOIN "order" o ON o.id = d."orderId" AND o."deletedAt" IS NULL
  JOIN products p ON p.id = o."productId"
  ${investorJoin('o."userId"')}
  ${joinFirstDeposit ? 'LEFT JOIN first_dep fd ON fd."userId" = o."userId"' : ''}
  WHERE ${preds.join('\n    AND ')}
)`;
  return { cte, s, e };
}
