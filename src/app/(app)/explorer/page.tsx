import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExplorerView } from '@/components/dashboard/explorer-view';
import { CommandCenterSkeleton } from '@/components/dashboard/skeleton';
import { requireSession } from '@/lib/auth/require-session';
import { getExplorer } from '@/lib/queries/explorer-page';
import { parseExplorerParams } from '@/lib/queries/explorer';
import { todayDhaka } from '@/lib/time';

export const metadata: Metadata = { title: 'Data Explorer' };

async function Loaded({
  params,
  searchParams,
  now,
}: {
  params: ReturnType<typeof parseExplorerParams>;
  searchParams: Record<string, string | string[] | undefined>;
  now: Date;
}) {
  const data = await getExplorer(params, now);
  return <ExplorerView data={data} params={params} searchParams={searchParams} />;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSession();
  const now = new Date();
  const today = todayDhaka(now);
  const params = parseExplorerParams(searchParams, today);
  return (
    <Suspense key={JSON.stringify(searchParams)} fallback={<CommandCenterSkeleton />}>
      <Loaded params={params} searchParams={searchParams} now={now} />
    </Suspense>
  );
}
