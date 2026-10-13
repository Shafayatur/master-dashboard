import { Suspense } from 'react';
import { AppChrome } from '@/components/shell/app-chrome';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppChrome>{children}</AppChrome>
    </Suspense>
  );
}
