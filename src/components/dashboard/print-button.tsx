'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs hover:text-fg"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Print / PDF
    </button>
  );
}
