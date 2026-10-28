import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { SalesView } from '@/components/dashboard/sales-view';
import { SalesSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getSales } from '@/lib/queries/sales-page';
import { parseBookingView, resolveBookingAnchor } from '@/lib/queries/tabs-extra';
import { getSalesExtras } from '@/lib/queries/tabs-extra-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Sales' };

function queryString(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  return query.toString();
}

async function Loaded({
  filters,
  today,
  unit,
  bookingView,
  bookingAnchor,
  search,
}: {
  filters: Filters;
  today: string;
  unit: MoneyUnit;
  bookingView: ReturnType<typeof parseBookingView>;
  bookingAnchor: string;
  search: string;
}) {
  const [data, extras] = await Promise.all([
    getSales(filters, today),
    getSalesExtras(filters, today, bookingView, bookingAnchor),
  ]);
  return (
    <SalesView
      data={data}
      extras={extras}
      filters={filters}
      unit={unit}
      bookingAnchor={bookingAnchor}
      search={search}
    />
  );
}

export default async function SalesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  const today = todayDhaka();
  const filters = parseFilters(searchParams, today);
  const rawView = Array.isArray(searchParams.bv) ? searchParams.bv[0] : searchParams.bv;
  const rawAnchor = Array.isArray(searchParams.ba) ? searchParams.ba[0] : searchParams.ba;
  const bookingView = parseBookingView(rawView);
  const bookingAnchor = resolveBookingAnchor(rawAnchor, filters.range, today);
  const search = queryString(searchParams);
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense
      key={`${serializeFilters(filters).toString()}|${bookingView}|${bookingAnchor}|${unit}`}
      fallback={<SalesSkeleton />}
    >
      <Loaded
        filters={filters}
        today={today}
        unit={unit}
        bookingView={bookingView}
        bookingAnchor={bookingAnchor}
        search={search}
      />
    </Suspense>
  );
}
