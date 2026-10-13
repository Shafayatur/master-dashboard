/*
 * Data sanity report for the source DB. Aggregate counts only, no investor-level data,
 * so the output is safe to share. Usage: npm run db:check  ->  reports/sanity-<date>.md
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SANITY_CHECKS } from '../src/lib/sanity/checks';

config({ path: '.env.local' });

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function toMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '_no rows_';
  const cols = Object.keys(rows[0] as object);
  const head = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n');
  return `${head}\n${body}`;
}

async function main(): Promise<void> {
  const { querySource, sourcePool } = await import('../src/lib/db/source');
  sourcePool(); // fail fast if env is missing/invalid
  const out: string[] = [
    `# Source data sanity report`,
    `Generated ${new Date().toISOString()} - aggregate counts only, no investor-level data.\n`,
  ];
  let failed = 0;

  for (const c of SANITY_CHECKS) {
    process.stdout.write(`${c.title} ... `);
    out.push(`## ${c.title}`, `_${c.why}_\n`);
    try {
      const rows = await querySource(c.sql);
      out.push(toMarkdownTable(rows), '');
      console.log(`ok (${rows.length} rows)`);
    } catch (e) {
      failed++;
      out.push(`**Check failed:** \`${(e as Error).message}\`\n`);
      console.log(`FAILED: ${(e as Error).message}`);
    }
  }

  mkdirSync('reports', { recursive: true });
  const file = `reports/sanity-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, out.join('\n'));
  console.log(`\nReport written to ${file} (${failed} failed checks). Paste its contents back to Claude.`);
  await sourcePool().end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Sanity check aborted:', (e as Error).message);
  process.exit(1);
});
