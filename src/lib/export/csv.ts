export interface Column<T> {
  header: string;
  value: (row: T) => string | number;
}

/**
 * Cells that a spreadsheet would run as a formula get a leading apostrophe (CSV injection).
 * Phone-like values such as "+8801712345678" are left alone.
 */
function safe(v: string): string {
  const risky = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-][\d\s().-]*$/.test(v));
  return risky ? `'${v}` : v;
}

function cell(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : safe(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 byte-order mark so Excel shows Bangla text correctly. */
export function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
