import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  cookies().set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return Response.json({ ok: true });
}
