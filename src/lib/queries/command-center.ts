import 'server-only';
import { queryConfig } from '@/lib/db/config';

/** Monthly target from the dashboard's own database. A missing table or outage just means "no target". */
export async function getTarget(monthStart: string): Promise<number | null> {
  try {
    const rows = await queryConfig<{ t: number }>('SELECT target_amount::float8 AS t FROM monthly_targets WHERE month = $1::date', [monthStart]);
    return rows[0]?.t ?? null;
  } catch (e) {
    console.error('[targets] unavailable:', (e as Error).message);
    return null;
  }
}
