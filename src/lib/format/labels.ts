import type { Bucket } from '@/lib/dashboard/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatBucketLabel(ymd: string, bucket: Bucket): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(ymd);
  if (!match) return ymd;

  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return ymd;

  return bucket === 'month' ? `${month} ${match[1]?.slice(2)}` : `${Number(match[3] ?? '1')} ${month}`;
}
