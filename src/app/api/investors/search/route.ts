import { requireSessionApi } from '@/lib/auth/require-session';
import { searchInvestorsLive } from '@/lib/queries/investor-profile-page';

export const dynamic = 'force-dynamic';

/** GET /api/investors/search?q=... -> up to 8 investors by name, phone, email or id. */
export async function GET(req: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;
  const term = new URL(req.url).searchParams.get('q') ?? '';
  try {
    return Response.json({ hits: await searchInvestorsLive(term) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[search] failed:', (e as Error).message);
    return Response.json({ error: 'search unavailable' }, { status: 503 });
  }
}
