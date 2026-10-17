import type { BreakdownRow } from '@/lib/queries/sales';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';

interface Props {
  title: string;
  rows: BreakdownRow[];
  unit: MoneyUnit;
  note?: string;
  statusColors?: boolean;
}

const statusColor: Record<string, string> = {
  approved: 'bg-emerald-500',
  pending: 'bg-amber-500',
  rejected: 'bg-rose-500',
};

export function BreakdownCard({ title, rows, unit, note, statusColors = false }: Props) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data for these filters.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{row.label}</span>
                <span className="shrink-0 text-sm font-medium">
                  {formatMoney(row.value, unit)} <span className="text-xs font-normal text-muted">{row.share.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${statusColors ? statusColor[row.key] ?? 'bg-emerald-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(2, row.share)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {formatInt(row.deposits)} deposits · {formatInt(row.investors)} investors
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
