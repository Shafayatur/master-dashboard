'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

interface PopoverProps {
  /** Content of the trigger button. */
  label: ReactNode;
  /** Accessible name for the trigger when `label` is not descriptive text. */
  ariaLabel?: string;
  align?: 'left' | 'right';
  active?: boolean;
  className?: string;
  panelClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}

export const triggerClass =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-fg transition-colors hover:border-muted/50 aria-expanded:border-muted/60';

export function Popover({ label, ariaLabel, align = 'left', active, className, panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(triggerClass, active && 'border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200', className)}
      >
        {label}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            'absolute z-30 mt-2 min-w-[14rem] rounded-xl border border-line bg-surface p-2 shadow-lg shadow-black/10',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
