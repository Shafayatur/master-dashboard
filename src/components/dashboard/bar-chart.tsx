'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';

const PAD = { l: 68, r: 12, t: 12, b: 34 };
const COLOR_VALUES: Record<string, string> = {
  'emerald-500': '#10b981',
  'amber-500': '#f59e0b',
  'sky-500': '#0ea5e9',
  'rose-500': '#f43f5e',
};

interface Item {
  label: string;
  values: { value: number; color: string; name: string }[];
}

interface Props {
  items: Item[];
  unit: MoneyUnit;
  kind?: 'money' | 'int';
  height?: number;
}

function niceStep(value: number): number {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / power;
  const multiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return multiple * power;
}

function fillColor(color: string): string {
  return COLOR_VALUES[color] ?? color;
}

export function BarChart({ items, unit, kind = 'money', height = 220 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted">No data in this period.</p>;

  const plotWidth = width - PAD.l - PAD.r;
  const plotHeight = height - PAD.t - PAD.b;
  const slotWidth = plotWidth / items.length;
  const highest = Math.max(0, ...items.map((item) => item.values.reduce((sum, part) => sum + Math.max(0, part.value), 0)));
  const step = niceStep(highest / 3);
  const max = step * 3;
  const y = (value: number) => PAD.t + (1 - value / max) * plotHeight;
  const x = (index: number) => PAD.l + index * slotWidth + slotWidth / 2;
  const ticks = [0, 1, 2, 3].map((index) => index * step);
  const labelStride = slotWidth >= 36 ? 1 : slotWidth < 18 ? 3 : 2;
  const selected = hover === null ? null : items[hover];
  const selectedTotal = selected?.values.reduce((sum, part) => sum + part.value, 0) ?? 0;
  const format = (value: number) => (kind === 'int' ? formatInt(Math.round(value)) : formatMoney(value, unit));

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = event.clientX - rect.left - PAD.l;
    if (point < 0 || point > plotWidth) {
      setHover(null);
      return;
    }
    setHover(Math.min(items.length - 1, Math.floor(point / slotWidth)));
  };

  return (
    <div ref={box} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Stacked column chart with ${items.length} periods, total ${format(items.reduce((sum, item) => sum + item.values.reduce((itemSum, part) => itemSum + part.value, 0), 0))}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(tick)} y2={y(tick)} stroke="rgb(var(--line))" />
            <text x={PAD.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
              {format(tick)}
            </text>
          </g>
        ))}
        {items.map((item, index) => {
          let accumulated = 0;
          const barWidth = Math.min(32, slotWidth * 0.65);
          return (
            <g key={`${item.label}-${index}`} opacity={hover === null || hover === index ? 1 : 0.45}>
              {item.values.map((part, partIndex) => {
                const value = Math.max(0, part.value);
                const segmentHeight = (value / max) * plotHeight;
                const rectY = y(accumulated + value);
                accumulated += value;
                return (
                  <rect
                    key={`${part.name}-${partIndex}`}
                    x={x(index) - barWidth / 2}
                    y={rectY}
                    width={barWidth}
                    height={Math.max(0, segmentHeight)}
                    fill={fillColor(part.color)}
                    className="animate-rise"
                    style={{ transformOrigin: `${x(index)}px ${height - PAD.b}px` }}
                  />
                );
              })}
              {index % labelStride === 0 && (
                <text x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--muted))">
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="rgb(var(--muted))" strokeOpacity="0.5" />
        )}
      </svg>
      {hover !== null && selected && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(hover) + 12, 8), width - 170) }}
        >
          <p className="mb-1 font-medium">{selected.label}</p>
          {selected.values.map((part, index) => (
            <p key={`${part.name}-${index}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: fillColor(part.color) }} aria-hidden />
                {part.name}
              </span>
              <span className="tabular-nums">{format(part.value)}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{format(selectedTotal)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
