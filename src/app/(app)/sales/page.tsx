import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { SalesView } from '@/components/dashboard/sales-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getSales } from '@/lib/queries/sales-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Sales' };

async function Loaded({ filters, today, unit }: { filters: Filters; today: string; unit: MoneyUnit }) {
  const data = await getSales(filters, today);
  return <SalesView data={data} filters={filters} unit={unit} />;
}

export default async function SalesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  const today = todayDhaka();
  const filters = parseFilters(searchParams, today);
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense key={`${serializeFilters(filters).toString()}|${unit}`} fallback={<CommandCenterSkeleton />}>
      <Loaded filters={filters} today={today} unit={unit} />
    </Suspense>
  );
}
