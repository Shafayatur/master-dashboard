'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInt, formatMoney, type MoneyUnit } from '@/lib/format/money';

interface Props {
  value: number;
  kind: 'money' | 'int';
  unit?: MoneyUnit;
}

const show = (v: number, kind: Props['kind'], unit: MoneyUnit) => (kind === 'money' ? formatMoney(v, unit) : formatInt(Math.round(v)));

/** Counts up on first load and glides between values on refresh. Respects reduced-motion. */
export function CountUp({ value, kind, unit = 'm' }: Props) {
  const [shown, setShown] = useState(value);
  const last = useRef<number | null>(null);

  useEffect(() => {
    const start = last.current ?? 0;
    last.current = value;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      setShown(start + (value - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span>{show(shown, kind, unit)}</span>;
}
