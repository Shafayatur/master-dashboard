import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Investors' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Investors" phase="phase 3" intro="Segments, tiers, cohort retention and concentration." searchParams={searchParams} />;
}
