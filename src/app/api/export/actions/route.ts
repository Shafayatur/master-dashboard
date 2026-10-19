import { requireSessionApi } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { listExport } from '@/lib/export/action-list-csv';
import { EXPORT_LIMIT, LIST_KEYS, loadActionLists, type ListKey } from '@/lib/queries/action-lists';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GET /api/export/actions?list=maturing|cooling|stuck|pending&days=14&fmt=csv|xlsx  ->  call sheet. */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const list = url.searchParams.get('list') as ListKey | null;
  if (!list || !LIST_KEYS.includes(list)) return Response.json({ error: 'unknown list' }, { status: 400 });
  const days = Math.min(60, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '14', 10) || 14));
  const fmt = url.searchParams.get('fmt') === 'xlsx' ? 'xlsx' : 'csv';

  const data = await loadActionLists((sql, params) => querySource<Row>(sql, params), new Date(), { maturingDays: days, limit: EXPORT_LIMIT });
  const out = listExport(list, data);
  const body = fmt === 'xlsx' ? new Uint8Array(await out.toXlsx()) : out.toCsv();

  try {
    await queryConfig('INSERT INTO export_log (tab, format, filters, row_count) VALUES ($1, $2, $3::jsonb, $4)', ['actions', fmt, JSON.stringify({ list, days }), out.rowCount]);
  } catch (e) {
    console.error('[export] could not write the export log:', (e as Error).message);
  }

  return new Response(body, {
    headers: {
      'content-type': fmt === 'xlsx' ? XLSX_TYPE : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${list}-${todayDhaka()}.${fmt}"`,
      'cache-control': 'no-store',
    },
  });
}
