/**
 * Signed session token, HMAC-SHA256 via Web Crypto so it runs in both the edge middleware and Node.
 * Token: `v1.<expiresAtEpochSeconds>.<signatureB64url>`.
 * The signing key mixes SESSION_SECRET with the passkey hash, so changing the passkey signs everyone out.
 */
export const SESSION_COOKIE = 'md_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SessionKeys {
  sessionSecret: string;
  passkeyHash: string;
}

const keyOf = (k: SessionKeys) => `${k.sessionSecret}:${k.passkeyHash}`;

export async function createSessionToken(keys: SessionKeys, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const body = `v1.${exp}`;
  return `${body}.${await hmac(keyOf(keys), body)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  keys: SessionKeys,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return false;
  const expected = await hmac(keyOf(keys), `v1.${exp}`);
  return constantTimeEqual(expected, parts[2] ?? '');
}
