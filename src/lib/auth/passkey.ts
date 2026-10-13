import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Passkey hash format: `scrypt:<N>:<saltB64url>:<hashB64url>`.
 * Separators are ':' (not '$') because Next.js expands `$VAR` inside .env files and would corrupt the value.
 */
const N = 16384;
const KEYLEN = 32;

export function hashPasskey(passkey: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passkey, salt, KEYLEN, { N });
  return `scrypt:${N}:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

export function verifyPasskey(passkey: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 1024 || n > 1 << 20) return false;
  const salt = Buffer.from(parts[2] ?? '', 'base64url');
  const expected = Buffer.from(parts[3] ?? '', 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(passkey, salt, expected.length, { N: n });
  return timingSafeEqual(actual, expected);
}
