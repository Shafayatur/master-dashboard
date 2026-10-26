import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/require-session';
import { AppChrome } from '@/components/shell/app-chrome';

// Every page behind the sign-in is rendered per request. Never prerender: the data and the session are per user.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <Suspense fallback={null}>
      <AppChrome>{children}</AppChrome>
    </Suspense>
  );
}
