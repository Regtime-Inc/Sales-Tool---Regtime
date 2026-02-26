import { describe, it, expect } from 'vitest';
import { roundUnitsThreeQuarters } from '../rounding';

describe('roundUnitsThreeQuarters', () => {
  it('rounds down for fractions below 0.75', () => {
    expect(roundUnitsThreeQuarters(10.0)).toBe(10);
    expect(roundUnitsThreeQuarters(10.5)).toBe(10);
    expect(roundUnitsThreeQuarters(10.74)).toBe(10);
    expect(roundUnitsThreeQuarters(10.7499)).toBe(10);
  });
  it('rounds up at exactly 0.75', () => {
    expect(roundUnitsThreeQuarters(10.75)).toBe(11);
  });
  it('rounds up for fractions above 0.75', () => {
    expect(roundUnitsThreeQuarters(10.76)).toBe(11);
    expect(roundUnitsThreeQuarters(10.99)).toBe(11);
  });
  it('handles zero', () => {
    expect(roundUnitsThreeQuarters(0)).toBe(0);
  });
  it('handles small values', () => {
    expect(roundUnitsThreeQuarters(0.74)).toBe(0);
    expect(roundUnitsThreeQuarters(0.75)).toBe(1);
  });
});
