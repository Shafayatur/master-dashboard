import { requireSessionApi } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { investmentDepthExport } from '@/lib/export/investment-depth';
import { EXPORT_LIMIT } from '@/lib/queries/action-lists';
import { listInvestmentDepth, parseInvestmentDepthBucket } from '@/lib/queries/investment-depth';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GET /api/export/investment-depth?bucket=all|1|2|3|4plus&fmt=csv|xlsx */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const bucket = parseInvestmentDepthBucket(url.searchParams.get('bucket'));
  if (!bucket) return Response.json({ error: 'unknown bucket' }, { status: 400 });
  const fmt = url.searchParams.get('fmt') === 'xlsx' ? 'xlsx' : 'csv';

  const rows = await listInvestmentDepth(
    (sql, params) => querySource<Row>(sql, params),
    bucket,
    EXPORT_LIMIT,
  );
  const out = investmentDepthExport(rows);
  const body = fmt === 'xlsx' ? new Uint8Array(await out.toXlsx()) : out.toCsv();

  try {
    await queryConfig(
      'INSERT INTO export_log (tab, format, filters, row_count) VALUES ($1, $2, $3::jsonb, $4)',
      ['investment-depth', fmt, JSON.stringify({ bucket }), out.rowCount],
    );
  } catch (e) {
    console.error('[export] could not write the export log:', (e as Error).message);
  }

  return new Response(body, {
    headers: {
      'content-type': fmt === 'xlsx' ? XLSX_TYPE : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="investment-depth-${bucket}-${todayDhaka()}.${fmt}"`,
      'cache-control': 'no-store',
    },
  });
}
