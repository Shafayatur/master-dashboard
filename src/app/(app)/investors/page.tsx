import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/require-session';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Investors' };

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  return <PlaceholderPage title="Investors" phase="phase 3" intro="Segments, tiers, cohort retention and concentration." searchParams={searchParams} />;
}
