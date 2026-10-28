import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { ProjectsView } from '@/components/dashboard/projects-view';
import { requireSession } from '@/lib/auth/require-session';
import { parseFilters, serializeFilters, type Filters } from '@/lib/filters/schema';
import { MONEY_UNIT_COOKIE, parseMoneyUnit, type MoneyUnit } from '@/lib/format/money';
import { getActiveProjects } from '@/lib/queries/active-projects-page';
import { getProjects } from '@/lib/queries/projects-page';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Projects & Tenure' };

type SearchParams = Record<string, string | string[] | undefined>;

async function Loaded({ filters, today, unit, searchParams }: { filters: Filters; today: string; unit: MoneyUnit; searchParams: SearchParams }) {
  const [data, activeProjects] = await Promise.all([getProjects(filters, today), getActiveProjects(today)]);
  return <ProjectsView data={data} activeProjects={activeProjects} filters={filters} unit={unit} searchParams={searchParams} />;
}

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession();
  const today = todayDhaka();
  const filters = parseFilters(searchParams, today);
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <Suspense key={`${serializeFilters(filters).toString()}|${unit}`} fallback={<CommandCenterSkeleton />}>
      <Loaded filters={filters} today={today} unit={unit} searchParams={searchParams} />
    </Suspense>
  );
}
