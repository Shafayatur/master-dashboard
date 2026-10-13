/** CSRF defence for state-changing requests: if the browser sent an Origin header it must match the host. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients; the session cookie is still required elsewhere
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
