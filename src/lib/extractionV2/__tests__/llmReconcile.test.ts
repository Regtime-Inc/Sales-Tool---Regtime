import { describe, it, expect } from 'vitest';
import { reconcileLlmWithRuleBased } from '../llmReconcile';
import type { ExtractionV2Result, Signal, CoverSheetSignals, ZoningSignals } from '../types';
import type { LlmExtractedPlanData } from '../../../types/pdf';

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

function makeLlmExtraction(overrides: Partial<LlmExtractedPlanData> = {}): LlmExtractedPlanData {
  return {
    totals: { totalUnits: null, affordableUnits: null, marketUnits: null },
    unitMix: { studio: null, br1: null, br2: null, br3: null, br4plus: null },
    unitRecords: [],
    zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: null, zone: null, maxFar: null },
    building: {
      floors: null, buildingAreaSf: null, block: null, lot: null,
      bin: null, occupancyGroup: null, constructionClass: null, scopeOfWork: null,
    },
    confidence: { overall: 0.8, warnings: [] },
    ...overrides,
  };
}

describe('reconcileLlmWithRuleBased', () => {
  it('boosts confidence when rule-based and LLM agree on unit count', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.7) });
    const llm = makeLlmExtraction({ totals: { totalUnits: 14, affordableUnits: null, marketUnits: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const unitRecon = reconciliation.find((r) => r.field === 'totalUnits');
    expect(unitRecon).toBeDefined();
    expect(unitRecon!.agreement).toBe(true);
    expect(unitRecon!.finalConfidence).toBeGreaterThan(0.7);
  });

  it('flags disagreement when unit counts differ', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.7) });
    const llm = makeLlmExtraction({ totals: { totalUnits: 28, affordableUnits: null, marketUnits: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const unitRecon = reconciliation.find((r) => r.field === 'totalUnits');
    expect(unitRecon!.agreement).toBe(false);
    expect(unitRecon!.finalValue).toBe(14);
    expect(unitRecon!.note).toContain('Disagreement');
  });

  it('adds LLM unit count as a mention', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.7) });
    const llm = makeLlmExtraction({ totals: { totalUnits: 14, affordableUnits: null, marketUnits: null } });
    const { updatedMentions } = reconcileLlmWithRuleBased(v2, llm);
    const llmMention = updatedMentions.find((m) => m.sourceType === 'llm');
    expect(llmMention).toBeDefined();
    expect(llmMention!.value).toBe(14);
  });

  it('boosts confidence when FAR values agree', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: null,
      far: makeSignal(4.0, 0.8),
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: 4.0, zone: null, maxFar: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const farRecon = reconciliation.find((r) => r.field === 'far');
    expect(farRecon!.agreement).toBe(true);
  });

  it('uses value closer to PLUTO when FAR disagrees', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: null,
      far: makeSignal(5.0, 0.8),
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: 4.1, zone: null, maxFar: null } });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm, pluto);
    const farRecon = reconciliation.find((r) => r.field === 'far');
    expect(farRecon!.agreement).toBe(false);
    expect(farRecon!.finalValue).toBe(4.1);
  });

  it('uses value closer to PLUTO when lot area disagrees', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null,
      lotArea: makeSignal(6000, 0.8),
      far: null,
      zoningFloorArea: null,
      zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: 5100, zoningFloorAreaSf: null, far: null, zone: null, maxFar: null } });
    const pluto = { lotarea: 5000, residfar: 4.0, bldgarea: 20000 };
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm, pluto);
    const lotRecon = reconciliation.find((r) => r.field === 'lotArea');
    expect(lotRecon!.finalValue).toBe(5100);
  });

  it('returns empty reconciliation when no comparable data', () => {
    const v2 = makeV2Result();
    const llm = makeLlmExtraction();
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    expect(reconciliation).toHaveLength(0);
  });

  it('does not add LLM mention when LLM units are null', () => {
    const v2 = makeV2Result({ totalUnits: makeSignal(14, 0.7) });
    const llm = makeLlmExtraction();
    const { updatedMentions } = reconcileLlmWithRuleBased(v2, llm);
    const llmMention = updatedMentions.find((m) => m.sourceType === 'llm');
    expect(llmMention).toBeUndefined();
  });

  it('reconciles floors when both sources have values', () => {
    const cs = { totalUnits: null, floors: makeSignal(8, 0.85), zone: null, lotArea: null, buildingArea: null, far: null };
    const v2 = makeV2Result({ coverSheet: cs });
    const llm = makeLlmExtraction({
      building: { floors: 8, buildingAreaSf: null, block: null, lot: null, bin: null, occupancyGroup: null, constructionClass: null, scopeOfWork: null },
    });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const floorsRecon = reconciliation.find((r) => r.field === 'floors');
    expect(floorsRecon).toBeDefined();
    expect(floorsRecon!.agreement).toBe(true);
    expect(floorsRecon!.finalValue).toBe(8);
  });

  it('reconciles building area from LLM-only value', () => {
    const v2 = makeV2Result();
    const llm = makeLlmExtraction({
      building: { floors: null, buildingAreaSf: 62400, block: null, lot: null, bin: null, occupancyGroup: null, constructionClass: null, scopeOfWork: null },
    });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const baRecon = reconciliation.find((r) => r.field === 'buildingArea');
    expect(baRecon).toBeDefined();
    expect(baRecon!.agreement).toBeNull();
    expect(baRecon!.finalValue).toBe(62400);
  });

  it('reconciles zone district strings', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null, lotArea: null, far: null, zoningFloorArea: null,
      zone: makeSignal('R7A', 0.9),
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: null, zone: 'R7A', maxFar: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const zoneRecon = reconciliation.find((r) => r.field === 'zone');
    expect(zoneRecon!.agreement).toBe(true);
  });

  it('reconciles zone district disagreement', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null, lotArea: null, far: null, zoningFloorArea: null,
      zone: makeSignal('R7A', 0.9),
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: null, zone: 'C4-4D', maxFar: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const zoneRecon = reconciliation.find((r) => r.field === 'zone');
    expect(zoneRecon!.agreement).toBe(false);
  });

  it('reconciles unit mix counts from LLM', () => {
    const v2 = makeV2Result({
      unitMix: makeSignal({ STUDIO: 5, '1BR': 10, '2BR': 8 }, 0.7),
    });
    const llm = makeLlmExtraction({
      unitMix: { studio: 5, br1: 10, br2: 8, br3: null, br4plus: null },
    });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const studioRecon = reconciliation.find((r) => r.field === 'studio');
    expect(studioRecon!.agreement).toBe(true);
    expect(studioRecon!.finalValue).toBe(5);
    const br1Recon = reconciliation.find((r) => r.field === 'br1');
    expect(br1Recon!.agreement).toBe(true);
  });

  it('reconciles maxFar as LLM-only', () => {
    const v2 = makeV2Result();
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: null, far: null, zone: null, maxFar: 6.5 } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const maxFarRecon = reconciliation.find((r) => r.field === 'maxFar');
    expect(maxFarRecon).toBeDefined();
    expect(maxFarRecon!.agreement).toBeNull();
    expect(maxFarRecon!.finalValue).toBe(6.5);
  });

  it('reconciles zoning floor area agreement', () => {
    const zn: ZoningSignals = {
      totalDwellingUnits: null, lotArea: null, far: null,
      zoningFloorArea: makeSignal(75000, 0.85), zone: null,
    };
    const v2 = makeV2Result({ zoning: zn });
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: null, zoningFloorAreaSf: 75000, far: null, zone: null, maxFar: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const zfaRecon = reconciliation.find((r) => r.field === 'zoningFloorArea');
    expect(zfaRecon!.agreement).toBe(true);
  });

  it('reconciles LLM-only lotArea when no rule-based value exists', () => {
    const v2 = makeV2Result();
    const llm = makeLlmExtraction({ zoning: { lotAreaSf: 12500, zoningFloorAreaSf: null, far: null, zone: null, maxFar: null } });
    const { reconciliation } = reconcileLlmWithRuleBased(v2, llm);
    const lotRecon = reconciliation.find((r) => r.field === 'lotArea');
    expect(lotRecon).toBeDefined();
    expect(lotRecon!.agreement).toBeNull();
    expect(lotRecon!.finalValue).toBe(12500);
  });
});
