import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { ProjectsView } from '@/components/dashboard/projects-view';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getProjects } from '@/lib/queries/projects-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Projects & Tenure' };

async function Loaded({ filters, today, unit }: { filters: Filters; today: string; unit: MoneyUnit }) {
  const data = await getProjects(filters, today);
  return <ProjectsView data={data} filters={filters} unit={unit} />;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
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
