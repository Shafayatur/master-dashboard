import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterView } from '@/components/dashboard/command-center-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getHome } from '@/lib/queries/home-page';
import { todayDhaka } from '@/lib/time';

async function Loaded({ filters, today, unit }: { filters: Filters; today: string; unit: MoneyUnit }) {
  const data = await getHome(filters, today);
  return <CommandCenterView data={data} filters={filters} unit={unit} today={today} />;
}

export default async function CommandCenterPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  const today = todayDhaka();
  const filters = parseFilters(searchParams, today);
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  // Keyed by the filters so the skeleton shows again whenever they change.
  return (
    <Suspense key={`${serializeFilters(filters).toString()}|${unit}`} fallback={<CommandCenterSkeleton />}>
      <Loaded filters={filters} today={today} unit={unit} />
    </Suspense>
  );
}
