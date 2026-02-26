import { describe, it, expect } from 'vitest';
import { computeAssemblage, selectFar, hasMultipleZoningDistricts } from '../compute';
import type { AssemblageLot } from '../../../types/pdf';

function makeLot(overrides: Partial<AssemblageLot> = {}): AssemblageLot {
  return {
    bbl: '1000010001',
    address: '123 Test St',
    lotArea: 5000,
    existingBldgArea: 2000,
    residFar: 6.0,
    commFar: 4.0,
    facilFar: 2.0,
    zoneDist: 'R7A',
    isPrimary: false,
    ...overrides,
  };
}

describe('selectFar', () => {
  it('returns 0 for empty array', () => {
    expect(selectFar([], 'most_restrictive')).toBe(0);
  });

  it('returns minimum for most_restrictive', () => {
    expect(selectFar([6.0, 4.0, 8.0], 'most_restrictive')).toBe(4.0);
  });

  it('returns maximum for least_restrictive', () => {
    expect(selectFar([6.0, 4.0, 8.0], 'least_restrictive')).toBe(8.0);
  });

  it('returns minimum for manual mode (default fallback)', () => {
    expect(selectFar([6.0, 4.0, 8.0], 'manual')).toBe(4.0);
  });
});

describe('hasMultipleZoningDistricts', () => {
  it('returns false for single zone', () => {
    const lots = [makeLot({ zoneDist: 'R7A' }), makeLot({ zoneDist: 'R7A' })];
    expect(hasMultipleZoningDistricts(lots)).toBe(false);
  });

  it('returns true for different zones', () => {
    const lots = [makeLot({ zoneDist: 'R7A' }), makeLot({ zoneDist: 'C6-2' })];
    expect(hasMultipleZoningDistricts(lots)).toBe(true);
  });

  it('ignores empty zone strings', () => {
    const lots = [makeLot({ zoneDist: 'R7A' }), makeLot({ zoneDist: '' })];
    expect(hasMultipleZoningDistricts(lots)).toBe(false);
  });
});

describe('computeAssemblage', () => {
  it('sums lot areas', () => {
    const lots = [
      makeLot({ lotArea: 5000, isPrimary: true }),
      makeLot({ lotArea: 3000 }),
    ];
    const result = computeAssemblage(lots, 'most_restrictive');
    expect(result.totalLotArea).toBe(8000);
  });

  it('sums existing building areas', () => {
    const lots = [
      makeLot({ existingBldgArea: 2000, isPrimary: true }),
      makeLot({ existingBldgArea: 1500 }),
    ];
    const result = computeAssemblage(lots, 'most_restrictive');
    expect(result.totalExistingBldgArea).toBe(3500);
  });

  it('uses minimum FAR for most_restrictive mode', () => {
    const lots = [
      makeLot({ residFar: 6.0, isPrimary: true }),
      makeLot({ residFar: 4.0 }),
    ];
    const result = computeAssemblage(lots, 'most_restrictive');
    expect(result.effectiveResidFar).toBe(4.0);
  });

  it('uses maximum FAR for least_restrictive mode', () => {
    const lots = [
      makeLot({ residFar: 6.0, isPrimary: true }),
      makeLot({ residFar: 4.0 }),
    ];
    const result = computeAssemblage(lots, 'least_restrictive');
    expect(result.effectiveResidFar).toBe(6.0);
  });

  it('uses manual FAR override in manual mode', () => {
    const lots = [
      makeLot({ residFar: 6.0, isPrimary: true }),
      makeLot({ residFar: 4.0 }),
    ];
    const result = computeAssemblage(lots, 'manual', { resid: 5.5 });
    expect(result.effectiveResidFar).toBe(5.5);
  });

  it('falls back to most_restrictive for manual mode without override', () => {
    const lots = [
      makeLot({ residFar: 6.0, isPrimary: true }),
      makeLot({ residFar: 4.0 }),
    ];
    const result = computeAssemblage(lots, 'manual');
    expect(result.effectiveResidFar).toBe(4.0);
  });

  it('uses primary lot zoning district as effective', () => {
    const lots = [
      makeLot({ zoneDist: 'R7A', isPrimary: true }),
      makeLot({ zoneDist: 'C6-2' }),
    ];
    const result = computeAssemblage(lots, 'most_restrictive');
    expect(result.effectiveZoneDist).toBe('R7A');
  });

  it('falls back to first lot zone when no primary', () => {
    const lots = [
      makeLot({ zoneDist: 'C6-2' }),
      makeLot({ zoneDist: 'R7A' }),
    ];
    const result = computeAssemblage(lots, 'most_restrictive');
    expect(result.effectiveZoneDist).toBe('C6-2');
  });

  it('stores farSelectionMode correctly', () => {
    const lots = [makeLot({ isPrimary: true })];
    expect(computeAssemblage(lots, 'most_restrictive').farSelectionMode).toBe('most_restrictive');
    expect(computeAssemblage(lots, 'least_restrictive').farSelectionMode).toBe('least_restrictive');
    expect(computeAssemblage(lots, 'manual').farSelectionMode).toBe('manual');
  });

  it('handles commercial and facility FAR correctly', () => {
    const lots = [
      makeLot({ commFar: 6.0, facilFar: 3.0, isPrimary: true }),
      makeLot({ commFar: 4.0, facilFar: 5.0 }),
    ];
    const restrictive = computeAssemblage(lots, 'most_restrictive');
    expect(restrictive.effectiveCommFar).toBe(4.0);
    expect(restrictive.effectiveFacilFar).toBe(3.0);

    const permissive = computeAssemblage(lots, 'least_restrictive');
    expect(permissive.effectiveCommFar).toBe(6.0);
    expect(permissive.effectiveFacilFar).toBe(5.0);
  });
});
