import ExcelJS from 'exceljs';
import type { Column } from './csv';

const FORMATS = { int: '#,##0', money: '#,##0.00', date: 'yyyy-mm-dd' } as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WIDTH = 48;

/** Excel sheet names: at most 31 characters, none of \ / ? * [ ] : */
export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet1';
}

/**
 * One-sheet workbook with a bold, frozen, filterable header. Numbers stay numbers, dates become real dates,
 * and text (phone numbers with leading zeros, anything starting with "=") stays text, so nothing runs as a formula.
 */
export async function toXlsx<T>(sheetName: string, columns: Column<T>[], rows: T[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(safeSheetName(sheetName), { views: [{ state: 'frozen', ySplit: 1 }] });

  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  const widths = columns.map((c) => c.header.length);
  rows.forEach((r, ri) => {
    const row = ws.addRow([]);
    columns.forEach((c, ci) => {
      const v = c.value(r);
      const cell = row.getCell(ci + 1);
      if (v === '') {
        // leave empty cells empty
      } else if (typeof v === 'number') {
        cell.value = v;
        if (c.kind === 'int' || c.kind === 'money') cell.numFmt = FORMATS[c.kind];
      } else if (c.kind === 'date' && YMD.test(v)) {
        cell.value = new Date(`${v}T00:00:00Z`);
        cell.numFmt = FORMATS.date;
      } else {
        cell.value = v;
      }
      if (ri < 200) widths[ci] = Math.max(widths[ci] ?? 0, String(v).length);
    });
  });

  columns.forEach((_, i) => {
    ws.getColumn(i + 1).width = Math.min(MAX_WIDTH, Math.max(10, (widths[i] ?? 0) + 2));
  });
  if (columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
