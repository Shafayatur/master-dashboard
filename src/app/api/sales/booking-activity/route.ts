import { parseFilters } from '@/lib/filters/schema';
import { requireSessionApi } from '@/lib/auth/require-session';
import { querySource } from '@/lib/db/source';
import { bookingActivity, parseBookingView, resolveBookingAnchor } from '@/lib/queries/tabs-extra';
import type { Row } from '@/lib/queries/sql-filters';
import { todayDhaka } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = await requireSessionApi();
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const today = todayDhaka();
  const filters = parseFilters(url.searchParams, today);
  const view = parseBookingView(url.searchParams.get('bv') ?? undefined);
  const anchor = resolveBookingAnchor(url.searchParams.get('ba') ?? undefined, filters.range, today);
  const activity = await bookingActivity(
    (sql, params) => querySource<Row>(sql, params),
    filters,
    view,
    anchor,
    today,
  );
  return Response.json(activity, { headers: { 'Cache-Control': 'private, no-store' } });
}
