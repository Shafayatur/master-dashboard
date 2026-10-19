import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { InvestorProfileView } from '@/components/dashboard/investor-profile-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getInvestorProfile } from '@/lib/queries/investor-profile-page';

export const metadata: Metadata = { title: 'Investor' };

async function Loaded({ id, unit }: { id: number; unit: MoneyUnit }) {
  const profile = await getInvestorProfile(id);
  if (!profile) notFound();
  return <InvestorProfileView p={profile} unit={unit} />;
}

export default async function InvestorPage({ params }: { params: { id: string } }) {
  await requireSession();
  if (!/^\d{1,9}$/.test(params.id)) notFound();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);

  return (
    <Suspense key={`${params.id}|${unit}`} fallback={<CommandCenterSkeleton />}>
      <Loaded id={Number(params.id)} unit={unit} />
    </Suspense>
  );
}
