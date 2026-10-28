import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { InvestorsView } from '@/components/dashboard/investors-view';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getInvestors } from '@/lib/queries/investors-page';
import { getInvestorsExtras } from '@/lib/queries/tabs-extra-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Investors' };

async function Loaded({ today, filters, unit }: { today: string; filters: Filters; unit: MoneyUnit }) {
  const [data, extras] = await Promise.all([getInvestors(today), getInvestorsExtras(today, filters.range)]);
  return <InvestorsView data={data} extras={extras} unit={unit} />;
}

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSession();
  const today = todayDhaka();
  const filters = parseFilters(searchParams, today);
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense key={`${serializeFilters(filters).toString()}|${unit}`} fallback={<CommandCenterSkeleton />}>
      <Loaded today={today} filters={filters} unit={unit} />
    </Suspense>
  );
}
