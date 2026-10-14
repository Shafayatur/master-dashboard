import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPasskey, verifyPasskey } from './passkey';
import { SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from './session';
import { safeNextPath } from './safe-next';
import { isSameOrigin } from './same-origin';
import { MAX_FAILS_PER_IP, getLockState, hashIp, recordAttempt, type Query } from './login-attempts';

const keys = { sessionSecret: 's'.repeat(40), passkeyHash: 'scrypt:16384:abc:def' };

describe('passkey hashing', () => {
  const stored = hashPasskey('correct horse battery');
  it('has an env-safe format (no $)', () => {
    expect(stored).toMatch(/^scrypt:\d+:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain('$');
  });
  it('accepts the right passkey and rejects others', () => {
    expect(verifyPasskey('correct horse battery', stored)).toBe(true);
    expect(verifyPasskey('wrong', stored)).toBe(false);
  });
  it('rejects malformed hashes', () => {
    expect(verifyPasskey('x', 'garbage')).toBe(false);
    expect(verifyPasskey('x', 'scrypt:1:a:b')).toBe(false);
  });
  it('salts: same passkey hashes differently', () => {
    expect(hashPasskey('same-passkey-12')).not.toBe(hashPasskey('same-passkey-12'));
  });
});

describe('session token', () => {
  const now = Date.UTC(2026, 9, 13);
  it('round-trips', async () => {
    expect(await verifySessionToken(await createSessionToken(keys, now), keys, now + 1000)).toBe(true);
  });
  it('expires', async () => {
    const t = await createSessionToken(keys, now);
    expect(await verifySessionToken(t, keys, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
  });
  it('rejects tampering, other secrets and junk', async () => {
    const t = await createSessionToken(keys, now);
    const [v, exp, sig] = t.split('.');
    expect(await verifySessionToken(`${v}.${Number(exp) + 99999}.${sig}`, keys, now)).toBe(false);
    expect(await verifySessionToken(t, { ...keys, sessionSecret: 'x'.repeat(40) }, now)).toBe(false);
    expect(await verifySessionToken('nope', keys, now)).toBe(false);
    expect(await verifySessionToken(undefined, keys, now)).toBe(false);
  });
  it('is invalidated when the passkey hash changes', async () => {
    const t = await createSessionToken(keys, now);
    expect(await verifySessionToken(t, { ...keys, passkeyHash: 'scrypt:16384:new:new' }, now)).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('allows only same-site relative paths', () => {
    expect(safeNextPath('/sales?from=2026-10-01')).toBe('/sales?from=2026-10-01');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/login', '/api/health', '', null, undefined]) {
      expect(safeNextPath(bad as string | null)).toBe('/');
    }
  });
});

describe('isSameOrigin', () => {
  const req = (h: Record<string, string>) => new Request('http://x/api', { method: 'POST', headers: h });
  it('matches origin to host', () => {
    expect(isSameOrigin(req({ origin: 'https://app.test', host: 'app.test' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://evil.test', host: 'app.test' }))).toBe(false);
    expect(isSameOrigin(req({ host: 'app.test' }))).toBe(true);
  });
});

describe('login attempt limiter (PGlite)', () => {
  let db: PGlite;
  let query: Query;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(readFileSync(path.join(process.cwd(), 'db/config/001_init.sql'), 'utf8'));
    query = (async (text: string, params?: unknown[]) => (await db.query(text, params)).rows) as Query;
  });

  it('locks an IP after repeated failures but not other IPs', async () => {
    const a = hashIp('1.1.1.1', 'secret');
    const b = hashIp('2.2.2.2', 'secret');
    expect((await getLockState(query, a)).locked).toBe(false);
    for (let i = 0; i < MAX_FAILS_PER_IP; i++) await recordAttempt(query, a, false);
    const lock = await getLockState(query, a);
    expect(lock.locked).toBe(true);
    expect(lock.retryAfterSeconds).toBeGreaterThan(0);
    expect((await getLockState(query, b)).locked).toBe(false);
  });

  it('successes do not count toward the lock', async () => {
    const c = hashIp('3.3.3.3', 'secret');
    for (let i = 0; i < 10; i++) await recordAttempt(query, c, true);
    expect((await getLockState(query, c)).locked).toBe(false);
  });
});
