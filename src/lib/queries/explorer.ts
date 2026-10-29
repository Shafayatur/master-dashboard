import 'server-only';
import type { DateRange } from '@/lib/filters/dates';
import { parseFilters, type Filters, type Segment } from '@/lib/filters/schema';
import { dhakaTs } from '@/lib/time';
import { DEFAULT_THRESHOLDS } from './investors';
import { Params, pgTs, productPredicates, utcBounds, type QueryFn } from './sql-filters';
import { perInvestorCte, segmentCase } from './segment-sql';

export type ExplorerTable = 'deposits' | 'orders' | 'payouts' | 'investors';
export const EXPLORER_TABLES: ExplorerTable[] = ['deposits', 'orders', 'payouts', 'investors'];
export type CellKind = 'text' | 'int' | 'money' | 'date' | 'status';
export type CellValue = string | number | null;

export interface ExplorerColumn {
  key: string;
  label: string;
  kind: CellKind;
}
export interface ExplorerParams {
  table: ExplorerTable;
  range: DateRange;
  filters: Pick<Filters, 'products' | 'categories' | 'tenures' | 'returnTypes' | 'shariah' | 'paymentMethod'>;
  segments: Segment[];
  search: string;
  status: string[];
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
}
export interface ExplorerResult {
  table: ExplorerTable;
  columns: ExplorerColumn[];
  /** Every row also carries `userId` (the investor), for linking to the profile page. */
  rows: Record<string, CellValue>[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
}

export const PAGE_SIZE = 50;
export const EXPORT_MAX = 20_000;
const MAX_PAGE = 10_000;
const MAX_SEARCH = 64;

interface Col extends ExplorerColumn {
  sql: string;
}
interface TableDef {
  from: string;
  where: string[];
  dateCol: string;
  statusCol: string | null;
  statuses: string[];
  search: (like: string, exact: string) => string;
  columns: Col[];
  defaultSort: string;
}

const INVESTOR_JOIN = `JOIN "user" u ON u.id = o."userId" AND u."deletedAt" IS NULL AND u."userType"::text = 'investor'`;
const ORDER_JOIN = `JOIN "order" o ON o.id = X."orderId" AND o."deletedAt" IS NULL`;
const day = (col: string) => `to_char(${dhakaTs(col)}, 'YYYY-MM-DD')`;
const WHO = (key: string, sql: string, label: string): Col => ({ key, label, kind: 'text', sql });
const investorSegmentJoin = (nowTs: string, recent: string, cooling: string) => `LEFT JOIN (
  WITH sched AS (
    SELECT "orderId", MAX("paymentDate") AS last_pay FROM return_schedules WHERE "deletedAt" IS NULL GROUP BY 1
  ), ord AS (
    SELECT o."userId", o.status::text AS status,
      COALESCE(s.last_pay, o."investmentDate" + (split_part(p."productDuration"::text, ' ', 1)::int * interval '1 month')) AS maturity
    FROM "order" o JOIN products p ON p.id = o."productId" LEFT JOIN sched s ON s."orderId" = o.id
    WHERE o."deletedAt" IS NULL AND o.status::text IN ('invested','closed')
  ), ${perInvestorCte(nowTs)}
  SELECT per.user_id, ${segmentCase(nowTs, recent, cooling)} AS seg
  FROM per
) sg ON sg.user_id = u.id`;

/** Whitelist: only these tables, columns, sorts and statuses can ever reach the SQL. */
const TABLES: Record<ExplorerTable, TableDef> = {
  deposits: {
    from: `deposits d ${ORDER_JOIN.replace('X', 'd')} JOIN products p ON p.id = o."productId" ${INVESTOR_JOIN}`,
    where: [`d."deletedAt" IS NULL`],
    dateCol: 'd."date"',
    statusCol: 'd.status::text',
    statuses: ['approved', 'pending', 'rejected'],
    search: (l, e) => `(u.name ILIKE ${l} OR u.phone ILIKE ${l} OR u.email ILIKE ${l} OR u.id::text = ${e} OR o.id::text = ${e} OR d.id::text = ${e})`,
    defaultSort: 'date',
    columns: [
      { key: 'id', label: 'Deposit', kind: 'int', sql: 'd.id' },
      { key: 'date', label: 'Date', kind: 'date', sql: day('d."date"') },
      WHO('investor', `COALESCE(u.name, '')`, 'Investor'),
      WHO('phone', `COALESCE(u.phone, '')`, 'Phone'),
      WHO('project', 'p.name', 'Project'),
      { key: 'orderId', label: 'Order', kind: 'int', sql: 'o.id' },
      { key: 'amount', label: 'Amount', kind: 'money', sql: 'd.amount::float8' },
      WHO('method', `d."paymentMethod"::text`, 'Method'),
      { key: 'status', label: 'Status', kind: 'status', sql: 'd.status::text' },
    ],
  },
  orders: {
    from: `"order" o JOIN products p ON p.id = o."productId" ${INVESTOR_JOIN}`,
    where: [`o."deletedAt" IS NULL`],
    dateCol: 'o."createdAt"',
    statusCol: 'o.status::text',
    statuses: ['closed', 'cancelled', 'invested', 'booked', 'verifying'],
    search: (l, e) => `(u.name ILIKE ${l} OR u.phone ILIKE ${l} OR u.email ILIKE ${l} OR u.id::text = ${e} OR o.id::text = ${e})`,
    defaultSort: 'created',
    columns: [
      { key: 'id', label: 'Order', kind: 'int', sql: 'o.id' },
      { key: 'created', label: 'Booked', kind: 'date', sql: day('o."createdAt"') },
      { key: 'invested', label: 'Invested', kind: 'date', sql: day('o."investmentDate"') },
      WHO('investor', `COALESCE(u.name, '')`, 'Investor'),
      WHO('phone', `COALESCE(u.phone, '')`, 'Phone'),
      WHO('project', 'p.name', 'Project'),
      { key: 'tenure', label: 'Tenure (months)', kind: 'int', sql: `split_part(p."productDuration"::text, ' ', 1)::int` },
      { key: 'quantity', label: 'Quantity', kind: 'int', sql: 'o.quantity::int' },
      { key: 'amount', label: 'Amount', kind: 'money', sql: 'o."totalAmount"::float8' },
      { key: 'status', label: 'Status', kind: 'status', sql: 'o.status::text' },
    ],
  },
  payouts: {
    from: `returns r ${ORDER_JOIN.replace('X', 'r')} JOIN products p ON p.id = o."productId" ${INVESTOR_JOIN}`,
    where: [`r."deletedAt" IS NULL`],
    dateCol: 'r."date"',
    statusCol: 'r.status::text',
    statuses: ['completed', 'initiated'],
    search: (l, e) => `(u.name ILIKE ${l} OR u.phone ILIKE ${l} OR u.email ILIKE ${l} OR u.id::text = ${e} OR o.id::text = ${e} OR r.id::text = ${e})`,
    defaultSort: 'date',
    columns: [
      { key: 'id', label: 'Payout', kind: 'int', sql: 'r.id' },
      { key: 'date', label: 'Date', kind: 'date', sql: day('r."date"') },
      WHO('investor', `COALESCE(u.name, '')`, 'Investor'),
      WHO('phone', `COALESCE(u.phone, '')`, 'Phone'),
      { key: 'orderId', label: 'Order', kind: 'int', sql: 'o.id' },
      { key: 'amount', label: 'Amount', kind: 'money', sql: 'r.amount::float8' },
      WHO('method', `r."paymentMethod"::text`, 'Method'),
      { key: 'status', label: 'Status', kind: 'status', sql: 'r.status::text' },
    ],
  },
  investors: {
    from: '"user" u',
    where: [`u."deletedAt" IS NULL`, `u."userType"::text = 'investor'`],
    dateCol: 'u."createdAt"',
    statusCol: null,
    statuses: [],
    search: (l, e) => `(u.name ILIKE ${l} OR u.phone ILIKE ${l} OR u.email ILIKE ${l} OR u.id::text = ${e})`,
    defaultSort: 'registered',
    columns: [
      { key: 'id', label: 'Investor', kind: 'int', sql: 'u.id' },
      WHO('name', `COALESCE(u.name, '')`, 'Name'),
      WHO('phone', `COALESCE(u.phone, '')`, 'Phone'),
      WHO('email', `COALESCE(u.email, '')`, 'Email'),
      { key: 'registered', label: 'Registered', kind: 'date', sql: day('u."createdAt"') },
      {
        key: 'investments',
        label: 'Investments',
        kind: 'int',
        sql: `(SELECT COUNT(*)::int FROM "order" io WHERE io."userId" = u.id AND io."deletedAt" IS NULL AND io.status::text IN ('invested', 'closed'))`,
      },
      {
        key: 'lifetime',
        label: 'Lifetime value',
        kind: 'money',
        sql: `(SELECT COALESCE(SUM(d.amount), 0)::float8 FROM deposits d JOIN "order" io ON io.id = d."orderId" AND io."deletedAt" IS NULL WHERE io."userId" = u.id AND d."deletedAt" IS NULL AND d.status::text = 'approved')`,
      },
      WHO('segment', 'sg.seg', 'Segment'),
    ],
  },
};

type RawParams = Parameters<typeof parseFilters>[0];

export function parseExplorerParams(sp: RawParams, today: string): ExplorerParams {
  const get = (k: string): string => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : (sp as Record<string, string | string[] | undefined>)[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const t = get('t') as ExplorerTable;
  const table: ExplorerTable = EXPLORER_TABLES.includes(t) ? t : 'deposits';
  const def = TABLES[table];
  const parsedFilters = parseFilters(sp, today);
  const sortKey = get('sort');
  const sort = def.columns.some((c) => c.key === sortKey) ? sortKey : def.defaultSort;
  const page = Number.parseInt(get('page'), 10);
  return {
    table,
    range: parsedFilters.range,
    filters: {
      products: parsedFilters.products,
      categories: parsedFilters.categories,
      tenures: parsedFilters.tenures,
      returnTypes: parsedFilters.returnTypes,
      shariah: parsedFilters.shariah,
      paymentMethod: parsedFilters.paymentMethod,
    },
    segments: parsedFilters.segments,
    search: get('q').trim().slice(0, MAX_SEARCH),
    status: get('st').split(',').filter((s) => def.statuses.includes(s)),
    sort,
    dir: get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  };
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function build(params: ExplorerParams, now: Date) {
  const def = TABLES[params.table];
  const p = new Params();
  const from = params.table === 'investors'
    ? `"user" u ${investorSegmentJoin(
        `${p.add(pgTs(now))}::timestamp`,
        `${p.add(DEFAULT_THRESHOLDS.recentlyActiveDays)}::int`,
        `${p.add(DEFAULT_THRESHOLDS.coolingDays)}::int`,
      )}`
    : def.from;
  const { start, end } = utcBounds(params.range);
  const conds = [...def.where, `${def.dateCol} >= ${p.add(start)}::timestamp`, `${def.dateCol} < ${p.add(end)}::timestamp`];
  if (def.statusCol && params.status.length) conds.push(`${def.statusCol} = ANY(${p.add(params.status)}::text[])`);
  if (params.search.length >= 2) conds.push(def.search(p.add(`%${escapeLike(params.search)}%`), p.add(params.search)));
  if (params.table !== 'investors') {
    conds.push(...productPredicates({ ...params.filters, orderStatus: [] }, p));
    if (params.table === 'deposits' && params.filters.paymentMethod.length) {
      conds.push(`d."paymentMethod"::text = ANY(${p.add(params.filters.paymentMethod)}::text[])`);
    }
  } else if (params.segments.length) {
    conds.push(`sg.seg = ANY(${p.add(params.segments)}::text[])`);
  }
  const select = [...def.columns.map((c) => `${c.sql} AS "${c.key}"`), `${params.table === 'investors' ? 'u.id' : 'u.id'} AS "userId"`].join(',\n  ');
  const order = `"${params.sort}" ${params.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, "id" DESC`;
  return { def, p, select, order, from, where: conds.join('\n  AND ') };
}

function cells(def: TableDef, r: Record<string, unknown>): Record<string, CellValue> {
  const out: Record<string, CellValue> = { userId: Number(r.userId ?? 0) };
  for (const c of def.columns) {
    const v = r[c.key];
    out[c.key] = v === null || v === undefined ? null : c.kind === 'int' || c.kind === 'money' ? Number(v) : String(v);
  }
  return out;
}

export async function loadExplorer(q: QueryFn, params: ExplorerParams, now: Date = new Date()): Promise<ExplorerResult> {
  const b = build(params, now);
  const [countRow] = await q(`SELECT COUNT(*)::int AS n FROM ${b.from}\nWHERE ${b.where}`, b.p.values);
  const offset = (params.page - 1) * PAGE_SIZE;
  const rows = await q(
    `SELECT ${b.select}\nFROM ${b.from}\nWHERE ${b.where}\nORDER BY ${b.order}\nLIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    b.p.values,
  );
  return {
    table: params.table,
    columns: b.def.columns.map(({ key, label, kind }) => ({ key, label, kind })),
    rows: rows.map((r) => cells(b.def, r)),
    total: Number(countRow?.n ?? 0),
    page: params.page,
    pageSize: PAGE_SIZE,
    sort: params.sort,
    dir: params.dir,
  };
}

/** Same filters, no paging, capped at EXPORT_MAX rows. */
export async function exportExplorer(q: QueryFn, params: ExplorerParams, now: Date = new Date()): Promise<{ columns: ExplorerColumn[]; rows: Record<string, CellValue>[] }> {
  const b = build(params, now);
  const rows = await q(`SELECT ${b.select}\nFROM ${b.from}\nWHERE ${b.where}\nORDER BY ${b.order}\nLIMIT ${EXPORT_MAX}`, b.p.values);
  return { columns: b.def.columns.map(({ key, label, kind }) => ({ key, label, kind })), rows: rows.map((r) => cells(b.def, r)) };
}
