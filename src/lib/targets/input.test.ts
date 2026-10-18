import { describe, expect, it } from 'vitest';
import { parseAmount, parseMonthKey, parseTargetInput } from './input';

const TODAY = '2026-10-14';

describe('parseMonthKey', () => {
  it('accepts YYYY-MM and YYYY-MM-01', () => {
    expect(parseMonthKey('2026-10')).toBe('2026-10-01');
    expect(parseMonthKey('2026-10-01')).toBe('2026-10-01');
  });
  it('rejects anything else', () => {
    for (const v of ['', '2026-13', '2026-10-15', '10/2026', 'abc']) expect(parseMonthKey(v)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('strips separators', () => {
    expect(parseAmount('30,000,000')).toBe(30000000);
    expect(parseAmount(' 1 250 000.50 ')).toBe(1250000.5);
  });
  it('rejects zero, negatives, junk, 3 decimals and absurd sizes', () => {
    for (const v of ['0', '-5', '1e9', 'abc', '10.123', '', '9999999999999']) expect(parseAmount(v), v).toBeNull();
  });
});

describe('parseTargetInput', () => {
  it('returns normalised values', () => {
    expect(parseTargetInput({ month: '2026-10', amount: '30,000,000', note: '  Q4 push ' }, TODAY)).toEqual({
      ok: true,
      value: { month: '2026-10-01', amount: 30000000, note: 'Q4 push' },
    });
    expect(parseTargetInput({ month: '2026-10', amount: '5' }, TODAY)).toMatchObject({ ok: true, value: { note: null } });
  });
  it('rejects months far outside the window (typos)', () => {
    expect(parseTargetInput({ month: '2062-10', amount: '5' }, TODAY)).toMatchObject({ ok: false });
    expect(parseTargetInput({ month: '2020-01', amount: '5' }, TODAY)).toMatchObject({ ok: false });
  });
  it('explains each failure', () => {
    expect(parseTargetInput({ month: '', amount: '5' }, TODAY)).toEqual({ ok: false, error: 'Choose a month.' });
    expect(parseTargetInput({ month: '2026-10', amount: 'x' }, TODAY)).toMatchObject({ ok: false });
    expect(parseTargetInput({ month: '2026-10', amount: '5', note: 'x'.repeat(201) }, TODAY)).toMatchObject({ ok: false });
  });
});
