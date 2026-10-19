import { requireSessionApi } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { toCsv } from '@/lib/export/csv';
import { exportExplorer, parseExplorerParams } from '@/lib/queries/explorer';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** GET /api/export/explorer?t=deposits&q=...&st=...&from=...&to=...  ->  CSV of the filtered table (max 20,000 rows). */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const today = todayDhaka();
  const params = parseExplorerParams(new URL(req.url).searchParams, today);
  const { columns, rows } = await exportExplorer((sql, p) => querySource<Row>(sql, p), params);
  const csv = toCsv(
    columns.map((c) => ({ header: c.label, value: (r: Record<string, string | number | null>) => r[c.key] ?? '' })),
    rows,
  );

  try {
    await queryConfig('INSERT INTO export_log (tab, format, filters, row_count) VALUES ($1, $2, $3::jsonb, $4)', [
      'explorer',
      'csv',
      JSON.stringify({ table: params.table, range: params.range, search: params.search, status: params.status }),
      rows.length,
    ]);
  } catch (e) {
    console.error('[export] could not write the export log:', (e as Error).message);
  }

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${params.table}-${today}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
