/** Only same-site relative paths are allowed as a post-login redirect (blocks open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (next.startsWith('/login') || next.startsWith('/api/')) return '/';
  return next;
}
