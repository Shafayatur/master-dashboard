'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { cn } from '@/components/ui/cn';
import { PrintButton } from './print-button';
import { MONEY_UNIT_COOKIE, type MoneyUnit } from '@/lib/format/money';
import { formatDhaka } from '@/lib/time';

const REFRESH_MS = 60_000;

/** Auto-refresh every minute (data is cached server-side for 60s), manual refresh, and the M / lakh-crore toggle. */
export function PageTools({ generatedAt, unit }: { generatedAt: string; unit: MoneyUnit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = () => start(() => router.refresh());

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const setUnit = (u: MoneyUnit) => {
    document.cookie = `${MONEY_UNIT_COOKIE}=${u}; path=/; max-age=31536000; samesite=lax`;
    refresh();
  };

  const seg = (u: MoneyUnit, label: string) => (
    <button
      type="button"
      onClick={() => setUnit(u)}
      aria-pressed={unit === u}
      className={cn('px-2.5 py-1 text-xs font-medium transition-colors', unit === u ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg')}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-3 text-xs text-muted print:hidden">
      <span>Updated {formatDhaka(new Date(generatedAt)).slice(11)} Dhaka</span>
      <div className="flex items-center gap-3 print:hidden">
        <PrintButton />
        <button type="button" onClick={refresh} aria-label="Refresh now" className="rounded-md border border-line p-1.5 hover:text-fg">
          <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} aria-hidden />
        </button>
        <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="Amount unit">
          {seg('m', 'K/M')}
          {seg('lakh', 'Lakh/Cr')}
        </div>
      </div>
    </div>
  );
}
