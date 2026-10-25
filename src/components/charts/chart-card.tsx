import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Card shell shared by every chart: consistent padding, title row and an optional action slot. */
export function ChartCard({ title, subtitle, action, className, children }: Props) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-4', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}
