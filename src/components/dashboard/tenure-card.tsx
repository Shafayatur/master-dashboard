import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { CompareRow } from '@/lib/queries/projects';

interface Props {
  title: string;
  rows: CompareRow[];
  unit: MoneyUnit;
  compare: boolean;
  note?: string;
}

const card = 'rounded-xl border border-line bg-surface p-4';

function Change({ row }: { row: CompareRow }) {
  if (row.deltaPct === null) {
    return row.prevValue === 0 ? <span className="text-xs text-muted">new</span> : null;
  }
  if (row.deltaPct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        {row.deltaPct.toFixed(1)}%
      </span>
    );
  }
  if (row.deltaPct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
        {Math.abs(row.deltaPct).toFixed(1)}%
      </span>
    );
  }
  return <span className="text-xs text-muted">0.0%</span>;
}

export function TenureCard({ title, rows, unit, compare, note }: Props) {
  const maxValue = Math.max(0, ...rows.map((row) => row.value));
  const preferredIndex = rows.reduce((bestIndex, row, index) => (
    row.investors > (rows[bestIndex]?.investors ?? -1) ? index : bestIndex
  ), -1);

  return (
    <section className={card}>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data for these filters.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((row, index) => {
            const width = maxValue > 0 ? Math.max(2, (row.value / maxValue) * 100) : 2;
            return (
              <div key={row.key}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">{row.label}</span>
                    {index === preferredIndex && (
                      <span className="shrink-0 rounded-full border border-line px-2 text-xs">Preferred</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatInt(row.investors)} investors</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{formatMoney(row.value, unit)}</span>
                  {compare && <Change row={row} />}
                </div>
                <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
