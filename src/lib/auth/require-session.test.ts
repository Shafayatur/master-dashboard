import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from './session';

const state: { token?: string; cookiesError?: Error } = {};
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/headers', () => ({
  cookies: () => {
    if (state.cookiesError) throw state.cookiesError;
    return { get: () => (state.token ? { value: state.token } : undefined) };
  },
}));
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

const keys = { sessionSecret: 's'.repeat(40), passkeyHash: 'scrypt:16384:abc:def' };

beforeEach(() => {
  process.env.SESSION_SECRET = keys.sessionSecret;
  process.env.AUTH_PASSKEY_HASH = keys.passkeyHash;
  state.token = undefined;
  state.cookiesError = undefined;
  redirect.mockClear();
});

describe('requireSession', () => {
  it('lets a valid session through', async () => {
    const { requireSession, requireSessionApi } = await import('./require-session');
    state.token = await createSessionToken(keys);
    await expect(requireSession()).resolves.toBeUndefined();
    await expect(requireSessionApi()).resolves.toBeNull();
  });
  it('redirects pages and returns 401 for APIs without a session', async () => {
    const { requireSession, requireSessionApi } = await import('./require-session');
    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
    const res = await requireSessionApi();
    expect(res?.status).toBe(401);
  });
  it('fails closed when the auth configuration is missing', async () => {
    const { requireSessionApi } = await import('./require-session');
    state.token = await createSessionToken(keys);
    delete process.env.SESSION_SECRET;
    expect((await requireSessionApi())?.status).toBe(401);
  });
});

describe('static-prerender safety', () => {
  it("does not swallow Next's dynamic-rendering signal (that once baked a login redirect into static pages)", async () => {
    const { requireSession } = await import('./require-session');
    state.cookiesError = Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' });
    await expect(requireSession()).rejects.toThrow('Dynamic server usage');
    expect(redirect).not.toHaveBeenCalled();
  });
  it('keeps the app layout dynamic', () => {
    const layout = readFileSync(path.join(process.cwd(), 'src/app/(app)/layout.tsx'), 'utf8');
    expect(layout).toMatch(/export const dynamic = 'force-dynamic'/);
  });
});

/** Guardrail: every page and route handler must check the session itself, except the explicit allow-list. */
describe('every page and route handler checks the session', () => {
  const root = path.join(process.cwd(), 'src/app');
  const exempt = new Set([
    'login/page.tsx', // public sign-in screen
    'api/auth/login/route.ts', // creates the session
    'api/auth/logout/route.ts', // only clears the cookie
    'api/health/route.ts', // protected by its own token
  ]);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const full = path.join(dir, f);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const files = walk(root).filter((f) => /(^|\/)(page\.tsx|route\.ts)$/.test(f));

  it('finds the app files', () => expect(files.length).toBeGreaterThan(8));

  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (exempt.has(rel)) continue;
    it(`${rel} calls requireSession`, () => {
      expect(readFileSync(f, 'utf8')).toMatch(/requireSession(Api)?\(/);
    });
  }
});
