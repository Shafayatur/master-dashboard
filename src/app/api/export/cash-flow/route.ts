import { requireSessionApi } from '@/lib/auth/require-session';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';
import { cashFlowExport } from '@/lib/export/cash-flow';
import { cashFlowByMonth } from '@/lib/queries/money-flow';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** GET /api/export/cash-flow?fmt=csv|xlsx */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const fmt = new URL(req.url).searchParams.get('fmt') === 'xlsx' ? 'xlsx' : 'csv';
  const today = todayDhaka();
  const months = await cashFlowByMonth((sql, params) => querySource<Row>(sql, params), today);
  const out = cashFlowExport(months);
  const body = fmt === 'xlsx' ? new Uint8Array(await out.toXlsx()) : out.toCsv();

  try {
    await queryConfig(
      'INSERT INTO export_log (tab, format, filters, row_count) VALUES ($1, $2, $3::jsonb, $4)',
      ['cash-flow', fmt, JSON.stringify({}), out.rowCount],
    );
  } catch (e) {
    console.error('[export] could not write the export log:', (e as Error).message);
  }

  return new Response(body, {
    headers: {
      'content-type': fmt === 'xlsx' ? XLSX_TYPE : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cash-flow-${today}.${fmt}"`,
      'cache-control': 'no-store',
    },
  });
}
