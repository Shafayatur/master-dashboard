'use client';

import { useEffect, useRef, useState } from 'react';
import type { Bucket, SeriesPoint } from '@/lib/dashboard/types';
import { formatMoney, type MoneyUnit } from '@/lib/format/money';

const H = 260;
const PAD = { l: 56, r: 12, t: 12, b: 28 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function label(ymd: string, bucket: Bucket): string {
  const [y = '', m = '1', d = '1'] = ymd.split('-');
  return bucket === 'month' ? `${MONTHS[Number(m) - 1]} ${y.slice(2)}` : `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

interface Props {
  points: SeriesPoint[];
  bucket: Bucket;
  unit: MoneyUnit;
}

/** Hand-drawn SVG line + area with a dashed comparison line, hover read-out and a draw-in animation. */
export function TrendChart({ points, bucket, unit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  if (n === 0) return <p className="py-10 text-center text-sm text-muted">No data in this period.</p>;

  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.value, p.compare ?? 0))));
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (get: (p: SeriesPoint) => number | null) =>
    points
      .flatMap((p, i) => {
        const v = get(p);
        return v === null ? [] : [`${x(i).toFixed(1)},${y(v).toFixed(1)}`];
      })
      .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt}`)
      .join(' ');

  const main = path((p) => p.value);
  const hasCompare = points.some((p) => p.compare !== null);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const xs = Array.from(new Set([0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1]));
  const hp = hover === null ? null : points[hover];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left - PAD.l) / (w - PAD.l - PAD.r);
    setHover(Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
  };

  return (
    <div ref={box} className="relative w-full">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`Investment value trend, ${n} points`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--focus))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--focus))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
              {formatMoney(t, unit)}
            </text>
          </g>
        ))}
        {xs.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="rgb(var(--muted))">
            {label(points[i]?.label ?? '', bucket)}
          </text>
        ))}
        <path d={`${main} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#trend-fill)" className="animate-rise" />
        {hasCompare && (
          <path d={path((p) => p.compare)} fill="none" stroke="rgb(var(--muted))" strokeWidth="1.5" strokeDasharray="4 4" />
        )}
        <path d={main} fill="none" stroke="rgb(var(--focus))" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} className="animate-draw" />
        {hover !== null && hp && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--muted))" strokeOpacity="0.5" />
            <circle cx={x(hover)} cy={y(hp.value)} r="4" fill="rgb(var(--focus))" />
            {hp.compare !== null && <circle cx={x(hover)} cy={y(hp.compare)} r="3" fill="rgb(var(--muted))" />}
          </g>
        )}
      </svg>
      {hover !== null && hp && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(hover) + 12, 8), w - 170) }}
        >
          <p className="font-medium">{label(hp.label, bucket)}</p>
          <p>{formatMoney(hp.value, unit)}</p>
          {hp.compare !== null && hp.compareLabel && (
            <p className="text-muted">
              {label(hp.compareLabel, bucket)}: {formatMoney(hp.compare, unit)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
