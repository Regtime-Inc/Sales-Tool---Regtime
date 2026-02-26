import { describe, it, expect } from 'vitest';
import { applyValidationGates } from '../validationGates';
import type { ExtractionV2Result, Signal, CoverSheetSignals, ZoningSignals } from '../types';

function makeSignal<T>(value: T, confidence: number, page = 1): Signal<T> {
  return {
    value,
    confidence,
    evidence: [{ page, snippet: `test ${value}`, sourceType: 'cover_sheet', confidence }],
  };
}

function makeV2Result(overrides: Partial<ExtractionV2Result> = {}): ExtractionV2Result {
  const cs: CoverSheetSignals = { totalUnits: null, floors: null, zone: null, lotArea: null, buildingArea: null, far: null };
  const zn: ZoningSignals = { totalDwellingUnits: null, lotArea: null, far: null, zoningFloorArea: null, zone: null };
  return {
    totalUnits: null,
    unitMix: null,
    unitRecords: [],
    zoning: zn,
    coverSheet: cs,
    warnings: [],
    tablesSummary: [],
    ocrUsed: false,
    unitCountMentions: [],
    redundancyScore: 0.6,
    validationGates: [],
    llmReconciliation: [],
    pageRelevance: [],
    ...overrides,
  };
}

describe('applyValidationGates', () => {
  it('returns no gates when no data is available', () => {
    const result = applyValidationGates(makeV2Result());
    expect(result.gates).toHaveLength(0);
    expect(result.passedAll).toBe(true);
  });

  it('passes unit count within expected range', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.9) });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const unitGate = result.gates.find((g) => g.field === 'totalUnits');
    expect(unitGate).toBeDefined();
    expect(unitGate!.status).toBe('PASS');
    expect(result.passedAll).toBe(true);
  });

  it('flags unit count exceeding implied maximum', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(200, 0.9) });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const unitGate = result.gates.find((g) => g.field === 'totalUnits');
    expect(unitGate).toBeDefined();
    expect(unitGate!.status).toBe('NEEDS_OVERRIDE');
    expect(result.needsManualFields).toContain('totalUnits');
    expect(result.passedAll).toBe(false);
  });

  it('flags unit count below implied minimum', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(1, 0.9) });
    const pluto = { lotarea: 10000, residfar: 6.0, bldgarea: 60000 };
    const result = applyValidationGates(v2, pluto);
    const unitGate = result.gates.find((g) => g.field === 'totalUnits');
    expect(unitGate!.status).toBe('NEEDS_OVERRIDE');
  });

  it('passes FAR within 20% of PLUTO', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: null,
      far: makeSignal(3.8, 0.85),
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const farGate = result.gates.find((g) => g.field === 'far');
    expect(farGate).toBeDefined();
    expect(farGate!.status).toBe('PASS');
  });

  it('warns for FAR deviation within affordable bonus range', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: null,
      far: makeSignal(4.9, 0.85),
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto, 'R7A');
    const farGate = result.gates.find((g) => g.field === 'far');
    expect(farGate).toBeDefined();
    expect(farGate!.status).toBe('WARN');
  });

  it('flags FAR exceeding max legal FAR as NEEDS_OVERRIDE', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: null,
      far: makeSignal(12.0, 0.85),
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto, 'R7A');
    const farGate = result.gates.find((g) => g.field === 'far');
    expect(farGate!.status).toBe('NEEDS_OVERRIDE');
    expect(result.needsManualFields).toContain('far');
  });

  it('passes lot area within 8% of PLUTO', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: makeSignal(5200, 0.85),
      far: null,
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const lotGate = result.gates.find((g) => g.field === 'lotArea');
    expect(lotGate!.status).toBe('PASS');
  });

  it('warns lot area deviation between 8-15%', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: makeSignal(5600, 0.85),
      far: null,
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const lotGate = result.gates.find((g) => g.field === 'lotArea');
    expect(lotGate!.status).toBe('WARN');
  });

  it('flags lot area deviation > 15% as NEEDS_OVERRIDE', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: makeSignal(8000, 0.85),
      far: null,
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const lotGate = result.gates.find((g) => g.field === 'lotArea');
    expect(lotGate!.status).toBe('NEEDS_OVERRIDE');
  });

  it('detects conflicting unit count mentions', () => {
    const v2 = makeV2Result({
      totalUnits: makeSignal(14, 0.7),
      unitCountMentions: [
        { value: 14, page: 1, sourceType: 'cover_sheet', snippet: '14 UNITS', confidence: 0.9 },
        { value: 155, page: 3, sourceType: 'unit_schedule_table', snippet: '155 occupants', confidence: 0.7 },
      ],
      redundancyScore: 0.6,
    });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const result = applyValidationGates(v2, pluto);
    const redundancyGate = result.gates.find((g) => g.field === 'unitCountRedundancy');
    expect(redundancyGate).toBeDefined();
    expect(['WARN', 'CONFLICTING']).toContain(redundancyGate!.status);
  });

  it('skips gates when pluto data is null', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.9) });
    const result = applyValidationGates(v2, null);
    const unitGate = result.gates.find((g) => g.field === 'totalUnits');
    expect(unitGate).toBeUndefined();
  });
});
