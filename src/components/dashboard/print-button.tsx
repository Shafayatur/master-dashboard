'use client';

import { Printer } from 'lucide-react';
import { cn } from '@/components/ui/cn';

interface Props {
  label?: string;
  className?: string;
}

export function PrintButton({ label = 'Print / PDF', className }: Props) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn('inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs hover:text-fg', className)}
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
