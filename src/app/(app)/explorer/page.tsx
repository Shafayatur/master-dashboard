import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Data Explorer' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Data Explorer" phase="phase 5" intro="Raw tables with filters and export." searchParams={searchParams} />;
}
