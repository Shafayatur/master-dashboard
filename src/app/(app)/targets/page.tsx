import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/require-session';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Targets' };

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  return <PlaceholderPage title="Targets" phase="phase 4" intro="Monthly targets with pacing and the required daily amount." searchParams={searchParams} />;
}
