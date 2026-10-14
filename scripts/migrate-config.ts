/* Applies db/config/*.sql to the Neon config database, in order, once each. Usage: npm run db:migrate */
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

config({ path: '.env.local' });

async function main(): Promise<void> {
  // Imported after dotenv so env validation sees the values.
  const { configPool } = await import('../src/lib/db/config');
  const pool = configPool();
  const dir = path.join(process.cwd(), 'db', 'config');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', (e as Error).message);
  process.exit(1);
});
