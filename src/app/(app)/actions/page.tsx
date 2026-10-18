import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { ActionsView } from '@/components/dashboard/actions-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getActionLists, MATURING_WINDOWS } from '@/lib/queries/action-lists-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Action Lists' };

async function Loaded({ unit, days }: { unit: MoneyUnit; days: number }) {
  const data = await getActionLists(todayDhaka(), days);
  return <ActionsView data={data} unit={unit} />;
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSession();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  const requestedDays = searchParams.days;
  const days = typeof requestedDays === 'string'
    ? MATURING_WINDOWS.find((window) => String(window) === requestedDays) ?? 14
    : 14;

  return (
    <Suspense key={`${unit}|${days}`} fallback={<CommandCenterSkeleton />}>
      <Loaded unit={unit} days={days} />
    </Suspense>
  );
}
