'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { FilterBar } from '@/components/filters/filter-bar';
import { Sidebar } from './sidebar';
import { NAV, isActive } from './nav';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const title = NAV.find((n) => isActive(pathname, n.href))?.label ?? 'Master Dashboard';

  return (
    <div className="min-h-screen lg:pl-60">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="lg:hidden">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </header>
      <FilterBar />
      <main className="px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
