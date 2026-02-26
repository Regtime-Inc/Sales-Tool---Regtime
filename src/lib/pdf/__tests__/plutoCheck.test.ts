import { describe, it, expect } from 'vitest';
import { crossCheckWithPluto } from '../plutoCheck';
import type { ExtractedPdfData } from '../../../types/pdf';

function makeExtracted(overrides: Partial<ExtractedPdfData> = {}): ExtractedPdfData {
  return {
    status: 'complete',
    totals: { totalUnits: 75, affordableUnits: 19, marketUnits: 56 },
    unitMix: { studio: 10, br1: 30, br2: 25, br3: 10, br4plus: 0 },
    unitRecords: [],
    far: {
      lotAreaSf: 12000,
      zoningFloorAreaSf: 95000,
      proposedFloorAreaSf: 95000,
      proposedFAR: 7.92,
      source: { page: 3, method: 'TEXT_TABLE', evidence: 'test' },
      confidence: 0.8,
    },
    confidence: { overall: 0.84, warnings: [] },
    evidence: { pagesUsed: [3, 12], tablesFound: 2 },
    extraction: {
      unitSchedule: [],
      zoningAnalysis: { lotArea: null, far: null, zoningFloorArea: null, proposedFloorArea: null, residFar: null, totalUnits: null, zoneDistrict: null, buildingArea: null, floors: null, bin: null },
      conversion: null,
      overallConfidence: 0.84,
      textYield: 'high',
      needsOcr: false,
      pageCount: 20,
      rawSnippets: [],
    },
    errors: [],
    ...overrides,
  };
}

describe('crossCheckWithPluto', () => {
  it('returns no warnings when PDF matches PLUTO data', () => {
    const result = crossCheckWithPluto(
      makeExtracted(),
      { lotarea: 12000, residfar: 8.0, bldgarea: 50000 }
    );
    expect(result.warnings.length).toBe(0);
  });

  it('warns when total units differ significantly from implied capacity', () => {
    const extracted = makeExtracted({
      totals: { totalUnits: 200, affordableUnits: 50, marketUnits: 150 },
      confidence: { overall: 0.6, warnings: [] },
    });
    const result = crossCheckWithPluto(extracted, { lotarea: 5000, residfar: 4.0, bldgarea: 10000 });
    expect(result.warnings.some((w) => w.includes('differs from PLUTO'))).toBe(true);
  });

  it('warns when PDF lot area differs from PLUTO lot area', () => {
    const extracted = makeExtracted({
      far: {
        lotAreaSf: 20000,
        zoningFloorAreaSf: null,
        proposedFloorAreaSf: null,
        proposedFAR: null,
        source: { page: 3, method: 'TEXT_TABLE', evidence: '' },
        confidence: 0.8,
      },
    });
    const result = crossCheckWithPluto(extracted, { lotarea: 12000, residfar: 8.0, bldgarea: 50000 });
    expect(result.warnings.some((w) => w.includes('lot area'))).toBe(true);
  });

  it('warns when proposed FAR exceeds PLUTO residFAR', () => {
    const extracted = makeExtracted({
      far: {
        lotAreaSf: 12000,
        zoningFloorAreaSf: null,
        proposedFloorAreaSf: null,
        proposedFAR: 10.0,
        source: { page: 3, method: 'TEXT_TABLE', evidence: '' },
        confidence: 0.8,
      },
    });
    const result = crossCheckWithPluto(extracted, { lotarea: 12000, residfar: 6.0, bldgarea: 50000 });
    expect(result.warnings.some((w) => w.includes('exceeds PLUTO'))).toBe(true);
  });

  it('returns empty warnings when no PLUTO data', () => {
    const result = crossCheckWithPluto(makeExtracted(), null);
    expect(result.warnings).toEqual([]);
  });

  it('populates plutoValues', () => {
    const result = crossCheckWithPluto(makeExtracted(), { lotarea: 12000, residfar: 8.0, bldgarea: 50000 });
    expect(result.plutoValues.lotArea).toBe(12000);
    expect(result.plutoValues.residFar).toBe(8);
    expect(result.plutoValues.impliedMaxUnits).toBeGreaterThan(0);
  });
});
