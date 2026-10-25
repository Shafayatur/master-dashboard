'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Bucket } from '@/lib/dashboard/types';
import { formatMoney, type MoneyUnit } from '@/lib/format/money';
import { chartColor } from './chart-colors';

const PAD = { l: 64, r: 14, t: 12, b: 28 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_SERIES = 3;

interface Series {
  key: string;
  label: string;
  color?: string;
  values: number[];
  dashed?: boolean;
}

interface Props {
  /** One label per point: YYYY-MM-DD (or YYYY-MM) is formatted by bucket, anything else is shown as given. */
  labels: string[];
  series: Series[];
  bucket: Bucket;
  unit: MoneyUnit;
  height?: number;
}

const finite = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function axisLabel(label: string, bucket: Bucket): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(label);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return label;
  return bucket === 'month' ? `${month} ${(m[1] ?? '').slice(2)}` : `${Number(m[3] ?? '1')} ${month}`;
}

/** Up to three series on one time axis: gradient under the first, optional dashed comparison, hover read-out. */
export function AreaChart({ labels, series, bucket, unit, height = 260 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const lines = series.slice(0, MAX_SERIES).map((s, i) => ({
    ...s,
    color: s.color ?? chartColor(i),
    data: Array.from({ length: n }, (_, k) => finite(s.values[k])),
  }));
  if (n === 0 || lines.length === 0) return <p className="py-10 text-center text-sm text-muted">No data in this period.</p>;

  const plotW = width - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const max = niceMax(Math.max(1, ...lines.flatMap((s) => s.data)));
  const x = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.t + (1 - v / max) * plotH;
  const path = (data: number[]) => data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const xs = Array.from(new Set([0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1]));
  const first = lines[0];
  const hoverLabel = hover === null ? null : axisLabel(labels[hover] ?? '', bucket);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left - PAD.l) / plotW;
    setHover(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
  };

  const summary = lines.map((s) => `${s.label} total ${formatMoney(s.data.reduce((a, b) => a + b, 0), unit)}`).join('; ');

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {lines.map((s) => (
          <li key={s.key} data-legend={s.key} className="flex items-center gap-1.5">
            <span className="inline-block w-4" style={{ borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Area chart, ${n} ${bucket === 'month' ? 'months' : 'days'}. ${summary}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={first?.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={first?.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
                {formatMoney(t, unit)}
              </text>
            </g>
          ))}
          {xs.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="rgb(var(--muted))">
              {axisLabel(labels[i] ?? '', bucket)}
            </text>
          ))}
          {first && n > 1 && (
            <path d={`${path(first.data)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={`url(#area-${gid})`} className="animate-rise" />
          )}
          {lines.map((s) =>
            n > 1 ? (
              <path
                key={s.key}
                data-series={s.key}
                d={path(s.data)}
                fill="none"
                stroke={s.color}
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
                {...(s.dashed ? { strokeDasharray: '4 4', className: 'animate-rise' } : { pathLength: 1, strokeDasharray: 1, className: 'animate-draw' })}
              />
            ) : (
              <circle key={s.key} data-series={s.key} cx={x(0)} cy={y(s.data[0] ?? 0)} r="4" fill={s.color} />
            ),
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="rgb(var(--muted))" strokeOpacity="0.5" />
              {lines.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.data[hover] ?? 0)} r="3.5" fill={s.color} stroke="rgb(var(--surface))" strokeWidth="1.5" />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
            style={{ left: Math.min(Math.max(x(hover) + 12, 8), width - 190) }}
          >
            <p className="mb-1 font-medium">{hoverLabel}</p>
            {lines.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tabular-nums">{formatMoney(s.data[hover] ?? 0, unit)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
