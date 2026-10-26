import { formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { TargetsOverview } from '@/lib/queries/targets';
import { CHART_COLORS } from '@/components/charts/chart-colors';
import { ChartCard } from '@/components/charts/chart-card';
import { BarChart } from './bar-chart';
import { PageTools } from './page-tools';
import { TargetForm } from './target-form';
import { TargetRemoveButton } from './target-remove-button';

const card = 'rounded-xl border border-line bg-surface p-4';

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}T00:00:00`));
}

export function TargetsView({ data, unit }: { data: TargetsOverview; unit: MoneyUnit }) {
  const chartRows = data.rows
    .filter((row) => !row.isFuture)
    .slice(0, 12)
    .reverse();
  const chartItems = chartRows.map((row) => ({
    label: `${new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${row.month}T00:00:00Z`))} '${row.month.slice(2, 4)}`,
    values: [
      { name: 'Target', color: CHART_COLORS[1] ?? '', value: row.target ?? 0 },
      { name: 'Achieved', color: CHART_COLORS[0] ?? '', value: row.actual },
    ],
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Targets</h2>
          <p className="mt-1 text-sm text-muted">Monthly investment targets and how each month is tracking</p>
        </div>
        <PageTools generatedAt={data.generatedAt} unit={unit} />
      </div>

      <ChartCard title="Target vs achieved" subtitle="Monthly investment value · last 12 months">
        <BarChart items={chartItems} unit={unit} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <TargetForm defaultMonth={data.currentMonth.slice(0, 7)} />
        <section className={`${card} xl:col-span-2`}>
          <h3 className="text-sm font-medium">Last 12 months</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="pb-2 pr-4 font-medium">Month</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Target</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Achieved</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Progress</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Note</th>
                  <th scope="col" className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.month} className="border-b border-line last:border-0">
                    <th scope="row" className="py-3 pr-4 font-medium">
                      <span className="whitespace-nowrap">{formatMonth(row.month)}</span>
                      {row.isCurrent && (
                        <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          current
                        </span>
                      )}
                      {row.isFuture && (
                        <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] font-medium text-muted">
                          upcoming
                        </span>
                      )}
                    </th>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.target === null ? <span className="text-muted">not set</span> : formatMoney(row.target, unit)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.isFuture ? '-' : formatMoney(row.actual, unit)}
                    </td>
                    <td className="py-3 pr-4">
                      {row.pct === null ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-line">
                            <div
                              className={`h-full rounded-full ${row.pct >= 100 ? 'bg-emerald-500' : row.pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(row.pct, 100)}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap">{Math.round(row.pct)}%</span>
                        </div>
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate py-3 pr-4 text-muted" title={row.note ?? undefined}>
                      {row.note ?? ''}
                    </td>
                    <td className="py-3">
                      {row.target !== null && <TargetRemoveButton month={row.month} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
