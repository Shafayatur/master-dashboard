'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { formatRange } from '@/lib/filters/format';
import { isValidYmd } from '@/lib/filters/dates';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/components/ui/cn';

interface Props {
  from: string;
  to: string;
  isCustomActive?: boolean;
  onApply: (from: string, to: string) => void;
  minDate?: string;
  maxDate?: string;
  align?: 'left' | 'right';
}

export function InlineDateRangePopover(props: Props) {
  return <InlineDateRangePopoverContent key={`${props.from}|${props.to}`} {...props} />;
}

function InlineDateRangePopoverContent({
  from: initialFrom,
  to: initialTo,
  isCustomActive = false,
  onApply,
  minDate,
  maxDate,
  align = 'right',
}: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const valid = isValidYmd(from) && isValidYmd(to) && from <= to &&
    (!minDate || from >= minDate) &&
    (!maxDate || to <= maxDate);

  return (
    <Popover
      label={
        <>
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          <span>{isCustomActive ? formatRange({ from: initialFrom, to: initialTo }) : 'Calendar'}</span>
        </>
      }
      ariaLabel={isCustomActive ? `Custom date range: ${formatRange({ from: initialFrom, to: initialTo })}` : 'Choose custom date range'}
      align={align}
      className={cn(isCustomActive && 'bg-surface text-fg font-medium shadow-sm')}
      panelClassName="w-64 space-y-3 p-3"
    >
      {(close) => (
        <>
          <label className="block text-xs text-muted">
            From
            <input
              type="date"
              value={from}
              min={minDate}
              max={maxDate}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg"
            />
          </label>
          <label className="block text-xs text-muted">
            To
            <input
              type="date"
              value={to}
              min={minDate}
              max={maxDate}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg"
            />
          </label>
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              onApply(from, to);
              close();
            }}
            className="h-9 w-full rounded-md bg-ink text-sm font-medium text-white disabled:opacity-40 dark:bg-emerald-600"
          >
            Apply
          </button>
        </>
      )}
    </Popover>
  );
}
