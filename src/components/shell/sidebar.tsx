'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useFilters } from '@/components/filters/use-filters';
import { serializeFilters } from '@/lib/filters/schema';
import { ThemeToggle } from './theme-toggle';
import { NAV, isActive } from './nav';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { filters } = useFilters();
  const qs = serializeFilters(filters).toString(); // filters follow you from tab to tab

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ink text-ink-fg transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between px-5">
          <span className="text-[15px] font-semibold tracking-tight text-white">Master Dashboard</span>
          <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={qs ? `${href}?${qs}` : href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-white/10 font-medium text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden />}
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-between border-t border-ink-line px-4 py-3">
          <button type="button" onClick={signOut} className="flex items-center gap-2 text-sm hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
          <ThemeToggle className="rounded-md p-1.5 hover:bg-white/10 hover:text-white" />
        </div>
      </aside>
    </>
  );
}
