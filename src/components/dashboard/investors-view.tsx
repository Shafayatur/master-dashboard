'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserRound, UserRoundCheck, UserRoundMinus, UserRoundX } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { KpiCard } from '@/components/charts/kpi-card';
import { cn } from '@/components/ui/cn';
import { buildInvestorInsights } from '@/lib/dashboard/investor-insights';
import { formatBucketLabel } from '@/lib/format/labels';
import { investorSegmentHref } from '@/lib/drilldown';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { InvestorsData, SegmentKey, TierRow } from '@/lib/queries/investors';
import type { InvestorsExtras } from '@/lib/queries/tabs-extra';
import { BarChart } from './bar-chart';
import { CohortTable } from './cohort-table';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';
import { InlineDateRangePopover } from './inline-date-range-popover';

interface Props {
  data: InvestorsData;
  extras: InvestorsExtras;
  unit: MoneyUnit;
  search: string;
  today: string;
}

const card = 'rounded-xl border border-line bg-surface p-4';
type WindowMonths = 6 | 12;
type TierMetric = 'investors' | 'value';

const REGISTRATION_PERIODS = [
  { preset: 'mtd', label: 'MTD' },
  { preset: 'last30', label: '30D' },
  { preset: 'last90', label: '90D' },
  { preset: 'ytd', label: 'YTD' },
  { preset: 'lifetime', label: 'Life time' },
] as const;

function SegmentedButtons<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2 py-1.5 text-xs font-medium transition-colors',
            value === option.value ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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

