import { z } from 'zod';

const schema = z.object({
  /** Source (production) DB, read-only role. */
  SOURCE_DATABASE_URL: z.string().url(),
  /** 'require' = TLS on (default). The source server uses a self-signed cert, so verification is off by default. */
  SOURCE_DB_SSL: z.enum(['require', 'disable']).default('require'),
  SOURCE_DB_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SOURCE_DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(3),
  /** Neon DB that stores dashboard-owned data (targets, settings, export log). */
  CONFIG_DATABASE_URL: z.string().url(),
  /** Protects /api/health. If unset, the endpoint returns 404. */
  HEALTH_TOKEN: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated lazily so `next build` works without secrets. Throws a readable error listing the bad keys. */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}
