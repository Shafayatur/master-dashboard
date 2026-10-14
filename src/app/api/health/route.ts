import { timingSafeEqual } from 'node:crypto';
import { getHealthToken } from '@/lib/env';
import { queryConfig } from '@/lib/db/config';
import { querySource } from '@/lib/db/source';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function probe(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    // Only the error class/code is exposed; messages can contain host names.
    const code = (e as { code?: string }).code ?? (e as Error).name;
    return { ok: false, ms: Date.now() - t0, error: code };
  }
}

/** GET /api/health with header `x-health-token`. Reports connectivity of both databases. */
export async function GET(req: Request) {
  const token = getHealthToken();
  if (!token) return new Response(null, { status: 404 });
  if (!safeEqual(req.headers.get('x-health-token') ?? '', token)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const [source, config] = await Promise.all([
    probe(() => querySource('SELECT 1 AS ok')),
    probe(() => queryConfig('SELECT 1 AS ok')),
  ]);
  return Response.json({ ok: source.ok && config.ok, source, config }, { status: source.ok && config.ok ? 200 : 503 });
}
