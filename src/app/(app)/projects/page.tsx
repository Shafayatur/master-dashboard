import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Projects & Tenure' };

export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return <PlaceholderPage title="Projects & Tenure" phase="phase 2" intro="Project scorecards, preferred tenure and what to launch next." searchParams={searchParams} />;
}
