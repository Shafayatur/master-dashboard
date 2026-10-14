import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/require-session';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Action Lists' };

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  return <PlaceholderPage title="Action Lists" phase="phase 4" intro="Call sheets: ready to reinvest, cooling investors, stuck bookings, pending deposits." searchParams={searchParams} />;
}
