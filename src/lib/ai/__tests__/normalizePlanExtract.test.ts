import { describe, it, expect, vi } from 'vitest';
import { buildLocalFallback, normalizePlanExtract } from '../normalizePlanExtract';
import type { RecipeResult } from '../../../types/pdf';

function makeZoningResult(overrides: Partial<RecipeResult['fields']> = {}): RecipeResult {
  return {
    recipe: 'ZONING_SCHEDULE',
    pages: [1],
    fields: {
      lotAreaSf: 10000,
      zoningFloorAreaSf: 60000,
      far: 6.0,
      totalUnits: 80,
      unitMix: { STUDIO: 10, '1BR': 30, '2BR': 25, '3BR': 15 },
      ...overrides,
    },
    evidence: [
      { field: 'lotAreaSf', page: 1, method: 'TEXT_TABLE', snippet: 'Lot Area: 10,000 SF' },
    ],
    confidence: 0.85,
  };
}

function makeFloorPlanResult(): RecipeResult {
  return {
    recipe: 'FLOOR_PLAN_LABEL',
    pages: [2, 3],
    fields: {
      unitSizesByType: { Studio: [450, 475], '1BR': [650, 680] },
      unitCountsByType: { Studio: 2, '1BR': 2 },
    },
    evidence: [
      { field: 'unitSize_Studio', page: 2, method: 'TEXT_REGEX', snippet: 'STUDIO APT 450 SF' },
    ],
    confidence: 0.7,
  };
}

describe('buildLocalFallback', () => {
  it('extracts zoning data from ZONING_SCHEDULE result', () => {
    const result = buildLocalFallback([makeZoningResult()]);
    expect(result.zoning.lotAreaSf).toBe(10000);
    expect(result.zoning.zoningFloorAreaSf).toBe(60000);
    expect(result.zoning.far).toBe(6.0);
    expect(result.totals.totalUnits).toBe(80);
    expect(result.confidence.overall).toBeLessThanOrEqual(0.6);
  });

  it('extracts unit sizes from FLOOR_PLAN_LABEL result', () => {
    const result = buildLocalFallback([makeFloorPlanResult()]);
    expect(result.unitSizes.byType['Studio']).toEqual([450, 475]);
    expect(result.unitSizes.avgByType['Studio']).toBe(463);
    expect(result.unitSizes.byType['1BR']).toEqual([650, 680]);
  });

  it('merges zoning and floor plan results', () => {
    const result = buildLocalFallback([makeZoningResult(), makeFloorPlanResult()]);
    expect(result.zoning.lotAreaSf).toBe(10000);
    expect(result.unitSizes.byType['Studio']).toEqual([450, 475]);
    expect(result.totals.totalUnits).toBe(80);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns null fields for empty input', () => {
    const result = buildLocalFallback([]);
    expect(result.zoning.lotAreaSf).toBeNull();
    expect(result.zoning.zoningFloorAreaSf).toBeNull();
    expect(result.totals.totalUnits).toBeNull();
  });

  it('maps unit mix keys to normalized structure', () => {
    const result = buildLocalFallback([makeZoningResult()]);
    expect(result.unitMix.studio).toBe(10);
    expect(result.unitMix.br1).toBe(30);
    expect(result.unitMix.br2).toBe(25);
    expect(result.unitMix.br3).toBe(15);
    expect(result.unitMix.br4plus).toBeNull();
  });

  it('caps confidence at 0.6 for local fallback', () => {
    const highConfResult = makeZoningResult();
    highConfResult.confidence = 0.95;
    const result = buildLocalFallback([highConfResult]);
    expect(result.confidence.overall).toBeLessThanOrEqual(0.6);
  });

  it('adds warning about LLM unavailability', () => {
    const result = buildLocalFallback([makeZoningResult()]);
    expect(result.confidence.warnings.some((w) => w.includes('LLM normalization unavailable'))).toBe(true);
  });

  it('uses GENERIC recipe totalUnits as fallback', () => {
    const generic: RecipeResult = {
      recipe: 'GENERIC',
      pages: [1],
      fields: { totalUnits: 50, unitMix: { STUDIO: 10, '1BR': 20, '2BR': 20 } },
      evidence: [],
      confidence: 0.5,
    };
    const result = buildLocalFallback([generic]);
    expect(result.totals.totalUnits).toBe(50);
    expect(result.unitMix.studio).toBe(10);
  });

  it('extracts data from COVER_SHEET recipe result', () => {
    const coverSheet: RecipeResult = {
      recipe: 'COVER_SHEET',
      pages: [1],
      fields: {
        coverSheet: {
          lotAreaSf: 5000,
          far: 4.6,
          totalUnits: 16,
          floors: 5,
          buildingAreaSf: 23000,
          zone: 'R7A',
          zoningMap: null,
          occupancyGroup: null,
          constructionClass: null,
          scopeOfWork: null,
          block: '2508',
          lot: '37',
          bin: null,
        },
      },
      evidence: [
        { field: 'lotAreaSf', page: 1, method: 'TEXT_REGEX', snippet: 'LOT AREA: 5000' },
      ],
      confidence: 0.8,
    };
    const result = buildLocalFallback([coverSheet]);
    expect(result.zoning.lotAreaSf).toBe(5000);
    expect(result.zoning.far).toBe(4.6);
    expect(result.totals.totalUnits).toBe(16);
  });

  it('prefers COVER_SHEET data when both COVER_SHEET and ZONING_SCHEDULE provided', () => {
    const coverSheet: RecipeResult = {
      recipe: 'COVER_SHEET',
      pages: [1],
      fields: {
        coverSheet: {
          lotAreaSf: 5000,
          far: 4.6,
          totalUnits: 16,
          floors: null,
          buildingAreaSf: null,
          zone: null,
          zoningMap: null,
          occupancyGroup: null,
          constructionClass: null,
          scopeOfWork: null,
          block: null,
          lot: null,
          bin: null,
        },
      },
      evidence: [],
      confidence: 0.8,
    };
    const zoning = makeZoningResult();
    const result = buildLocalFallback([coverSheet, zoning]);
    expect(result.zoning.lotAreaSf).toBe(5000);
    expect(result.zoning.far).toBe(4.6);
    expect(result.totals.totalUnits).toBe(16);
    expect(result.zoning.zoningFloorAreaSf).toBe(60000);
  });
});

