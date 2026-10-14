/**
 * Defence in depth for the source-database connection. The real protection is the read-only DB role;
 * this guard makes sure no code path can even *send* anything but a single SELECT/WITH query.
 */
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|vacuum|merge|set|reset|lock|listen|notify|into)\b/i;

function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

export function assertReadOnlySql(sql: string): void {
  const s = stripLiteralsAndComments(sql).trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(s)) throw new Error('Only SELECT/WITH queries are allowed');
  if (s.includes(';')) throw new Error('Multiple statements are not allowed');
  const hit = FORBIDDEN.exec(s);
  if (hit) throw new Error(`Forbidden keyword in query: ${hit[1]}`);
}
