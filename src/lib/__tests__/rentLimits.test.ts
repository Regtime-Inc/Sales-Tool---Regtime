import { describe, it, expect } from 'vitest';
import { getRentLimit, HPD_2025_RENTS, HPD_SCHEDULE_YEAR, NYC_METRO_AMI_100 } from '../rentLimits';

describe('getRentLimit', () => {
  it('returns exact match for Studio at 30% AMI', () => {
    expect(getRentLimit('Studio', 30)).toBe(850);
  });

  it('returns exact match for 1BR at 80% AMI', () => {
    expect(getRentLimit('1BR', 80)).toBe(2430);
  });

  it('returns exact match for 2BR at 60% AMI', () => {
    expect(getRentLimit('2BR', 60)).toBe(2187);
  });

  it('returns exact match for 3BR at 130% AMI', () => {
    expect(getRentLimit('3BR', 130)).toBe(5476);
  });

  it('returns exact match for Studio at 165% AMI', () => {
    expect(getRentLimit('Studio', 165)).toBe(4678);
  });

  it('returns exact match for 3BR at 100% AMI', () => {
    expect(getRentLimit('3BR', 100)).toBe(4212);
  });

  it('returns closest AMI band when exact match not available', () => {
    const result = getRentLimit('Studio', 45);
    expect(result).not.toBeNull();
    expect(result).toBe(getRentLimit('Studio', 40) ?? getRentLimit('Studio', 50));
  });

  it('returns null for unknown unit type', () => {
    expect(getRentLimit('5BR', 60)).toBeNull();
  });

  it('covers all expected AMI bands', () => {
    const expectedBands = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 165];
    for (const band of expectedBands) {
      expect(getRentLimit('Studio', band)).not.toBeNull();
      expect(getRentLimit('1BR', band)).not.toBeNull();
      expect(getRentLimit('2BR', band)).not.toBeNull();
      expect(getRentLimit('3BR', band)).not.toBeNull();
    }
  });

  it('enforces NSF < GSF ordering (lower AMI = lower rent)', () => {
    const bands = [30, 40, 50, 60, 70, 80, 100, 130, 165];
    for (let i = 0; i < bands.length - 1; i++) {
      const lower = getRentLimit('1BR', bands[i])!;
      const higher = getRentLimit('1BR', bands[i + 1])!;
      expect(lower).toBeLessThan(higher);
    }
  });

  it('enforces larger units have higher rents at same AMI', () => {
    const types = ['Studio', '1BR', '2BR', '3BR'];
    for (let i = 0; i < types.length - 1; i++) {
      const smaller = getRentLimit(types[i], 60)!;
      const larger = getRentLimit(types[i + 1], 60)!;
      expect(smaller).toBeLessThan(larger);
    }
  });
});

describe('HPD_2025_RENTS', () => {
  it('has entries for all 4 unit types and 12 AMI bands', () => {
    expect(HPD_2025_RENTS.length).toBe(48);
  });

  it('all entries have year 2025', () => {
    for (const entry of HPD_2025_RENTS) {
      expect(entry.year).toBe(2025);
    }
  });

  it('all rents are positive integers', () => {
    for (const entry of HPD_2025_RENTS) {
      expect(entry.maxMonthlyRent).toBeGreaterThan(0);
      expect(Number.isInteger(entry.maxMonthlyRent)).toBe(true);
    }
  });
});

describe('constants', () => {
  it('exports correct schedule year', () => {
    expect(HPD_SCHEDULE_YEAR).toBe(2025);
  });

  it('exports NYC Metro AMI at 100%', () => {
    expect(NYC_METRO_AMI_100).toBe(145800);
  });
});
