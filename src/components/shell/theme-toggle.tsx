'use client';

import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('md-theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  };
  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark mode" className={className}>
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
    </button>
  );
}
