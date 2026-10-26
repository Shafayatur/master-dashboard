import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { InvestorsView } from '@/components/dashboard/investors-view';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getInvestors } from '@/lib/queries/investors-page';
import { getInvestorsExtras } from '@/lib/queries/tabs-extra-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Investors' };

async function Loaded({ today, unit }: { today: string; unit: MoneyUnit }) {
  const [data, extras] = await Promise.all([getInvestors(today), getInvestorsExtras(today)]);
  return <InvestorsView data={data} extras={extras} unit={unit} />;
}

export default async function InvestorsPage() {
  await requireSession();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  const today = todayDhaka();
  return (
    <Suspense key={unit} fallback={<CommandCenterSkeleton />}>
      <Loaded today={today} unit={unit} />
    </Suspense>
  );
}
