/**
 * Auth-only env. Kept separate from `getEnv()` because the middleware (edge runtime) needs just these two
 * values and must not require the database URLs.
 */
export interface AuthEnv {
  passkeyHash: string;
  sessionSecret: string;
}

export function getAuthEnv(): AuthEnv {
  const passkeyHash = process.env.AUTH_PASSKEY_HASH ?? '';
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (!/^scrypt:\d+:[\w-]+:[\w-]+$/.test(passkeyHash) || sessionSecret.length < 32) {
    throw new Error('Invalid or missing environment variables: AUTH_PASSKEY_HASH, SESSION_SECRET');
  }
  return { passkeyHash, sessionSecret };
}
