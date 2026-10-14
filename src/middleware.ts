import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/** Gate for every page and API route except the login screen, auth endpoints and the token-protected health check. */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  const passkeyHash = process.env.AUTH_PASSKEY_HASH ?? '';

  const ok =
    sessionSecret.length >= 32 &&
    passkeyHash.length > 0 &&
    (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, { sessionSecret, passkeyHash }));
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/health).*)'],
};
