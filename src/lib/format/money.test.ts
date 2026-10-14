import { describe, expect, it } from 'vitest';
import { deltaPct, formatInt, formatMoney, parseMoneyUnit } from './money';

describe('formatMoney', () => {
  it('compacts with K / M / B', () => {
    expect(formatMoney(21_110_000)).toBe('21.11M');
    expect(formatMoney(845_300)).toBe('845.3K');
    expect(formatMoney(1_200_000_000)).toBe('1.20B');
    expect(formatMoney(950)).toBe('950');
    expect(formatMoney(0)).toBe('0');
  });
  it('does not show 1000.0K or 1000.00M at unit boundaries', () => {
    expect(formatMoney(999_960)).toBe('1.00M');
    expect(formatMoney(999_996_000)).toBe('1.00B');
  });
  it('supports lakh / crore', () => {
    expect(formatMoney(21_110_000, 'lakh')).toBe('2.11 Cr');
    expect(formatMoney(4_530_000, 'lakh')).toBe('45.30 L');
    expect(formatMoney(52_000, 'lakh')).toBe('52,000');
  });
  it('handles negatives', () => {
    expect(formatMoney(-2_500_000)).toBe('-2.50M');
  });
});

describe('helpers', () => {
  it('formatInt groups thousands', () => expect(formatInt(1234567)).toBe('1,234,567'));
  it('parseMoneyUnit defaults to m', () => {
    expect(parseMoneyUnit(undefined)).toBe('m');
    expect(parseMoneyUnit('lakh')).toBe('lakh');
    expect(parseMoneyUnit('x')).toBe('m');
  });
  it('deltaPct', () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10);
    expect(deltaPct(50, 100)).toBeCloseTo(-50);
    expect(deltaPct(0, 0)).toBe(0);
    expect(deltaPct(5, 0)).toBeNull();
  });
});
