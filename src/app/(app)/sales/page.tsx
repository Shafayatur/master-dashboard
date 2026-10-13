import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Sales' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Sales" phase="phase 2" intro="Sales by day, month, product and payment method, with period comparison." searchParams={searchParams} />;
}
