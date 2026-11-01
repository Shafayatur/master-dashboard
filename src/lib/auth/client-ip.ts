export function clientIp(headers: Pick<Headers, 'get'>): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const vercelForwardedFor = headers.get('x-vercel-forwarded-for')?.trim();
  if (vercelForwardedFor) return vercelForwardedFor;

  const forwardedFor = headers.get('x-forwarded-for');
  const entries = forwardedFor?.split(',');
  const lastEntry = entries?.[entries.length - 1]?.trim();
  return lastEntry || 'unknown';
}
