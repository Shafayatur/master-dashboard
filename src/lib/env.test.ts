import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'pg-connection-string';
import { buildPoolConfig } from './db/pool-config';

const KEYS = [
  'SOURCE_DATABASE_URL', 'SOURCE_DB_HOST', 'SOURCE_DB_PORT', 'SOURCE_DB_USER', 'SOURCE_DB_PASSWORD',
  'SOURCE_DB_NAME', 'SOURCE_DB_SSL', 'SOURCE_DB_SSL_REJECT_UNAUTHORIZED', 'SOURCE_DB_POOL_MAX',
  'CONFIG_DATABASE_URL', 'HEALTH_TOKEN',
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  vi.resetModules();
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('source env', () => {
  it('builds the URL from separate parts and survives special characters in the password', async () => {
    Object.assign(process.env, {
      SOURCE_DB_HOST: 'db.example.test', SOURCE_DB_PORT: '6543', SOURCE_DB_USER: 'ro_user',
      SOURCE_DB_PASSWORD: 'p@ss:w/rd#?%&', SOURCE_DB_NAME: 'appdb',
    });
    const { getSourceEnv } = await import('./env');
    const c = parse(getSourceEnv().url);
    expect(c.host).toBe('db.example.test');
    expect(c.port).toBe('6543');
    expect(c.user).toBe('ro_user');
    expect(c.password).toBe('p@ss:w/rd#?%&');
    expect(c.database).toBe('appdb');
    // ...and through the pool config's own URL normalisation, which is what the app actually uses
    const pc = parse(buildPoolConfig(getSourceEnv().url, { ssl: false, max: 1, appName: 't' }).connectionString!);
    expect(pc.password).toBe('p@ss:w/rd#?%&');
    expect(pc.user).toBe('ro_user');
  });
  it('defaults the port to 5432 and treats blank values as unset', async () => {
    Object.assign(process.env, {
      SOURCE_DATABASE_URL: '', SOURCE_DB_PORT: '', SOURCE_DB_HOST: 'h', SOURCE_DB_USER: 'u',
      SOURCE_DB_PASSWORD: 'p', SOURCE_DB_NAME: 'd',
    });
    const { getSourceEnv } = await import('./env');
    expect(parse(getSourceEnv().url).port).toBe('5432');
  });
  it('accepts a full URL', async () => {
    process.env.SOURCE_DATABASE_URL = 'postgres://u:p@h:5432/d';
    const { getSourceEnv } = await import('./env');
    expect(getSourceEnv().url).toContain('@h:5432/d');
  });
  it('names the missing parts without echoing any value', async () => {
    process.env.SOURCE_DB_HOST = 'secret-host.example';
    const { getSourceEnv } = await import('./env');
    expect(() => getSourceEnv()).toThrow(/SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME/);
    expect(() => getSourceEnv()).not.toThrow(/secret-host/);
  });
  it('rejects a bare host pasted into the URL variable, with a helpful hint', async () => {
    process.env.SOURCE_DATABASE_URL = 'db.example.test';
    const { getSourceEnv } = await import('./env');
    expect(() => getSourceEnv()).toThrow(/SOURCE_DB_HOST/);
  });
});

describe('config env is independent of the source env', () => {
  it('works with only CONFIG_DATABASE_URL set', async () => {
    process.env.CONFIG_DATABASE_URL = 'postgres://u:p@ep-x-pooler.region.aws.neon.tech/neondb?sslmode=require';
    const { getConfigDbUrl } = await import('./env');
    expect(getConfigDbUrl()).toContain('neon.tech');
  });
});
