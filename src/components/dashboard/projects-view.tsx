import { ArrowDownRight, ArrowUpRight, CalendarClock, Layers3, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Filters } from '@/lib/filters/schema';
import { COMPARE_LABELS, PRESET_LABELS } from '@/lib/filters/dates';
import { formatRange } from '@/lib/filters/format';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import { buildProjectInsights } from '@/lib/dashboard/project-insights';
import type { ActiveProject } from '@/lib/queries/active-projects';
import type { CompareRow, ProjectsData } from '@/lib/queries/projects';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { HBarList } from '@/components/charts/hbar-list';
import { KpiCard } from '@/components/charts/kpi-card';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';
import { ProjectScorecard } from './project-scorecard';
import { ActiveProjectsCard } from './active-projects-card';

interface Props {
  data: ProjectsData;
  activeProjects: ActiveProject[];
  filters: Filters;
  unit: MoneyUnit;
  searchParams: Record<string, string | string[] | undefined>;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const toneColor = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;

function changeHint(row: CompareRow, compare: boolean): ReactNode {
  if (!compare) return undefined;
  if (row.deltaPct === null) {
    return row.prevValue === 0 ? (
      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">New</span>
    ) : undefined;
  }
  if (row.deltaPct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
        <ArrowUpRight className="h-3 w-3" aria-hidden />{row.deltaPct.toFixed(1)}%
      </span>
    );
  }
  if (row.deltaPct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-2 py-0.5 font-medium text-rose-700 dark:text-rose-300">
        <ArrowDownRight className="h-3 w-3" aria-hidden />{Math.abs(row.deltaPct).toFixed(1)}%
      </span>
    );
  }
  return <span className="inline-flex rounded-full bg-line/60 px-2 py-0.5 font-medium text-muted">0.0%</span>;
}

export function ProjectsView({ data, activeProjects, filters, unit, searchParams }: Props) {
  const insights = buildProjectInsights(data, unit);
  const preferredTenure = [...data.tenure].sort((a, b) => b.investors - a.investors || b.value - a.value)[0];
  const topProjectShare = data.scorecard[0]?.share ?? 0;
  const tenureSlices = data.tenure.map((row, index) => ({
    key: row.key,
    label: row.label,
    value: row.investors,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const tenureByKey = new Map(data.tenure.map((row) => [row.key, row]));
  const categoryItems = data.category.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    hint: changeHint(row, data.compareRange !== null),
  }));
  const tenureInvestors = data.tenure.reduce((sum, row) => sum + row.investors, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects &amp; Tenure</h2>
          <p className="mt-1 text-sm text-muted">
            {filters.preset === 'custom' ? 'Custom' : PRESET_LABELS[filters.preset]}: {formatRange(data.range)}
            {data.compareRange ? ` · vs ${COMPARE_LABELS[filters.compare]} (${formatRange(data.compareRange)})` : ''}
          </p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard i={0} icon={Wallet} tone="blue" label="Total investment">
          <CountUp value={data.total} kind="money" unit={unit} />
        </KpiCard>
        <KpiCard i={1} icon={Layers3} tone="violet" label="Top project share" hint={data.scorecard[0]?.label ?? 'No project activity'}>
          {topProjectShare.toFixed(1)}%
        </KpiCard>
        <KpiCard i={2} icon={CalendarClock} tone="emerald" label="Preferred tenure">
          {preferredTenure?.label ?? '—'}
        </KpiCard>
        <KpiCard i={3} icon={Layers3} tone="amber" label="Active projects">
          <CountUp value={data.scorecard.length} kind="int" />
        </KpiCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Preferred tenure" subtitle="Investors per tenure">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
              <DonutChart
                slices={tenureSlices}
                centerValue={formatInt(tenureInvestors)}
                centerLabel="Investors"
              />
              <DonutLegend
                slices={tenureSlices}
                format="value"
                valueText={(key) => formatInt(tenureByKey.get(key)?.investors ?? 0)}
              />
            </div>
          </ChartCard>
          <ChartCard title="Categories" subtitle="A product in several categories counts in each">
            <HBarList items={categoryItems} kind="money" unit={unit} color={CHART_COLORS[1]} />
          </ChartCard>
        </div>

        <aside className={card}>
          <h3 className="text-sm font-medium">What to launch next</h3>
          {insights.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {insights.map((insight, index) => (
                <li key={`${insight.tone}-${index}`} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[insight.tone]}`} aria-hidden />
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No launch recommendations for these filters.</p>
          )}
        </aside>
      </div>

      <ActiveProjectsCard projects={activeProjects} unit={unit} searchParams={searchParams} />
      <ProjectScorecard rows={data.scorecard} unit={unit} />
    </div>
  );
}
