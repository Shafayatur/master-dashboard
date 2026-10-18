import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

const col = [{ header: 'Name', value: (r: { n: string; v: number }) => r.n }, { header: 'Value', value: (r: { n: string; v: number }) => r.v }];

describe('toCsv', () => {
  it('writes a BOM, CRLF line endings and plain cells', () => {
    expect(toCsv(col, [{ n: 'Ayesha', v: 1200.5 }])).toBe('\uFEFFName,Value\r\nAyesha,1200.5\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    const out = toCsv(col, [{ n: 'Rahman, "Rafi"\nDhaka', v: 1 }]);
    expect(out).toContain('"Rahman, ""Rafi""\nDhaka",1');
  });
  it('neutralises spreadsheet formulas but keeps phone numbers readable', () => {
    const out = toCsv(col, [{ n: '=HYPERLINK("x")', v: 1 }, { n: '@cmd', v: 1 }, { n: '-1+2', v: 1 }, { n: '+8801712345678', v: 1 }, { n: '+88 017-1234', v: 1 }]);
    expect(out).toContain(`"'=HYPERLINK(""x"")",1`);
    expect(out).toContain(`'@cmd,1`);
    expect(out).toContain(`'-1+2,1`);
    expect(out).toContain('\r\n+8801712345678,1');
    expect(out).toContain('\r\n+88 017-1234,1');
  });
  it('handles Bangla text and an empty list', () => {
    expect(toCsv(col, [{ n: 'রহমান', v: 2 }])).toContain('রহমান,2');
    expect(toCsv(col, [])).toBe('\uFEFFName,Value\r\n');
  });
});
