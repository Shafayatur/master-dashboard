import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/require-session';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Sales' };

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  return <PlaceholderPage title="Sales" phase="phase 2" intro="Sales by day, month, product and payment method, with period comparison." searchParams={searchParams} />;
}
