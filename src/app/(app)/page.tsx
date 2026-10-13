import { PlaceholderPage } from '@/components/shell/placeholder-page';

export default function CommandCenter({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <PlaceholderPage
      title="Command Center"
      phase="the next patch (needs the data sanity report first)"
      intro="Funnel, headline numbers with period comparison, target pacing and what changed."
      searchParams={searchParams}
    />
  );
}
