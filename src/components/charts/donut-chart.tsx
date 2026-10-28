import { formatInt } from '@/lib/format/money';
import { chartColor } from './chart-colors';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
}

const positive = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const pct = (n: number): string => `${n.toFixed(1)}%`;

/** Resolves colours and shares once so the ring and the legend always agree. */
function resolve(slices: DonutSlice[]) {
  const total = slices.reduce((sum, s) => sum + positive(s.value), 0);
  const items = slices.map((s, i) => ({
    ...s,
    color: s.color ?? chartColor(i),
    share: total > 0 ? (positive(s.value) / total) * 100 : 0,
  }));
  return { total, items };
}

interface DonutProps {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel?: string;
  size?: number;
  hint?: string;
}

/** Ring chart with gaps between segments. Server component: no JavaScript is shipped for it. */
export function DonutChart({ slices, centerValue, centerLabel, size = 160, hint }: DonutProps) {
  const { total, items } = resolve(slices);
  if (total <= 0) return <p className="py-8 text-center text-sm text-muted">No data in this period.</p>;

  const stroke = Math.round(size * 0.15);
  const c = size / 2;
  const r = (size - stroke) / 2;
  const drawn = items.filter((s) => s.share > 0);
  const gap = drawn.length > 1 ? 1.2 : 0;
  const inner = size - 2 * stroke - 12;
  const fontSize = Math.max(10, Math.min(size * 0.17, (inner * 0.95) / Math.max(1, centerValue.length * 0.6)));

  let start = 0;
  const segments = drawn.map((s) => {
    const len = Math.max(0.3, s.share - gap);
    const offset = -(start + gap / 2);
    start += s.share;
    return { ...s, len, offset };
  });

  return (
    <>
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={items.some((s) => s.href) ? 'group' : 'img'}
      aria-label={`Donut chart, ${centerLabel ?? 'total'} ${centerValue}: ${items.map((s) => `${s.label} ${pct(s.share)}`).join(', ')}`}
      className="animate-rise shrink-0"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} opacity="0.5" />
      <g transform={`rotate(-90 ${c} ${c})`}>
        {segments.map((s) => {
          const circle = (
            <circle
              key={s.key}
              data-slice={s.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              pathLength={100}
              strokeDasharray={`${s.len.toFixed(3)} ${(100 - s.len).toFixed(3)}`}
              strokeDashoffset={s.offset.toFixed(3)}
            >
              <title>{`${s.label}: ${pct(s.share)}`}</title>
            </circle>
          );
          return s.href ? (
            <a
              key={s.key}
              href={s.href}
              aria-label={`${s.label}: ${pct(s.share)}`}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              {circle}
            </a>
          ) : (
            circle
          );
        })}
      </g>
      <text x={c} y={centerLabel ? c - 1 : c + fontSize * 0.35} textAnchor="middle" fontSize={fontSize.toFixed(1)} fontWeight="600" fill="rgb(var(--fg))">
        {centerValue}
      </text>
      {centerLabel && (
        <text x={c} y={c + fontSize * 0.9} textAnchor="middle" fontSize="11" fill="rgb(var(--muted))">
          {centerLabel}
        </text>
      )}
    </svg>
    {hint && <p className="order-last basis-full text-xs text-muted">{hint}</p>}
    </>
  );
}

interface LegendProps {
  slices: DonutSlice[];
  format?: 'pct' | 'value';
  /** Server-side formatter for the value column (e.g. money in the chosen unit). */
  valueText?: (key: string) => string;
}

/** Colour dot, label and share for every slice. Pair it with DonutChart using the same slices. */
export function DonutLegend({ slices, format = 'pct', valueText }: LegendProps) {
  const { items } = resolve(slices);
  if (items.length === 0) return null;
  return (
    <ul className="min-w-0 flex-1 space-y-1.5 text-sm" aria-label="Legend">
      {items.map((s) => (
        <li key={s.key} data-legend={s.key} className="flex items-center justify-between gap-3">
          {s.href ? (
            <a
              href={s.href}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {format === 'value' ? (
                  <>
                    {valueText?.(s.key) ?? formatInt(Math.round(positive(s.value)))}
                    <span className="ml-2 text-xs text-muted">{pct(s.share)}</span>
                  </>
                ) : (
                  pct(s.share)
                )}
              </span>
            </a>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {format === 'value' ? (
                  <>
                    {valueText?.(s.key) ?? formatInt(Math.round(positive(s.value)))}
                    <span className="ml-2 text-xs text-muted">{pct(s.share)}</span>
                  </>
                ) : (
                  pct(s.share)
                )}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
