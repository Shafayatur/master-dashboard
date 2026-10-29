import { requireSessionApi } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { toCsv, type Column } from '@/lib/export/csv';
import { exportExplorer, parseExplorerParams, type CellValue } from '@/lib/queries/explorer';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GET /api/export/explorer?t=deposits&q=...&st=...&from=...&to=...&fmt=csv|xlsx  ->  the filtered table (max 20,000 rows). */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const now = new Date();
  const today = todayDhaka(now);
  const params = parseExplorerParams(url.searchParams, today);
  const fmt = url.searchParams.get('fmt') === 'xlsx' ? 'xlsx' : 'csv';
  const { columns, rows } = await exportExplorer((sql, p) => querySource<Row>(sql, p), params, now);

  const cols: Column<Record<string, CellValue>>[] = columns.map((c) => ({
    header: c.label,
    value: (r) => r[c.key] ?? '',
    kind: c.kind === 'status' ? 'text' : c.kind,
  }));
  const body = fmt === 'xlsx' ? new Uint8Array(await (await import('@/lib/export/xlsx')).toXlsx(params.table, cols, rows)) : toCsv(cols, rows);

  try {
    await queryConfig('INSERT INTO export_log (tab, format, filters, row_count) VALUES ($1, $2, $3::jsonb, $4)', [
      'explorer',
      fmt,
      JSON.stringify({
        table: params.table,
        range: params.range,
        search: params.search,
        status: params.status,
        filters: params.filters,
        segments: params.segments,
      }),
      rows.length,
    ]);
  } catch (e) {
    console.error('[export] could not write the export log:', (e as Error).message);
  }

  return new Response(body, {
    headers: {
      'content-type': fmt === 'xlsx' ? XLSX_TYPE : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${params.table}-${today}.${fmt}"`,
      'cache-control': 'no-store',
    },
  });
}
