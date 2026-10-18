import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { InvestorsView } from '@/components/dashboard/investors-view';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getInvestors } from '@/lib/queries/investors-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Investors' };

async function Loaded({ unit }: { unit: MoneyUnit }) {
  const data = await getInvestors(todayDhaka());
  return <InvestorsView data={data} unit={unit} />;
}

export default async function InvestorsPage() {
  await requireSession();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense key={unit} fallback={<CommandCenterSkeleton />}>
      <Loaded unit={unit} />
    </Suspense>
  );
}
