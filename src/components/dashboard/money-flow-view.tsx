'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banknote, CalendarClock, CalendarDays, Hourglass, Send, Wallet } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { KpiCard } from '@/components/charts/kpi-card';
import { cn } from '@/components/ui/cn';
import { buildMoneyFlowInsights } from '@/lib/dashboard/money-flow-insights';
import { addDays, addMonths } from '@/lib/filters/dates';
import type { Filters } from '@/lib/filters/schema';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { MoneyFlowData } from '@/lib/queries/money-flow';
import { BarChart } from './bar-chart';
import { CountUp } from './count-up';
import { PageTools } from './page-tools';
import { InlineDateRangePopover } from './inline-date-range-popover';

interface Props {
  data: MoneyFlowData;
  unit: MoneyUnit;
  filters: Filters;
}

const SHOW_OVERDUE_UI = true;
type CashFlowMonths = 6 | 12 | 24 | 'all';
type HorizonWeeks = 4 | 8 | 12;

const MONEY_FLOW_PERIODS = [
  { preset: 'mtd', label: 'MTD' },
  { preset: 'lastMonth', label: 'Last month' },
  { preset: 'last30', label: 'Last 30 days' },
  { preset: 'last90', label: 'Last 90 days' },
  { preset: 'ytd', label: 'YTD' },
  { preset: 'lifetime', label: 'Life time' },
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
type CustomRange = { from: string; to: string } | null;

function SegmentedButtons<T extends string | number>({
  label,
  options,
  value,
  onChange,
  isSelected,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  isSelected?: (option: T) => boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={isSelected ? isSelected(option.value) : value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2 py-1.5 text-xs font-medium transition-colors',
            (isSelected ? isSelected(option.value) : value === option.value) ? 'bg-ink text-white dark:bg-emerald-600 dark:text-white' : 'text-muted hover:text-fg',
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
  const router = useRouter();
  const [cashFlowMonths, setCashFlowMonths] = useState<CashFlowMonths>(12);
  const [excludeReinvest, setExcludeReinvest] = useState(false);
  const [horizonWeeks, setHorizonWeeks] = useState<HorizonWeeks>(12);
  const [customRange, setCustomRange] = useState<CustomRange>(null);
  const insights = buildMoneyFlowInsights(data, unit).filter((i) => SHOW_OVERDUE_UI || !i.text.includes('past maturity'));
  const scheduleCoverage = data.schedule.coverage;
  const lowCoverage = scheduleCoverage.invested > 0 && scheduleCoverage.withSchedule / scheduleCoverage.invested < 0.7;
  const payoutMonths = data.payoutsByMonth.filter(
    (month) => month.month <= filters.range.to && addMonths(month.month, 1) > filters.range.from,
  );
  const paidOutAmount = payoutMonths.reduce((sum, month) => sum + month.completed.amount, 0);
  const completedPayoutCount = payoutMonths.reduce((sum, month) => sum + month.completed.count, 0);
  const periodCashFlow = data.cashFlowByMonth.filter(
    (month) => month.month <= filters.range.to && addMonths(month.month, 1) > filters.range.from,
  );
  const maturingInFourWeeks = data.maturity.weeks.slice(0, 4).reduce((sum, week) => sum + week.principal, 0);
  const visibleCashFlowByMonth = (cashFlowMonths === 'all'
    ? periodCashFlow
    : periodCashFlow.slice(-cashFlowMonths)
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
  const scheduleWeeks = customRange
    ? data.schedule.weeks.filter((week) => week.week <= customRange.to && addDays(week.week, 6) >= customRange.from)
    : data.schedule.weeks.slice(0, horizonWeeks);
  const maturityWeeks = customRange
    ? data.maturity.weeks.filter((week) => week.week <= customRange.to && addDays(week.week, 6) >= customRange.from)
    : data.maturity.weeks.slice(0, horizonWeeks);
  const firstScheduleWeek = data.schedule.weeks[0]?.week ?? data.range.from;
  const lastScheduleWeek = data.schedule.weeks.at(-1)?.week ?? firstScheduleWeek;
  const calendarFrom = customRange?.from ?? firstScheduleWeek;
  const calendarTo = customRange?.to ?? addDays(lastScheduleWeek, 6);
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
    { label: 'Paid out in period', value: paidOutAmount, hint: `${formatInt(completedPayoutCount)} completed payouts`, icon: Send, tone: 'emerald' as const },
    { label: 'In flight', value: data.inFlight.amount, hint: `${formatInt(data.inFlight.count)} payouts`, icon: Hourglass, tone: 'amber' as const },
    { label: 'Maturing in 4 weeks', value: maturingInFourWeeks, hint: 'principal due', icon: CalendarClock, tone: 'blue' as const },
    ...(SHOW_OVERDUE_UI
      ? [{ label: 'Overdue count', value: data.maturity.overdue.count, hint: formatMoney(data.maturity.overdue.amount, unit), icon: Wallet, tone: 'violet' as const, kind: 'int' as const }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="relative z-40 flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cashflow</h2>
          <p className="mt-1 text-sm text-muted">Live cash flow, payouts and upcoming maturity schedule.</p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
        <div className="flex flex-wrap items-center gap-1 print:hidden">
          <span className="mr-1 text-xs font-medium text-muted">Period:</span>
          <nav className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5" aria-label="Cashflow period">
            {MONEY_FLOW_PERIODS.map(({ preset, label }) => (
              <Link
                key={preset}
                href={`/money-flow?p=${preset}`}
                aria-current={filters.preset === preset ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  filters.preset === preset ? 'bg-ink text-white dark:bg-emerald-600 dark:text-white' : 'text-muted hover:text-fg',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <InlineDateRangePopover
            from={filters.range.from}
            to={filters.range.to}
            isCustomActive={filters.preset === 'custom'}
            onApply={(from, to) => {
              const params = new URLSearchParams({ p: 'custom', from, to });
              router.push(`/money-flow?${params.toString()}`);
            }}
          />
        </div>
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
            items={payoutMonths.map((month) => ({
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
            <div className="flex items-center gap-2">
              <SegmentedButtons
                label="Upcoming payouts horizon"
                options={HORIZON_OPTIONS}
                value={horizonWeeks}
                onChange={(weeks) => {
                  setCustomRange(null);
                  setHorizonWeeks(weeks);
                }}
                isSelected={(weeks) => customRange === null && weeks === horizonWeeks}
              />
              <InlineDateRangePopover
                from={calendarFrom}
                to={calendarTo}
                isCustomActive={customRange !== null}
                onApply={(from, to) => setCustomRange({ from, to })}
              />
            </div>
          }
        >
          <BarChart
            unit={unit}
            items={scheduleWeeks.map((week) => ({
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
          <div className="flex items-center gap-2">
            <SegmentedButtons
              label="Maturity calendar horizon"
              options={HORIZON_OPTIONS}
              value={horizonWeeks}
              onChange={(weeks) => {
                setCustomRange(null);
                setHorizonWeeks(weeks);
              }}
              isSelected={(weeks) => customRange === null && weeks === horizonWeeks}
            />
            <InlineDateRangePopover
              from={calendarFrom}
              to={calendarTo}
              isCustomActive={customRange !== null}
              onApply={(from, to) => setCustomRange({ from, to })}
            />
          </div>
        }
      >
        {SHOW_OVERDUE_UI && data.maturity.overdue.count > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {formatInt(data.maturity.overdue.count)} investments worth {formatMoney(data.maturity.overdue.amount, unit)} are more than 5 days past maturity but still marked invested.
          </p>
        )}
        <BarChart
          unit={unit}
          items={maturityWeeks.map((week) => ({
            label: weekLabel(week.week),
            values: [{ name: 'Principal', color: CHART_COLORS[1] ?? '', value: week.principal }],
          }))}
        />
      </ChartCard>

    </div>
  );
}
