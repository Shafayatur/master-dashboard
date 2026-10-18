import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import type { SegmentRow } from '@/lib/queries/investors';

interface Props {
  segments: SegmentRow[];
  unit: MoneyUnit;
}

const card = 'rounded-xl border border-line bg-surface p-4';
const segmentInfo = {
  active: { label: 'Active', hint: 'running project', color: 'bg-emerald-500' },
  recently_active: { label: 'Recently active', hint: 'matured within 30 days', color: 'bg-sky-500' },
  cooling: { label: 'Cooling', hint: 'matured 30-60 days ago', color: 'bg-amber-500' },
  inactive: { label: 'Inactive', hint: 'matured over 60 days ago', color: 'bg-rose-500' },
  prospect: { label: 'Prospect', hint: 'never invested', color: 'bg-slate-400' },
} as const;

export function SegmentCard({ segments, unit }: Props) {
  return (
    <section className={card}>
      <div>
        <h3 className="text-sm font-medium">Investor segments</h3>
        <p className="mt-1 text-xs text-muted">Snapshot as of now. Ignores the date and product filters.</p>
      </div>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-line" aria-label="Investor segment shares">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={segmentInfo[segment.key].color}
            style={{ width: `${segment.share}%` }}
            title={`${segmentInfo[segment.key].label}: ${segment.share.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {segments.map((segment) => {
          const info = segmentInfo[segment.key];
          return (
            <div key={segment.key}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${info.color}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{info.label}</p>
                    <p className="text-xs text-muted">{info.hint}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-baseline gap-3 text-sm tabular-nums">
                  <span>{formatInt(segment.investors)}</span>
                  <span className="text-muted">{segment.share.toFixed(1)}%</span>
                </div>
              </div>
              <p className="mt-1 pl-4 text-xs text-muted">
                Avg lifetime value: {formatMoney(segment.avgLifetimeValue, unit)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
