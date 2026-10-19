import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Column } from './csv';
import { safeSheetName, toXlsx } from './xlsx';

interface R {
  id: number;
  phone: string;
  name: string;
  amount: number;
  date: string;
}
const cols: Column<R>[] = [
  { header: 'Id', value: (r) => r.id, kind: 'int' },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Name', value: (r) => r.name },
  { header: 'Amount', value: (r) => r.amount, kind: 'money' },
  { header: 'Date', value: (r) => r.date, kind: 'date' },
];
const rows: R[] = [
  { id: 1, phone: '01711000001', name: '=HYPERLINK("http://x")', amount: 1200.5, date: '2026-10-03' },
  { id: 2, phone: '+8801711000002', name: 'রহমান', amount: 0, date: '' },
];

async function open(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

describe('toXlsx', () => {
  it('writes a frozen, filterable, bold header', async () => {
    const ws = await open(await toXlsx('Deposits', cols, rows));
    expect(ws.name).toBe('Deposits');
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Id', 'Phone', 'Name', 'Amount', 'Date']);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it('keeps numbers as numbers, dates as dates, and phone numbers as text', async () => {
    const ws = await open(await toXlsx('S', cols, rows));
    const r2 = ws.getRow(2);
    expect(r2.getCell(1).value).toBe(1);
    expect(r2.getCell(1).numFmt).toBe('#,##0');
    expect(r2.getCell(2).value).toBe('01711000001'); // leading zero survives
    expect(r2.getCell(4).value).toBe(1200.5);
    expect(r2.getCell(4).numFmt).toBe('#,##0.00');
    expect(r2.getCell(5).value).toEqual(new Date('2026-10-03T00:00:00Z'));
    expect(ws.getRow(3).getCell(2).value).toBe('+8801711000002');
    expect(ws.getRow(3).getCell(3).value).toBe('রহমান');
    expect(ws.getRow(3).getCell(5).value).toBeNull(); // an empty date stays empty, not a bogus date
  });

  it('never turns text into a formula', async () => {
    const ws = await open(await toXlsx('S', cols, rows));
    const c = ws.getRow(2).getCell(3);
    expect(c.value).toBe('=HYPERLINK("http://x")');
    expect(c.type).toBe(ExcelJS.ValueType.String);
  });

  it('works with no rows', async () => {
    const ws = await open(await toXlsx('Empty', cols, []));
    expect(ws.rowCount).toBe(1);
  });
});

describe('safeSheetName', () => {
  it('removes forbidden characters and caps the length at 31', () => {
    expect(safeSheetName('Deposits: 2026/10')).toBe('Deposits 2026 10');
    expect(safeSheetName('x'.repeat(50))).toHaveLength(31);
    expect(safeSheetName('///')).toBe('Sheet1');
  });
});
