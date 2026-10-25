import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export type KpiTone = 'emerald' | 'blue' | 'amber' | 'violet' | 'rose';

const TILE: Record<KpiTone, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

interface Props {
  icon: LucideIcon;
  tone: KpiTone;
  label: string;
  /** Percent change. null = no previous value ("new"), undefined = no badge. */
  delta?: number | null;
  /** True when a decrease is good news (cancellations, pending items): colours are flipped. */
  deltaInverse?: boolean;
  hint?: string;
  spark?: ReactNode;
  /** Position in the grid, used to stagger the entrance animation. */
  i?: number;
  /** The headline value. Keep it inline content (text or CountUp). */
  children: ReactNode;
}

function DeltaBadge({ delta, inverse }: { delta: number | null | undefined; inverse: boolean }) {
  if (delta === undefined) return null;
  if (delta === null || !Number.isFinite(delta)) {
    return (
      <span data-trend="new" className="shrink-0 rounded-full bg-line/60 px-2 py-0.5 text-xs font-medium text-muted">
        new
      </span>
    );
  }
  const direction = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
  const good = inverse ? direction === 'down' : direction === 'up';
  const bad = inverse ? direction === 'up' : direction === 'down';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const word = direction === 'up' ? 'Up' : direction === 'down' ? 'Down' : 'Unchanged';
  return (
    <span
      data-trend={direction}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
        good && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        bad && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        !good && !bad && 'bg-line/60 text-muted',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{word} </span>
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

/** Headline metric: coloured icon tile, big value, change badge, hint and an optional sparkline. */
export function KpiCard({ icon: Icon, tone, label, delta, deltaInverse = false, hint, spark, i = 0, children }: Props) {
  return (
    <div className="animate-rise rounded-xl border border-line bg-surface p-4" style={{ animationDelay: `${i * 40}ms` }}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TILE[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{children}</div>
        </div>
        <DeltaBadge delta={delta} inverse={deltaInverse} />
      </div>
      {(hint || spark) && (
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-muted">{hint}</p>
          {spark && <div className="shrink-0">{spark}</div>}
        </div>
      )}
    </div>
  );
}
