import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { ActionsView } from '@/components/dashboard/actions-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { isValidYmd, type DateRange } from '@/lib/filters/dates';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getActionLists, MATURING_WINDOWS } from '@/lib/queries/action-lists-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Action Lists' };

async function Loaded({ unit, days, today, maturityRange }: { unit: MoneyUnit; days: number; today: string; maturityRange: DateRange | null }) {
  const data = await getActionLists(today, days, maturityRange ?? undefined);
  return <ActionsView data={data} unit={unit} today={today} maturityRange={maturityRange} />;
}

export default async function ActionsPage(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  await requireSession();
  const today = todayDhaka();
  const unit = parseMoneyUnit((await cookies()).get(MONEY_UNIT_COOKIE)?.value);
  const requestedDays = searchParams.days;
  const days = typeof requestedDays === 'string'
    ? MATURING_WINDOWS.find((window) => String(window) === requestedDays) ?? 14
    : 14;
  const requestedFrom = searchParams.from;
  const requestedTo = searchParams.to;
  const maturityRange = typeof requestedFrom === 'string' && typeof requestedTo === 'string' &&
    isValidYmd(requestedFrom) && isValidYmd(requestedTo) && requestedFrom <= requestedTo
    ? { from: requestedFrom, to: requestedTo }
    : null;

  return (
    <Suspense key={`${unit}|${days}|${maturityRange?.from ?? ''}|${maturityRange?.to ?? ''}`} fallback={<CommandCenterSkeleton />}>
      <Loaded unit={unit} days={days} today={today} maturityRange={maturityRange} />
    </Suspense>
  );
}
