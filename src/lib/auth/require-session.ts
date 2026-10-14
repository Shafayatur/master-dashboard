import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthEnv } from './env';
import { SESSION_COOKIE, verifySessionToken } from './session';

/**
 * Defence in depth. The middleware is the first gate, but pages and route handlers query the database
 * directly, so each one re-checks the session itself (layouts do not re-run on client navigation, and
 * middleware-only auth has had bypass bugs). Fails closed: a missing or invalid auth config means no session.
 */
export async function hasValidSession(): Promise<boolean> {
  // cookies() must stay OUTSIDE the try/catch: during a build it throws Next's "this route is dynamic" signal,
  // and swallowing it would let Next prerender the logged-out redirect as a static page for everyone.
  const token = cookies().get(SESSION_COOKIE)?.value;
  try {
    return await verifySessionToken(token, getAuthEnv());
  } catch {
    return false;
  }
}

/** Call at the top of every page: redirects to the login screen when there is no valid session. */
export async function requireSession(): Promise<void> {
  if (!(await hasValidSession())) redirect('/login');
}

/** Call at the top of every route handler: returns a 401 response to send, or null when the session is valid. */
export async function requireSessionApi(): Promise<Response | null> {
  return (await hasValidSession()) ? null : Response.json({ error: 'unauthorized' }, { status: 401 });
}
