import { describe, it, expect } from 'vitest';
import {
  calcTotalProjectedUnits,
  calcRequiredAffordableUnits,
  calcMarketRateUnits,
  formatAffordableExplanation,
  AVG_UNIT_SF,
} from '../unitMath';

describe('calcTotalProjectedUnits', () => {
  it('returns 75 for 52500 SF at default 700 avg', () => {
    expect(calcTotalProjectedUnits(52500)).toBe(75);
  });

  it('returns 0 for zero or negative', () => {
    expect(calcTotalProjectedUnits(0)).toBe(0);
    expect(calcTotalProjectedUnits(-1000)).toBe(0);
  });

  it('applies 0.75 rounding rule for partial units', () => {
    expect(calcTotalProjectedUnits(1050)).toBe(1);
    expect(calcTotalProjectedUnits(1400)).toBe(2);
    expect(calcTotalProjectedUnits(1399)).toBe(2);
    expect(calcTotalProjectedUnits(1224)).toBe(1);
    expect(calcTotalProjectedUnits(1225)).toBe(2);
  });

  it('uses custom duFactor when provided', () => {
    expect(calcTotalProjectedUnits(17430, 680)).toBe(25);
    expect(calcTotalProjectedUnits(52500, 680)).toBe(77);
    expect(calcTotalProjectedUnits(60200, 680)).toBe(88);
  });

  it('applies 0.75 rounding with custom duFactor', () => {
    expect(calcTotalProjectedUnits(1360, 680)).toBe(2);
    expect(calcTotalProjectedUnits(1359, 680)).toBe(2);
    expect(calcTotalProjectedUnits(679, 680)).toBe(1);
    expect(calcTotalProjectedUnits(680, 680)).toBe(1);
    expect(calcTotalProjectedUnits(1189, 680)).toBe(1);
    expect(calcTotalProjectedUnits(1190, 680)).toBe(2);
  });
});

describe('calcRequiredAffordableUnits', () => {
  it('returns 19 for 75 units at 25% (2693 Atlantic Ave regression)', () => {
    expect(calcRequiredAffordableUnits(75, 0.25)).toBe(19);
  });

  it('uses ceiling rounding', () => {
    expect(calcRequiredAffordableUnits(100, 0.25)).toBe(25);
    expect(calcRequiredAffordableUnits(101, 0.25)).toBe(26);
    expect(calcRequiredAffordableUnits(10, 0.30)).toBe(3);
    expect(calcRequiredAffordableUnits(7, 0.25)).toBe(2);
  });

  it('handles pct > 1 as percentage (e.g. 25 means 25%)', () => {
    expect(calcRequiredAffordableUnits(75, 25)).toBe(19);
    expect(calcRequiredAffordableUnits(100, 30)).toBe(30);
  });

  it('clamps pct > 100 to 100%', () => {
    expect(calcRequiredAffordableUnits(75, 200)).toBe(75);
  });

  it('returns 0 for zero or negative inputs', () => {
    expect(calcRequiredAffordableUnits(0, 0.25)).toBe(0);
    expect(calcRequiredAffordableUnits(-10, 0.25)).toBe(0);
    expect(calcRequiredAffordableUnits(75, 0)).toBe(0);
    expect(calcRequiredAffordableUnits(75, -0.1)).toBe(0);
  });
});

describe('calcMarketRateUnits', () => {
  it('returns total minus affordable', () => {
    expect(calcMarketRateUnits(75, 19)).toBe(56);
  });

  it('never goes negative', () => {
    expect(calcMarketRateUnits(5, 10)).toBe(0);
  });
});

describe('formatAffordableExplanation', () => {
  it('formats 75 × 25% correctly', () => {
    const result = formatAffordableExplanation(75, 0.25);
    expect(result).toContain('75');
    expect(result).toContain('25%');
    expect(result).toContain('19');
  });
});

describe('AVG_UNIT_SF', () => {
  it('is 700', () => {
    expect(AVG_UNIT_SF).toBe(700);
  });
});
