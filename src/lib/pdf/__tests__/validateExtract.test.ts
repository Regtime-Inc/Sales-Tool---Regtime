import { describe, it, expect } from 'vitest';
import { validateExtraction } from '../validateExtract';
import type { NormalizedPlanExtract } from '../../../types/pdf';

function makeExtract(overrides: Partial<NormalizedPlanExtract> = {}): NormalizedPlanExtract {
  return {
    totals: { totalUnits: 100, affordableUnits: 25, marketUnits: 75 },
    unitMix: { studio: 20, br1: 40, br2: 30, br3: 10, br4plus: null },
    unitSizes: { byType: {}, avgByType: {} },
    zoning: { lotAreaSf: 10000, zoningFloorAreaSf: 60000, far: 6.0 },
    evidence: [],
    confidence: { overall: 0.85, warnings: [] },
    ...overrides,
  };
}

describe('validateExtraction', () => {
  it('returns no warnings for consistent data', () => {
    const result = validateExtraction(makeExtract());
    expect(result.warnings).toHaveLength(0);
    expect(result.adjustedConfidence).toBe(0.85);
  });

  it('warns on FAR inconsistency', () => {
    const extract = makeExtract({
      zoning: { lotAreaSf: 10000, zoningFloorAreaSf: 60000, far: 8.0 },
    });
    const result = validateExtraction(extract);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('FAR inconsistency');
    expect(result.adjustedConfidence).toBeLessThan(0.85);
  });

  it('warns on unit count mismatch', () => {
    const extract = makeExtract({
      totals: { totalUnits: 100, affordableUnits: 25, marketUnits: 75 },
      unitMix: { studio: 10, br1: 20, br2: 20, br3: 5, br4plus: null },
    });
    const result = validateExtraction(extract);
    expect(result.warnings.some((w) => w.includes('Unit count mismatch'))).toBe(true);
  });

  it('warns on unusual unit sizes', () => {
    const extract = makeExtract({
      unitSizes: {
        byType: { Studio: [200, 210, 190] },
        avgByType: { Studio: 200 },
      },
    });
    const result = validateExtraction(extract);
    expect(result.warnings.some((w) => w.includes('Studio avg size'))).toBe(true);
  });

  it('warns on PLUTO lot area mismatch', () => {
    const extract = makeExtract();
    const pluto = { lotarea: 15000, residfar: 6.0, bldgarea: 5000 };
    const result = validateExtraction(extract, pluto);
    expect(result.warnings.some((w) => w.includes('Lot area mismatch'))).toBe(true);
  });

  it('warns when extracted FAR exceeds PLUTO FAR', () => {
    const extract = makeExtract({
      zoning: { lotAreaSf: 10000, zoningFloorAreaSf: 80000, far: 8.0 },
    });
    const pluto = { lotarea: 10000, residfar: 6.0, bldgarea: 5000 };
    const result = validateExtraction(extract, pluto);
    expect(result.warnings.some((w) => w.includes('exceeds PLUTO'))).toBe(true);
  });

  it('handles null zoning fields gracefully', () => {
    const extract = makeExtract({
      zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: null },
    });
    const result = validateExtraction(extract);
    expect(result.warnings).toHaveLength(0);
  });

  it('clamps adjusted confidence to minimum 0.1', () => {
    const extract = makeExtract({
      confidence: { overall: 0.15, warnings: [] },
      zoning: { lotAreaSf: 10000, zoningFloorAreaSf: 60000, far: 10.0 },
    });
    const pluto = { lotarea: 20000, residfar: 3.0, bldgarea: 5000 };
    const result = validateExtraction(extract, pluto);
    expect(result.adjustedConfidence).toBeGreaterThanOrEqual(0.1);
  });
});
