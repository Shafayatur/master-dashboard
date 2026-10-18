import { buildMoneyFlowInsights } from '@/lib/dashboard/money-flow-insights';
import { formatRange } from '@/lib/filters/format';
import type { Filters } from '@/lib/filters/schema';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { MoneyFlowData } from '@/lib/queries/money-flow';
import { BarChart } from './bar-chart';
import { PageTools } from './page-tools';

interface Props {
  data: MoneyFlowData;
  unit: MoneyUnit;
  filters: Filters;
}

const card = 'rounded-xl border border-line bg-surface p-4';
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

      {insights.length > 0 && (
        <section className={card}>
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
        <section className={card}>
          <h3 className="text-sm font-medium">Payouts by month</h3>
          <div className="mt-3">
            <BarChart
              unit={unit}
              items={data.payoutsByMonth.map((month) => ({
                label: payoutMonthLabel(month.month),
                values: [
                  { name: 'Completed', color: 'emerald-500', value: month.completed.amount },
                  { name: 'In flight', color: 'amber-500', value: month.initiated.amount },
                ],
              }))}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            In flight now: {formatInt(data.inFlight.count)} payouts, {formatMoney(data.inFlight.amount, unit)}
          </p>
        </section>

        <section className={card}>
          <h3 className="text-sm font-medium">Upcoming payouts (next 12 weeks)</h3>
          <div className="mt-3">
            <BarChart
              unit={unit}
              items={data.schedule.weeks.map((week) => ({
                label: weekLabel(week.week),
                values: [
                  { name: 'Profit', color: 'emerald-500', value: week.profit },
                  { name: 'Principal', color: 'sky-500', value: week.principal },
                ],
              }))}
            />
          </div>
          <p className={`mt-2 text-xs ${lowCoverage ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
            Schedules exist for {formatInt(scheduleCoverage.withSchedule)} of {formatInt(scheduleCoverage.invested)} running investments.
            {lowCoverage && ' Payouts for the rest are not shown.'}
          </p>
        </section>
      </div>

      <section className={card}>
        <h3 className="text-sm font-medium">Maturity calendar (principal reaching maturity)</h3>
        {data.maturity.overdue.count > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {formatInt(data.maturity.overdue.count)} investments worth {formatMoney(data.maturity.overdue.amount, unit)} are past maturity but still marked invested.
          </p>
        )}
        <div className="mt-3">
          <BarChart
            unit={unit}
            items={data.maturity.weeks.map((week) => ({
              label: weekLabel(week.week),
              values: [{ name: 'Principal', color: 'sky-500', value: week.principal }],
            }))}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={card}>
          <h3 className="text-sm font-medium">Reinvestment in this period</h3>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Confirmed (marked reinvest)
              </span>
              <span className="text-right tabular-nums">
                {formatInt(data.reinvest.confirmed.count)} · {formatMoney(data.reinvest.confirmed.amount, unit)} · {formatInt(data.reinvest.confirmed.investors)} investors
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                Estimated (investor paid out in the previous {data.windowDays} days)
                <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">estimate</span>
              </span>
              <span className="text-right tabular-nums">
                {formatInt(data.reinvest.estimated.count)} · {formatMoney(data.reinvest.estimated.amount, unit)} · {formatInt(data.reinvest.estimated.investors)} investors
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-muted">
              <span>Total approved investment</span>
              <span className="text-right tabular-nums">
                {formatInt(data.reinvest.total.count)} · {formatMoney(data.reinvest.total.amount, unit)} · {formatInt(data.reinvest.total.investors)} investors
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            Repeat investors: {formatInt(data.reinvest.repeat.returning)} of {formatInt(data.reinvest.repeat.investing)} investing investors
            {' '}({data.reinvest.repeat.investing > 0 ? (data.reinvest.repeat.returning / data.reinvest.repeat.investing * 100).toFixed(0) : '0'}%).
            {' '}The estimate cannot prove the money is the same.
          </p>
        </section>

        <section className={card}>
          <h3 className="text-sm font-medium">Payout to reinvest rate</h3>
          <p className="mt-2 text-sm">
            {formatInt(conversion.paidInvestors)} investors were paid {formatMoney(conversion.paidAmount, unit)} in this period.
          </p>
          <div className="mt-5 space-y-4">
            {conversionWindows.map(({ days, count, complete }) => {
              const percentage = conversion.paidInvestors > 0 ? count / conversion.paidInvestors * 100 : 0;
              return (
                <div key={days}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span>{days} days</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {formatInt(count)} investors
                      {!complete && <span>still open</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <span className={`w-12 text-right text-sm tabular-nums ${complete ? '' : 'italic'}`}>
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
