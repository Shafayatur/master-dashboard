import { CalendarClock, Hourglass, Send, Wallet } from 'lucide-react';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { KpiCard } from '@/components/charts/kpi-card';
import { buildMoneyFlowInsights } from '@/lib/dashboard/money-flow-insights';
import { formatRange } from '@/lib/filters/format';
import { serializeFilters, type Filters } from '@/lib/filters/schema';
import { confirmedReinvestmentHref } from '@/lib/drilldown';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { MoneyFlowData } from '@/lib/queries/money-flow';
import { BarChart } from './bar-chart';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';

interface Props {
  data: MoneyFlowData;
  unit: MoneyUnit;
  filters: Filters;
}

const toneColor = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

function payoutMonthLabel(ymd: string): string {
  return `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(2, 4)}`;
}

export function MoneyFlowView({ data, unit, filters }: Props) {
  const insights = buildMoneyFlowInsights(data, unit);
  const scheduleCoverage = data.schedule.coverage;
  const lowCoverage = scheduleCoverage.invested > 0 && scheduleCoverage.withSchedule / scheduleCoverage.invested < 0.7;
  const conversion = data.conversion;
  const conversionWindows = [
    { days: 30, count: conversion.r30, complete: conversion.complete30 },
    { days: 60, count: conversion.r60, complete: conversion.complete60 },
    { days: 90, count: conversion.r90, complete: conversion.complete90 },
  ];
  const maturingInFourWeeks = data.maturity.weeks.slice(0, 4).reduce((sum, week) => sum + week.principal, 0);
  const otherApproved = Math.max(
    0,
    data.reinvest.total.amount - data.reinvest.confirmed.amount - data.reinvest.estimated.amount,
  );
  const search = serializeFilters(filters);
  const reinvestSlices = [
    {
      key: 'confirmed',
      label: 'Confirmed',
      value: data.reinvest.confirmed.amount,
      color: CHART_COLORS[0],
      href: confirmedReinvestmentHref(search, data.reinvest.confirmed.amount),
    },
    { key: 'estimated', label: 'Estimated', value: data.reinvest.estimated.amount, color: CHART_COLORS[2] },
    { key: 'other', label: 'Other approved investment', value: otherApproved, color: CHART_COLORS[5] },
  ];
  const reinvestByKey = new Map(reinvestSlices.map((slice) => [slice.key, slice.value]));
  const kpis = [
    { label: 'Paid out in period', value: conversion.paidAmount, hint: `${formatInt(conversion.paidInvestors)} investors`, icon: Send, tone: 'emerald' as const },
    { label: 'In flight', value: data.inFlight.amount, hint: `${formatInt(data.inFlight.count)} payouts`, icon: Hourglass, tone: 'amber' as const },
    { label: 'Maturing in 4 weeks', value: maturingInFourWeeks, hint: 'principal due', icon: CalendarClock, tone: 'blue' as const },
    { label: 'Overdue count', value: data.maturity.overdue.count, hint: formatMoney(data.maturity.overdue.amount, unit), icon: Wallet, tone: 'violet' as const, kind: 'int' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Money Flow</h2>
          <p className="mt-1 text-sm text-muted">
            {formatRange(data.range)} · Payouts, maturities and reinvestment. Only the date range applies.
          </p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, hint, icon, tone, kind }, index) => (
          <KpiCard key={label} i={index} icon={icon} tone={tone} label={label} hint={hint}>
            <CountUp value={value} kind={kind ?? 'money'} unit={unit} />
          </KpiCard>
        ))}
      </div>

      {insights.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h3 className="text-sm font-medium">What this means</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((insight) => (
              <li key={insight.text} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[insight.tone]}`} aria-hidden />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Payouts by month">
          <BarChart
            unit={unit}
            items={data.payoutsByMonth.map((month) => ({
              label: payoutMonthLabel(month.month),
              values: [
                { name: 'Completed', color: CHART_COLORS[0] ?? '', value: month.completed.amount },
                { name: 'In flight', color: CHART_COLORS[2] ?? '', value: month.initiated.amount },
              ],
            }))}
          />
          <p className="mt-2 text-xs text-muted">
            In flight now: {formatInt(data.inFlight.count)} payouts, {formatMoney(data.inFlight.amount, unit)}
          </p>
        </ChartCard>

        <ChartCard title="Upcoming payouts (next 12 weeks)">
          <BarChart
            unit={unit}
            items={data.schedule.weeks.map((week) => ({
              label: weekLabel(week.week),
              values: [
                { name: 'Profit', color: CHART_COLORS[0] ?? '', value: week.profit },
                { name: 'Principal', color: CHART_COLORS[1] ?? '', value: week.principal },
              ],
            }))}
          />
          <p className={`mt-2 text-xs ${lowCoverage ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
            Schedules exist for {formatInt(scheduleCoverage.withSchedule)} of {formatInt(scheduleCoverage.invested)} running investments.
            {lowCoverage && ' Payouts for the rest are not shown.'}
          </p>
        </ChartCard>
      </div>

      <ChartCard title="Maturity calendar (principal reaching maturity)">
        {data.maturity.overdue.count > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {formatInt(data.maturity.overdue.count)} investments worth {formatMoney(data.maturity.overdue.amount, unit)} are past maturity but still marked invested.
          </p>
        )}
        <BarChart
          unit={unit}
          items={data.maturity.weeks.map((week) => ({
            label: weekLabel(week.week),
            values: [{ name: 'Principal', color: CHART_COLORS[1] ?? '', value: week.principal }],
          }))}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Reinvestment in this period">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
            <DonutChart
              slices={reinvestSlices}
              centerValue={formatMoney(data.reinvest.total.amount, unit)}
              centerLabel="Approved investment"
              hint={reinvestSlices.some((slice) => slice.href) ? 'Click a slice to see the records' : undefined}
            />
            <DonutLegend
              slices={reinvestSlices}
              format="value"
              valueText={(key) => formatMoney(reinvestByKey.get(key) ?? 0, unit)}
            />
          </div>
          <p className="mt-4 text-xs text-muted">
            Repeat investors: {formatInt(data.reinvest.repeat.returning)} of {formatInt(data.reinvest.repeat.investing)} investing investors
            {' '}({data.reinvest.repeat.investing > 0 ? (data.reinvest.repeat.returning / data.reinvest.repeat.investing * 100).toFixed(0) : '0'}%).
            {' '}The estimate cannot prove the money is the same.
          </p>
          <p className="mt-1 text-xs text-muted">
            Confirmed means marked reinvest; estimated means the investor was paid out within {data.windowDays} days.
          </p>
        </ChartCard>

        <ChartCard title="Payout to reinvest rate">
          <p className="mt-2 text-sm">
            {formatInt(conversion.paidInvestors)} investors were paid {formatMoney(conversion.paidAmount, unit)} in this period.
          </p>
          <div className="mt-5 space-y-4">
            {conversionWindows.map(({ days, count, complete }) => {
              const percentage = conversion.paidInvestors > 0 ? count / conversion.paidInvestors * 100 : 0;
              return (
                <div key={days} aria-label={`${days} days: ${percentage.toFixed(1)}%`}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span>{days} days{!complete && <span className="ml-2 text-xs text-muted">still open</span>}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-medium">{percentage.toFixed(1)}%</span>
                      <span className="ml-2 text-xs text-muted">{formatInt(count)} investors</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
