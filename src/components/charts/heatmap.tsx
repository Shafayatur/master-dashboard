import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';

interface Props {
  rows: string[];
  cols: string[];
  matrix: number[][];
  cellLabels?: string[][];
  unit?: MoneyUnit;
  kind?: 'int' | 'money';
}

const GAP = 3;
const HEAD = 22;
const clean = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Emerald intensity grid (rows x columns). Scrolls sideways on small screens. */
export function Heatmap({ rows, cols, matrix, cellLabels, unit = 'm', kind = 'int' }: Props) {
  const grid = rows.map((_, r) => cols.map((_, c) => clean(matrix[r]?.[c])));
  const max = Math.max(0, ...grid.flat());
  if (rows.length === 0 || cols.length === 0 || max === 0) {
    return <p className="py-8 text-center text-sm text-muted">No data in this period.</p>;
  }

  const fmt = (v: number) => (kind === 'money' ? formatMoney(v, unit) : formatInt(Math.round(v)));
  const dense = cols.length > 14;
  const cw = kind === 'money' ? 46 : dense ? 22 : 36;
  const ch = dense ? 24 : 30;
  const labelW = Math.min(140, Math.max(40, Math.max(...rows.map((r) => r.length)) * 6.4 + 14));
  const width = labelW + cols.length * (cw + GAP);
  const height = HEAD + rows.length * (ch + GAP);

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Heatmap, ${rows.length} rows by ${cols.length} columns, peak ${fmt(max)}`}
          className="max-w-none"
        >
          {cols.map((col, c) => (
            <text key={`h-${c}`} x={labelW + c * (cw + GAP) + cw / 2} y={14} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">
              {col}
            </text>
          ))}
          {rows.map((row, r) => (
            <g key={`r-${r}`}>
              <text x={labelW - 8} y={HEAD + r * (ch + GAP) + ch / 2 + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
                {row}
              </text>
              {cols.map((col, c) => {
                const v = grid[r]?.[c] ?? 0;
                const alpha = v > 0 ? 0.12 + 0.78 * (v / max) : 0;
                const cx = labelW + c * (cw + GAP);
                const cy = HEAD + r * (ch + GAP);
                return (
                  <g key={`c-${r}-${c}`}>
                    <rect
                      data-cell=""
                      x={cx}
                      y={cy}
                      width={cw}
                      height={ch}
                      rx="4"
                      fill={v > 0 ? 'rgb(var(--chart-1))' : 'rgb(var(--line))'}
                      fillOpacity={v > 0 ? alpha.toFixed(3) : 0.6}
                    >
                      <title>{`${row}, ${col}: ${fmt(v)}`}</title>
                    </rect>
                    {cellLabels?.[r]?.[c] && (
                      <text
                        x={cx + 4}
                        y={cy + 11}
                        fontSize="10"
                        fill="rgb(var(--muted))"
                        pointerEvents="none"
                        className="text-[10px]"
                      >
                        {cellLabels[r]?.[c]}
                      </text>
                    )}
                    {!dense && v > 0 && (
                      <text x={cx + cw / 2} y={cy + ch / 2 + 3.5} textAnchor="middle" fontSize="10" pointerEvents="none" fill={alpha > 0.5 ? 'rgb(var(--canvas))' : 'rgb(var(--fg))'}>
                        {fmt(v)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>0</span>
        <span className="h-2 w-28 rounded-full" style={{ backgroundImage: 'linear-gradient(to right, rgb(var(--chart-1) / 0.12), rgb(var(--chart-1) / 0.9))' }} aria-hidden />
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