describe('normalizePlanExtract source tracking', () => {
  it('returns local_fallback source and reason for empty results', async () => {
    const result = await normalizePlanExtract([]);
    expect(result.source).toBe('local_fallback');
    expect(result.fallbackReason).toBe('No recipe results to normalize');
    expect(result.extract.totals.totalUnits).toBeNull();
  });

  it('returns local_fallback with reason when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await normalizePlanExtract([makeZoningResult()]);
    expect(result.source).toBe('local_fallback');
    expect(result.fallbackReason).toBe('network error');
    expect(result.extract.zoning.lotAreaSf).toBe(10000);
    vi.unstubAllGlobals();
  });

  it('returns local_fallback with reason from API error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'no_api_key', reason: 'OPENAI_API_KEY secret is not configured', fallback: true }),
      })
    );
    const result = await normalizePlanExtract([makeZoningResult()]);
    expect(result.source).toBe('local_fallback');
    expect(result.fallbackReason).toBe('OPENAI_API_KEY secret is not configured');
    vi.unstubAllGlobals();
  });

  it('returns local_fallback with reason from 200-level fallback flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ error: 'no_llm', reason: 'Key missing', fallback: true }),
      })
    );
    const result = await normalizePlanExtract([makeZoningResult()]);
    expect(result.source).toBe('local_fallback');
    expect(result.fallbackReason).toBe('Key missing');
    vi.unstubAllGlobals();
  });

  it('returns llm source with no fallbackReason on success', async () => {
    const normalized = {
      totals: { totalUnits: 80, affordableUnits: 20, marketUnits: 60 },
      unitMix: { studio: 10, br1: 30, br2: 25, br3: 15, br4plus: 0 },
      unitSizes: { byType: {}, avgByType: {} },
      zoning: { lotAreaSf: 10000, zoningFloorAreaSf: 60000, far: 6.0 },
      evidence: [],
      confidence: { overall: 0.92, warnings: [] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ normalized }),
      })
    );
    const result = await normalizePlanExtract([makeZoningResult()]);
    expect(result.source).toBe('llm');
    expect(result.fallbackReason).toBeUndefined();
    expect(result.extract.totals.totalUnits).toBe(80);
    vi.unstubAllGlobals();
  });
});
