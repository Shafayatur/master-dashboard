import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { TargetsView } from '@/components/dashboard/targets-view';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getTargetsOverview } from '@/lib/queries/targets-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Targets' };

async function Loaded({ unit }: { unit: MoneyUnit }) {
  const data = await getTargetsOverview(todayDhaka());
  return <TargetsView data={data} unit={unit} />;
}

export default async function TargetsPage() {
  await requireSession();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense key={unit} fallback={<CommandCenterSkeleton />}>
      <Loaded unit={unit} />
    </Suspense>
  );
}
