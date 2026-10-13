import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { getAuthEnv } from '@/lib/auth/env';
import { verifyPasskey } from '@/lib/auth/passkey';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from '@/lib/auth/session';
import { getLockState, hashIp, recordAttempt } from '@/lib/auth/login-attempts';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { queryConfig } from '@/lib/db/config';

export const dynamic = 'force-dynamic';

const body = z.object({ passkey: z.string().min(1).max(256) });

function clientIp(): string {
  const h = headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  let env;
  try {
    env = getAuthEnv();
  } catch {
    return Response.json({ error: 'Server is not configured' }, { status: 500 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter the passkey' }, { status: 400 });

  const ipHash = hashIp(clientIp(), env.sessionSecret);
  try {
    // Fail closed: if the attempt store is unavailable nobody can sign in.
    const lock = await getLockState(queryConfig, ipHash);
    if (lock.locked) {
      return Response.json(
        { error: 'Too many attempts. Try again later.', retryAfterSeconds: lock.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } },
      );
    }
    const ok = verifyPasskey(parsed.data.passkey, env.passkeyHash);
    await recordAttempt(queryConfig, ipHash, ok);
    if (!ok) return Response.json({ error: 'Incorrect passkey' }, { status: 401 });
  } catch (e) {
    console.error('[login] attempt store error:', (e as Error).message);
    return Response.json({ error: 'Sign-in is temporarily unavailable' }, { status: 503 });
  }

  cookies().set(SESSION_COOKIE, await createSessionToken(env), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return Response.json({ ok: true });
}
