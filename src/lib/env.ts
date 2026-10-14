import { z } from 'zod';

/**
 * Environment is validated per concern, lazily, so a script that needs only one database
 * (for example `db:migrate` needs only the Neon config DB) does not fail on the other's variables,
 * and `next build` works without any secrets.
 */

const empty = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());

const sourceSchema = z.object({
  /** Option A: one full connection URL. */
  SOURCE_DATABASE_URL: opt(z.string().url()),
  /** Option B: separate parts (no URL-encoding worries for special characters in the password). */
  SOURCE_DB_HOST: opt(z.string().min(1)),
  SOURCE_DB_PORT: z.preprocess(empty, z.coerce.number().int().min(1).max(65535).default(5432)),
  SOURCE_DB_USER: opt(z.string().min(1)),
  SOURCE_DB_PASSWORD: opt(z.string().min(1)),
  SOURCE_DB_NAME: opt(z.string().min(1)),
  /** 'require' = TLS on (default). The source server uses a self-signed cert, so verification is off by default. */
  SOURCE_DB_SSL: z.preprocess(empty, z.enum(['require', 'disable']).default('require')),
  SOURCE_DB_SSL_REJECT_UNAUTHORIZED: z.preprocess(empty, z.enum(['true', 'false']).default('false')).transform((v) => v === 'true'),
  SOURCE_DB_POOL_MAX: z.preprocess(empty, z.coerce.number().int().min(1).max(10).default(3)),
});

export interface SourceEnv {
  /** Resolved connection string (built from the parts when no URL is given). */
  url: string;
  ssl: 'require' | 'disable';
  sslRejectUnauthorized: boolean;
  poolMax: number;
}

/**
 * Builds a postgres URL from parts. User and password are encoded explicitly with encodeURIComponent:
 * the WHATWG URL setters leave characters such as `%` and `&` untouched, which breaks passwords containing them.
 */
export function buildPgUrl(p: { host: string; port: number; user: string; password: string; database: string }): string {
  const host = p.host.includes(':') && !p.host.startsWith('[') ? `[${p.host}]` : p.host; // IPv6 literal
  return `postgres://${encodeURIComponent(p.user)}:${encodeURIComponent(p.password)}@${host}:${p.port}/${encodeURIComponent(p.database)}`;
}

const SOURCE_HINT =
  'Set SOURCE_DATABASE_URL (postgres://user:password@host:5432/database) OR all of SOURCE_DB_HOST, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME (SOURCE_DB_PORT optional).';

let sourceCache: SourceEnv | undefined;

export function getSourceEnv(): SourceEnv {
  if (sourceCache) return sourceCache;
  const parsed = sourceSchema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid source DB variables: ${keys}. ${SOURCE_HINT}`);
  }
  const e = parsed.data;
  let url = e.SOURCE_DATABASE_URL;
  if (!url) {
    const missing = (
      [
        ['SOURCE_DB_HOST', e.SOURCE_DB_HOST],
        ['SOURCE_DB_USER', e.SOURCE_DB_USER],
        ['SOURCE_DB_PASSWORD', e.SOURCE_DB_PASSWORD],
        ['SOURCE_DB_NAME', e.SOURCE_DB_NAME],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) throw new Error(`Missing source DB variables: ${missing.join(', ')}. ${SOURCE_HINT}`);
    url = buildPgUrl({
      host: e.SOURCE_DB_HOST!,
      port: e.SOURCE_DB_PORT,
      user: e.SOURCE_DB_USER!,
      password: e.SOURCE_DB_PASSWORD!,
      database: e.SOURCE_DB_NAME!,
    });
  }
  sourceCache = { url, ssl: e.SOURCE_DB_SSL, sslRejectUnauthorized: e.SOURCE_DB_SSL_REJECT_UNAUTHORIZED, poolMax: e.SOURCE_DB_POOL_MAX };
  return sourceCache;
}

const configSchema = z.object({
  /** Neon DB that stores dashboard-owned data (targets, settings, export log). Use the POOLED connection string. */
  CONFIG_DATABASE_URL: z.string().url(),
});

let configCache: string | undefined;

export function getConfigDbUrl(): string {
  if (configCache) return configCache;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      'Invalid or missing CONFIG_DATABASE_URL. It must be the full Neon connection string (postgres://user:password@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require).',
    );
  }
  configCache = parsed.data.CONFIG_DATABASE_URL;
  return configCache;
}

/** Protects /api/health. If unset (or shorter than 16 chars) the endpoint returns 404. */
export function getHealthToken(): string | undefined {
  const t = process.env.HEALTH_TOKEN;
  return t && t.length >= 16 ? t : undefined;
}
