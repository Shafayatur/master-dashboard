import type { ReactNode } from 'react';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';
import { CHART_COLORS } from './chart-colors';

interface Item {
  key: string;
  label: string;
  value: number;
  hint?: ReactNode;
}

interface Props {
  items: Item[];
  kind: 'money' | 'int';
  unit?: MoneyUnit;
  color?: string;
}

const positive = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Ranked horizontal bars. The longest bar is 100% wide; each row also shows its share of the total. */
export function HBarList({ items, kind, unit = 'm', color }: Props) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted">No data in this period.</p>;

  const values = items.map((item) => positive(item.value));
  const max = Math.max(0, ...values);
  const total = values.reduce((sum, v) => sum + v, 0);
  const fmt = (v: number) => (kind === 'money' ? formatMoney(v, unit) : formatInt(Math.round(v)));
  const fill = color ?? CHART_COLORS[0] ?? 'rgb(var(--chart-1))';

  return (
    <ul className="space-y-3" aria-label={`Ranked bars, ${items.length} items, total ${fmt(total)}`}>
      {items.map((item, i) => {
        const v = values[i] ?? 0;
        const share = total > 0 ? (v / total) * 100 : 0;
        const width = v > 0 && max > 0 ? Number(Math.max(1.5, (v / max) * 100).toFixed(1)) : 0;
        return (
          <li key={item.key} data-bar={item.key} title={`${item.label}: ${fmt(v)} (${share.toFixed(1)}%)`} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{fmt(v)}</span>
                <span className="ml-2 text-xs text-muted">{share.toFixed(1)}%</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: fill }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
