import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Targets' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Targets" phase="phase 4" intro="Monthly targets with pacing and the required daily amount." searchParams={searchParams} />;
}
