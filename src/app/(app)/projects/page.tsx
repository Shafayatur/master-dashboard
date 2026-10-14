import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/require-session';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Projects & Tenure' };

export default async function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSession();
  return <PlaceholderPage title="Projects & Tenure" phase="phase 2" intro="Project scorecards, preferred tenure and what to launch next." searchParams={searchParams} />;
}
