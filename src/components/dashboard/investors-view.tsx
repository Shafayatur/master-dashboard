import { UserRound, UserRoundCheck, UserRoundMinus, UserRoundX } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { KpiCard } from '@/components/charts/kpi-card';
import { buildInvestorInsights } from '@/lib/dashboard/investor-insights';
import { formatBucketLabel } from '@/lib/format/labels';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { InvestorsData, SegmentKey, TierRow } from '@/lib/queries/investors';
import type { InvestorsExtras } from '@/lib/queries/tabs-extra';
import { BarChart } from './bar-chart';
import { CohortTable } from './cohort-table';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';

interface Props {
  data: InvestorsData;
  extras: InvestorsExtras;
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const toneColor = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;

const SEGMENT_INFO: Record<SegmentKey, { label: string; color: string }> = {
  active: { label: 'Active', color: CHART_COLORS[0] ?? 'rgb(var(--chart-1))' },
  recently_active: { label: 'Recently active', color: CHART_COLORS[1] ?? 'rgb(var(--chart-2))' },
  cooling: { label: 'Cooling', color: CHART_COLORS[2] ?? 'rgb(var(--chart-3))' },
  inactive: { label: 'Inactive', color: CHART_COLORS[4] ?? 'rgb(var(--chart-5))' },
  prospect: { label: 'Prospect', color: CHART_COLORS[5] ?? 'rgb(var(--chart-6))' },
};

function tierLabel(tier: TierRow, index: number, count: number, unit: MoneyUnit): string {
  if (index === 0) return `Under ${formatMoney(tier.max ?? tier.min, unit)}`;
  if (index === count - 1) return `${formatMoney(tier.min, unit)} and above`;
  return `${formatMoney(tier.min, unit)} to ${formatMoney(tier.max ?? tier.min, unit)}`;
}

export function InvestorsView({ data, extras, unit }: Props) {
  const insights = buildInvestorInsights(data, unit);
  const segments = data.segments.map((segment) => ({
    key: segment.key,
    label: SEGMENT_INFO[segment.key].label,
    value: segment.investors,
    color: SEGMENT_INFO[segment.key].color,
  }));
  const segmentByKey = new Map(data.segments.map((segment) => [segment.key, segment]));
  const registered = data.totalInvestors;
  const active = segmentByKey.get('active')?.investors ?? 0;
  const cooling = segmentByKey.get('cooling')?.investors ?? 0;
  const inactive = segmentByKey.get('inactive')?.investors ?? 0;
  const tierItems = data.tiers.map((tier, index) => ({
    label: tierLabel(tier, index, data.tiers.length, unit),
    values: [{ value: tier.investors, color: CHART_COLORS[1] ?? '', name: 'Investors' }],
  }));
  const paretoNote = `Top 10 investors hold ${data.concentration.top10Share.toFixed(0)}% of lifetime investment; the top 20% hold ${data.concentration.top20PctShare.toFixed(0)}%.`;
  const registrationLabels = extras.registrationsVsFirst.map((row) => row.month);
  const registrationPoints = extras.registrationsOverTime.points;
  const periodRegistered = registrationPoints.reduce((sum, point) => sum + point.registered, 0);
  const periodInvested = registrationPoints.reduce((sum, point) => sum + point.invested, 0);
  const investedPct = periodRegistered > 0 ? Math.round((periodInvested / periodRegistered) * 100) : 0;
  const registrationItems = registrationPoints.map((point) => ({
    label: formatBucketLabel(point.label, extras.registrationsOverTime.bucket),
    values: [
      { value: point.invested, color: 'emerald-500', name: 'Invested since' },
      { value: point.registered - point.invested, color: 'rgb(100 116 139)', name: 'Not yet invested' },
    ],
  }));
  const registrationNote = `${formatInt(periodRegistered)} registered in the selected period - ${investedPct}% have invested. Uses the date range; other cards on this tab are snapshots.`;

  const kpis = [
    { label: 'Registered investors', value: registered, icon: UserRound, tone: 'blue' as const },
    { label: 'Active', value: active, icon: UserRoundCheck, tone: 'emerald' as const },
    { label: 'Cooling', value: cooling, icon: UserRoundMinus, tone: 'amber' as const },
    { label: 'Inactive', value: inactive, icon: UserRoundX, tone: 'rose' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Investors</h2>
          <p className="mt-1 text-sm text-muted">{formatInt(data.totalInvestors)} registered investors. Snapshot as of now.</p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon, tone }, index) => (
          <KpiCard key={label} i={index} icon={icon} tone={tone} label={label}>
            <CountUp value={value} kind="int" />
          </KpiCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Investor segments" subtitle="Snapshot as of now. Ignores the date and product filters.">
              <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <DonutChart
                  slices={segments}
                  centerValue={formatInt(registered)}
                  centerLabel="Investors"
                />
                <DonutLegend
                  slices={segments}
                  format="value"
                  valueText={(key) => formatMoney(segmentByKey.get(key as SegmentKey)?.avgLifetimeValue ?? 0, unit)}
                />
              </div>
              <p className="mt-2 text-xs text-muted">Average lifetime value · share of investors</p>
            </ChartCard>

            <ChartCard title="Investors by lifetime value" subtitle={paretoNote}>
              <BarChart items={tierItems} unit={unit} kind="int" height={250} />
            </ChartCard>
          </div>

          <ChartCard title="New registrations" subtitle={registrationNote}>
            <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Invested since
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />
                Not yet invested
              </span>
            </div>
            <BarChart items={registrationItems} unit={unit} kind="int" height={260} />
          </ChartCard>

          <ChartCard title="Registrations vs first investments">
            <AreaChart
              labels={registrationLabels}
              bucket="month"
              unit={unit}
              series={[
                {
                  key: 'registrations',
                  label: 'Registrations',
                  values: extras.registrationsVsFirst.map((row) => row.registered),
                  color: CHART_COLORS[0],
                },
                {
                  key: 'first-investments',
                  label: 'First investments',
                  values: extras.registrationsVsFirst.map((row) => row.firstInvestments),
                  color: CHART_COLORS[1],
                },
              ]}
            />
          </ChartCard>

          <CohortTable cohorts={data.cohorts} medianDaysToFirst={data.medianDaysToFirst} />
        </div>

        <aside className={card}>
          <h3 className="text-sm font-medium">What to act on</h3>
          {insights.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {insights.map((insight) => (
                <li key={insight.text} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[insight.tone]}`} aria-hidden />
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No priority actions for this snapshot.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