export function InvestorsView({ data, extras, unit, search, today }: Props) {
  const router = useRouter();
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(12);
  const [tierMetric, setTierMetric] = useState<TierMetric>('investors');
  const registrationParams = new URLSearchParams(search);
  const registrationPreset = registrationParams.get('p') ?? 'mtd';
  const registrationFrom = registrationParams.get('from') ?? today;
  const registrationTo = registrationParams.get('to') ?? today;
  const insights = buildInvestorInsights(data, unit);
  const segments = data.segments.map((segment) => ({
    key: segment.key,
    label: SEGMENT_INFO[segment.key].label,
    value: segment.investors,
    color: SEGMENT_INFO[segment.key].color,
    href: investorSegmentHref(search, segment.key, segment.investors),
  }));
  const segmentByKey = new Map(data.segments.map((segment) => [segment.key, segment]));
  const registered = data.totalInvestors;
  const active = segmentByKey.get('active')?.investors ?? 0;
  const cooling = segmentByKey.get('cooling')?.investors ?? 0;
  const inactive = segmentByKey.get('inactive')?.investors ?? 0;
  const tierItems = data.tiers.map((tier, index) => ({
    label: tierLabel(tier, index, data.tiers.length, unit),
    values: [{
      value: tierMetric === 'investors' ? tier.investors : tier.value,
      color: CHART_COLORS[1] ?? '',
      name: tierMetric === 'investors' ? 'Investors' : 'Lifetime value',
    }],
  }));
  const paretoNote = `Top 10 investors hold ${data.concentration.top10Share.toFixed(0)}% of lifetime investment; the top 20% hold ${data.concentration.top20PctShare.toFixed(0)}%.`;
  const registrationsVsFirst = extras.registrationsVsFirst.slice(-windowMonths);
  const cohorts = data.cohorts.slice(-windowMonths);
  const registrationLabels = registrationsVsFirst.map((row) => row.month);
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              className="lg:col-span-2"
              title="Investor segments"
              subtitle="Snapshot as of now. Ignores the date and product filters."
            >
              <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <DonutChart
                  slices={segments}
                  centerValue={formatInt(registered)}
                  centerLabel="Investors"
                  hint={segments.some((slice) => slice.href) ? 'Click a slice to see the records' : undefined}
                />
                <DonutLegend
                  slices={segments}
                  format="value"
                  valueText={(key) => {
                    const seg = segmentByKey.get(key as SegmentKey);
                    return seg ? `${formatInt(seg.investors)} · ${formatMoney(seg.avgLifetimeValue, unit)}` : '0';
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">Investors · average lifetime value · share of investors</p>
            </ChartCard>

            <ChartCard
              title="Investors by lifetime value"
              subtitle={paretoNote}
              action={
                <SegmentedButtons
                  label="Lifetime value tier metric"
                  options={[
                    { value: 'investors', label: 'Count' },
                    { value: 'value', label: 'Value' },
                  ]}
                  value={tierMetric}
                  onChange={setTierMetric}
                />
              }
            >
              <BarChart items={tierItems} unit={unit} kind={tierMetric === 'investors' ? 'int' : 'money'} height={250} />
            </ChartCard>

            <section className={`${card} min-w-0`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Investment depth</h3>
                  <p className="mt-1 text-xs text-muted">
                    Snapshot of all investors with at least one investment; ignores date, product, and other dashboard filters.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 print:hidden">
                  <a
                    href="/api/export/investment-depth?bucket=all&fmt=csv"
                    download
                    className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
                  >
                    Export all CSV
                  </a>
                  <a
                    href="/api/export/investment-depth?bucket=all&fmt=xlsx"
                    download
                    className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
                  >
                    Export all Excel
                  </a>
                </div>
              </div>
              <div className="mt-3 divide-y divide-line">
                {data.investmentDepth.buckets.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm">{bucket.label}</p>
                      <p className="text-xs text-muted">
                        {formatInt(bucket.investors)} investors · {bucket.share.toFixed(1)}%
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 print:hidden">
                      <a
                        href={`/api/export/investment-depth?bucket=${bucket.key}&fmt=csv`}
                        download
                        className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
                      >
                        CSV
                      </a>
                      <a
                        href={`/api/export/investment-depth?bucket=${bucket.key}&fmt=xlsx`}
                        download
                        className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
                      >
                        Excel
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                {formatInt(data.investmentDepth.singleInvestors)} investors invested once,{' '}
                {formatInt(data.investmentDepth.multipleInvestors)} invested more than once
              </p>
            </section>
          </div>

          <ChartCard
            title="New registrations"
            subtitle={registrationNote}
            action={
              <div className="flex flex-wrap items-center gap-1 print:hidden">
                {REGISTRATION_PERIODS.map(({ preset, label }) => (
                  <Link
                    key={preset}
                    href={`/investors?p=${preset}`}
                    aria-current={registrationPreset === preset ? 'page' : undefined}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium transition-colors',
                      registrationPreset === preset ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {label}
                  </Link>
                ))}
                <InlineDateRangePopover
                  from={registrationFrom}
                  to={registrationTo}
                  isCustomActive={registrationPreset === 'custom'}
                  onApply={(from, to) => {
                    const params = new URLSearchParams({ p: 'custom', from, to });
                    router.push(`/investors?${params.toString()}`);
                  }}
                />
              </div>
            }
          >
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

          <ChartCard
            title="Registrations vs first investments"
            action={
              <SegmentedButtons
                label="Registration comparison months"
                options={[
                  { value: 6, label: '6M' },
                  { value: 12, label: '12M' },
                ]}
                value={windowMonths}
                onChange={setWindowMonths}
              />
            }
          >
            <AreaChart
              labels={registrationLabels}
              bucket="month"
              unit={unit}
              series={[
                {
                  key: 'registrations',
                  label: 'Registrations',
                  values: registrationsVsFirst.map((row) => row.registered),
                  color: CHART_COLORS[0],
                },
                {
                  key: 'first-investments',
                  label: 'First investments',
                  values: registrationsVsFirst.map((row) => row.firstInvestments),
                  color: CHART_COLORS[1],
                },
              ]}
            />
          </ChartCard>

          <CohortTable cohorts={cohorts} medianDaysToFirst={data.medianDaysToFirst} />
        </div>

        <aside className={`${card} min-w-0`}>
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
