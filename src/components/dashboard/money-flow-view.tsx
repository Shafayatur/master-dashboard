'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Banknote, CalendarClock, CalendarDays, Hourglass, Send, Wallet } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { KpiCard } from '@/components/charts/kpi-card';
import { cn } from '@/components/ui/cn';
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

const SHOW_OVERDUE_UI = true;
type CashFlowMonths = 6 | 12 | 24 | 'all';
type HorizonWeeks = 4 | 8 | 12;

const PERIODS = [
  { preset: 'mtd', label: 'MTD' },
  { preset: 'lastMonth', label: 'Last month' },
  { preset: 'd30', label: 'Last 30 days' },
  { preset: 'd90', label: 'Last 90 days' },
  { preset: 'ytd', label: 'YTD' },
] as const;
const CASH_FLOW_MONTH_OPTIONS = [
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
  { value: 24, label: '24M' },
  { value: 'all', label: 'All' },
] as const;
const HORIZON_OPTIONS = [
  { value: 4, label: '4W' },
  { value: 8, label: '8W' },
  { value: 12, label: '12W' },
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

function payoutMonthLabel(ymd: string): string {
  return `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(2, 4)}`;
}

export function MoneyFlowView({ data, unit, filters }: Props) {
  const [cashFlowMonths, setCashFlowMonths] = useState<CashFlowMonths>(12);
  const [excludeReinvest, setExcludeReinvest] = useState(false);
  const [horizonWeeks, setHorizonWeeks] = useState<HorizonWeeks>(12);
  const insights = buildMoneyFlowInsights(data, unit).filter((i) => SHOW_OVERDUE_UI || !i.text.includes('past maturity'));
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
  const visibleCashFlowByMonth = (cashFlowMonths === 'all'
    ? data.cashFlowByMonth
    : data.cashFlowByMonth.slice(-cashFlowMonths)
  ).map((month) => {
    const moneyIn = excludeReinvest ? month.moneyIn - month.reinvest : month.moneyIn;
    return {
      ...month,
      moneyIn,
      net: moneyIn - month.moneyOut,
    };
  });
  const cashFlowTotals = visibleCashFlowByMonth.reduce(
    (totals, month) => ({
      moneyIn: totals.moneyIn + month.moneyIn,
      reinvest: totals.reinvest + month.reinvest,
      moneyOut: totals.moneyOut + month.moneyOut,
      net: totals.net + month.net,
    }),
    { moneyIn: 0, reinvest: 0, moneyOut: 0, net: 0 },
  );
  const kpis = [
    {
      label: 'Running investment value',
      value: data.running.amount,
      hint: `${formatInt(data.running.orders)} orders · ${formatInt(data.running.investors)} investors`,
      icon: Banknote,
      tone: 'emerald' as const,
    },
    {
      label: 'Scheduled payout liability',
      value: data.running.scheduledPayouts.total,
      hint: `${formatInt(data.running.scheduledPayouts.installments)} installments · principal ${formatMoney(data.running.scheduledPayouts.principal, unit)} · profit ${formatMoney(data.running.scheduledPayouts.profit, unit)}`,
      icon: CalendarDays,
      tone: 'blue' as const,
    },
    { label: 'Paid out in period', value: conversion.paidAmount, hint: `${formatInt(conversion.paidInvestors)} investors`, icon: Send, tone: 'emerald' as const },
    { label: 'In flight', value: data.inFlight.amount, hint: `${formatInt(data.inFlight.count)} payouts`, icon: Hourglass, tone: 'amber' as const },
    { label: 'Maturing in 4 weeks', value: maturingInFourWeeks, hint: 'principal due', icon: CalendarClock, tone: 'blue' as const },
    ...(SHOW_OVERDUE_UI
      ? [{ label: 'Overdue count', value: data.maturity.overdue.count, hint: formatMoney(data.maturity.overdue.amount, unit), icon: Wallet, tone: 'violet' as const, kind: 'int' as const }]
      : []),
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
        <nav className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5 print:hidden" aria-label="Money Flow period">
          {PERIODS.map(({ preset, label }) => (
            <Link
              key={preset}
              href={`/money-flow?p=${preset}`}
              aria-current={filters.preset === preset ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                filters.preset === preset ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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

      <ChartCard
        title="Cash flow by month"
        subtitle="Money in = approved deposits; money out = completed payouts. Ignores filters."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
            <SegmentedButtons
              label="Cash flow month range"
              options={CASH_FLOW_MONTH_OPTIONS}
              value={cashFlowMonths}
              onChange={setCashFlowMonths}
            />
            <button
              type="button"
              aria-pressed={excludeReinvest}
              onClick={() => setExcludeReinvest((excluded) => !excluded)}
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                excludeReinvest
                  ? 'border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-line text-muted hover:text-fg',
              )}
            >
              Exclude reinvest
            </button>
            <a
              href="/api/export/cash-flow?fmt=csv"
              download
              className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
            >
              Export CSV
            </a>
            <a
              href="/api/export/cash-flow?fmt=xlsx"
              download
              className="rounded-md border border-line px-2 py-1 text-xs hover:text-fg"
            >
              Export Excel
            </a>
          </div>
        }
      >
        <AreaChart
          labels={visibleCashFlowByMonth.map((month) => month.month)}
          bucket="month"
          unit={unit}
          series={[
            {
              key: 'money-in',
              label: excludeReinvest ? 'Money in (excluding reinvest)' : 'Money in',
              values: visibleCashFlowByMonth.map((month) => month.moneyIn),
              color: CHART_COLORS[0],
            },
            {
              key: 'money-out',
              label: 'Money out',
              values: visibleCashFlowByMonth.map((month) => month.moneyOut),
              color: CHART_COLORS[1],
            },
          ]}
        />
        <div className="mt-4 max-h-96 overflow-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Month</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{excludeReinvest ? 'Money in (net of reinvest)' : 'Money in'}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{excludeReinvest ? 'Reinvest excluded' : 'Of which reinvest'}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Money out</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...visibleCashFlowByMonth].reverse().map((month) => (
                <tr key={month.month} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{payoutMonthLabel(month.month)}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(month.moneyIn, unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(month.reinvest, unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(month.moneyOut, unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(month.net, unit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-medium">
                <th scope="row" className="py-2 pr-3 text-left">Total</th>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(cashFlowTotals.moneyIn, unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(cashFlowTotals.reinvest, unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(cashFlowTotals.moneyOut, unit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(cashFlowTotals.net, unit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

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

        <ChartCard
          title="Upcoming payouts"
          action={
            <SegmentedButtons
              label="Upcoming payouts horizon"
              options={HORIZON_OPTIONS}
              value={horizonWeeks}
              onChange={setHorizonWeeks}
            />
          }
        >
          <BarChart
            unit={unit}
            items={data.schedule.weeks.slice(0, horizonWeeks).map((week) => ({
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

      <ChartCard
        title="Maturity calendar (principal reaching maturity)"
        action={
          <SegmentedButtons
            label="Maturity calendar horizon"
            options={HORIZON_OPTIONS}
            value={horizonWeeks}
            onChange={setHorizonWeeks}
          />
        }
      >
        {SHOW_OVERDUE_UI && data.maturity.overdue.count > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {formatInt(data.maturity.overdue.count)} investments worth {formatMoney(data.maturity.overdue.amount, unit)} are more than 5 days past maturity but still marked invested.
          </p>
        )}
        <BarChart
          unit={unit}
          items={data.maturity.weeks.slice(0, horizonWeeks).map((week) => ({
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
