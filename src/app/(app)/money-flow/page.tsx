import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Money Flow' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Money Flow" phase="phase 4" intro="Maturity and payout calendar, and reinvestment tiers." searchParams={searchParams} />;
}
