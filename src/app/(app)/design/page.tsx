import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PageTools } from '@/components/dashboard/page-tools';
import { ChartGallery } from '@/components/charts/gallery';
import { requireSession } from '@/lib/auth/require-session';
import { MONEY_UNIT_COOKIE, parseMoneyUnit } from '@/lib/format/money';

export const metadata: Metadata = { title: 'Chart toolkit' };

/** Review page for the chart components. Not linked from the sidebar and reads no data. */
export default async function DesignPage() {
  await requireSession();
  const unit = parseMoneyUnit(cookies().get(MONEY_UNIT_COOKIE)?.value);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PageTools generatedAt={new Date().toISOString()} unit={unit} />
      </div>
      <ChartGallery unit={unit} />
    </div>
  );
}
