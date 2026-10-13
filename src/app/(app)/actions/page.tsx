import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Action Lists' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Action Lists" phase="phase 4" intro="Call sheets: ready to reinvest, cooling investors, stuck bookings, pending deposits." searchParams={searchParams} />;
}
