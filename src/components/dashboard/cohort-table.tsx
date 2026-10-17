import { formatInt } from '@/lib/format/money';
import type { CohortRow } from '@/lib/queries/investors';

interface Props {
  cohorts: CohortRow[];
  medianDaysToFirst: number | null;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const headerCell = 'whitespace-nowrap px-3 py-2 text-right text-xs font-medium uppercase text-muted';
const valueCell = 'whitespace-nowrap px-3 py-2 text-right tabular-nums';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(month: string): string {
  const year = month.slice(0, 4);
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
  return `${monthName} ${year}`;
}

function RateCell({ count, registered, complete }: { count: number; registered: number; complete?: boolean }) {
  if (registered === 0) return <td className={valueCell}>-</td>;
  const pct = (count / registered) * 100;
  if (complete === false) {
    return (
      <td className={valueCell}>
        <span className="italic text-muted" title="Still maturing">{pct.toFixed(1)}%</span>
      </td>
    );
  }
  return (
    <td className={valueCell} style={{ backgroundColor: `rgba(16,185,129,${(pct / 100) * 0.5})` }}>
      {pct.toFixed(1)}%
    </td>
  );
}

export function CohortTable({ cohorts, medianDaysToFirst }: Props) {
  return (
    <section className={card}>
      <div className="mb-4">
        <h3 className="text-sm font-medium">Registration cohorts: conversion to first investment</h3>
        <p className="mt-1 text-xs text-muted">Recent months are still maturing, so their rates will rise.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase text-muted">Month</th>
              <th className={headerCell}>Registered</th>
              <th className={headerCell}>Within 7 days</th>
              <th className={headerCell}>Within 30 days</th>
              <th className={headerCell}>Within 90 days</th>
              <th className={headerCell}>Ever</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.month} className="border-t border-line">
                <td className="whitespace-nowrap px-3 py-2">{formatMonth(cohort.month)}</td>
                <td className={valueCell}>{formatInt(cohort.registered)}</td>
                <RateCell count={cohort.d7} registered={cohort.registered} complete={cohort.complete7} />
                <RateCell count={cohort.d30} registered={cohort.registered} complete={cohort.complete30} />
                <RateCell count={cohort.d90} registered={cohort.registered} complete={cohort.complete90} />
                <RateCell count={cohort.ever} registered={cohort.registered} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {medianDaysToFirst !== null && (
        <p className="mt-3 text-xs text-muted">Median time to first investment: {medianDaysToFirst} days</p>
      )}
    </section>
  );
}
