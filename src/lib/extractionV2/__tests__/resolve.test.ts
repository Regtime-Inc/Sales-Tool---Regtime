import { describe, it, expect } from 'vitest';
import { resolveExtraction } from '../resolve';
import type { CoverSheetSignals, ZoningSignals, UnitMixSignal, Signal } from '../types';

function makeSignal<T>(value: T, confidence: number, page = 1): Signal<T> {
  return {
    value,
    confidence,
    evidence: [{ page, snippet: `test ${value}`, sourceType: 'cover_sheet', confidence }],
  };
}

function emptyCoverSheet(): CoverSheetSignals {
  return { totalUnits: null, floors: null, zone: null, lotArea: null, buildingArea: null, far: null };
}

function emptyZoning(): ZoningSignals {
  return { totalDwellingUnits: null, lotArea: null, far: null, zoningFloorArea: null, zone: null };
}

function emptyTables(): UnitMixSignal {
  return { totalUnits: null, unitMix: null, unitRecords: null };
}

describe('resolveExtraction', () => {
  it('uses single source when only cover sheet has units', () => {
    const cs = { ...emptyCoverSheet(), totalUnits: makeSignal(14, 0.9) };
    const result = resolveExtraction(cs, emptyZoning(), emptyTables(), [], false);
    expect(result.totalUnits?.value).toBe(14);
  });

  it('boosts confidence when two sources agree', () => {
    const cs = { ...emptyCoverSheet(), totalUnits: makeSignal(14, 0.8) };
    const zn = { ...emptyZoning(), totalDwellingUnits: makeSignal(14, 0.75) };
    const result = resolveExtraction(cs, zn, emptyTables(), [], false);
    expect(result.totalUnits?.value).toBe(14);
    expect(result.totalUnits!.confidence).toBeGreaterThan(0.8);
  });

  it('resolves conflicting signals (14 vs 155) to the lower value with warning', () => {
    const cs = { ...emptyCoverSheet(), totalUnits: makeSignal(14, 0.9) };
    const tb: UnitMixSignal = {
      totalUnits: makeSignal(155, 0.8),
      unitMix: null,
      unitRecords: null,
    };
    const result = resolveExtraction(cs, emptyZoning(), tb, [], false);
    expect(result.totalUnits?.value).toBe(14);
    expect(result.warnings.some((w) => w.includes('Conflicting'))).toBe(true);
  });

  it('adds warning when unitMix is null', () => {
    const cs = { ...emptyCoverSheet(), totalUnits: makeSignal(14, 0.9) };
    const result = resolveExtraction(cs, emptyZoning(), emptyTables(), [], false);
    expect(result.unitMix).toBeNull();
    expect(result.warnings.some((w) => w.includes('Unit mix'))).toBe(true);
  });

  it('aggregates warnings from all sources', () => {
    const result = resolveExtraction(emptyCoverSheet(), emptyZoning(), emptyTables(), [], false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to cover sheet for zoning data', () => {
    const cs = {
      ...emptyCoverSheet(),
      lotArea: makeSignal(5000, 0.85),
      zone: makeSignal('R7A', 0.9),
    };
    const result = resolveExtraction(cs, emptyZoning(), emptyTables(), [], false);
    expect(result.zoning.lotArea?.value).toBe(5000);
    expect(result.zoning.zone?.value).toBe('R7A');
  });

  it('prefers zoning page data over cover sheet', () => {
    const cs = { ...emptyCoverSheet(), lotArea: makeSignal(4000, 0.85) };
    const zn = { ...emptyZoning(), lotArea: makeSignal(5000, 0.85) };
    const result = resolveExtraction(cs, zn, emptyTables(), [], false);
    expect(result.zoning.lotArea?.value).toBe(5000);
  });

  it('adds warning for allocation not found', () => {
    const tb: UnitMixSignal = {
      totalUnits: makeSignal(3, 0.8),
      unitMix: makeSignal({ STUDIO: 2, '1BR': 1 }, 0.75),
      unitRecords: makeSignal([
        { unitId: '1A', bedroomType: 'STUDIO', allocation: 'UNKNOWN', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
        { unitId: '1B', bedroomType: 'STUDIO', allocation: 'UNKNOWN', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
        { unitId: '2A', bedroomType: '1BR', allocation: 'UNKNOWN', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
      ], 0.75),
    };
    const result = resolveExtraction(emptyCoverSheet(), emptyZoning(), tb, [], false);
    expect(result.warnings.some((w) => w.includes('Affordable/Market allocation'))).toBe(true);
  });

  it('highest confidence source wins when no conflicts', () => {
    const cs = { ...emptyCoverSheet(), totalUnits: makeSignal(14, 0.7) };
    const zn = { ...emptyZoning(), totalDwellingUnits: makeSignal(16, 0.95) };
    const result = resolveExtraction(cs, zn, emptyTables(), [], false);
    expect(result.totalUnits?.value).toBe(16);
  });
});
