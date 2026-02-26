import type { ExtractionV2Result, LlmReconciliation, UnitCountMention } from './types';
import type { LlmExtractedPlanData } from '../../types/pdf';

interface PlutoData {
  lotarea: number;
  residfar: number;
  bldgarea: number;
}

export function reconcileLlmWithRuleBased(
  v2Result: ExtractionV2Result,
  llmExtraction: LlmExtractedPlanData,
  plutoData?: PlutoData | null,
): { reconciliation: LlmReconciliation[]; updatedMentions: UnitCountMention[] } {
  const reconciliation: LlmReconciliation[] = [];
  const updatedMentions = [...v2Result.unitCountMentions];

  const ruleUnits = v2Result.totalUnits?.value ?? null;
  const llmUnits = llmExtraction.totals.totalUnits;

  if (llmUnits !== null && llmUnits >= 1) {
    updatedMentions.push({
      value: llmUnits,
      page: -1,
      sourceType: 'llm',
      snippet: `LLM extracted ${llmUnits} total units`,
      confidence: 0.8,
    });
  }

  if (ruleUnits !== null && llmUnits !== null) {
    const diff = Math.abs(ruleUnits - llmUnits);
    const agreement = diff <= 2;

    let finalValue = ruleUnits;
    let finalConfidence = v2Result.totalUnits?.confidence ?? 0.5;
    let note = '';

    if (agreement) {
      finalConfidence = Math.min(1, finalConfidence + 0.1);
      note = `Rule-based (${ruleUnits}) and LLM (${llmUnits}) agree. Confidence boosted.`;
    } else {
      finalConfidence = Math.max(0.3, finalConfidence - 0.1);
      note = `Disagreement: rule-based=${ruleUnits}, LLM=${llmUnits}. Using rule-based value. Manual review recommended.`;
    }

    reconciliation.push({
      field: 'totalUnits',
      ruleBasedValue: ruleUnits,
      llmValue: llmUnits,
      agreement,
      finalValue,
      finalConfidence,
      note,
    });
  }

  const ruleFar = v2Result.zoning.far?.value ?? null;
  const llmFar = llmExtraction.zoning.far;

  if (ruleFar !== null && llmFar !== null) {
    const farDiff = Math.abs(ruleFar - llmFar) / Math.max(ruleFar, 0.1);
    const agreement = farDiff <= 0.05;

    let finalValue = ruleFar;
    let finalConfidence = v2Result.zoning.far?.confidence ?? 0.5;
    let note = '';

    if (agreement) {
      finalConfidence = Math.min(1, finalConfidence + 0.05);
      note = `FAR agreement: rule-based=${ruleFar.toFixed(2)}, LLM=${llmFar.toFixed(2)}.`;
    } else {
      if (plutoData && plutoData.residfar > 0) {
        const ruleDeviation = Math.abs(ruleFar - plutoData.residfar) / plutoData.residfar;
        const llmDeviation = Math.abs(llmFar - plutoData.residfar) / plutoData.residfar;
        finalValue = ruleDeviation <= llmDeviation ? ruleFar : llmFar;
        note = `FAR disagreement: rule=${ruleFar.toFixed(2)}, LLM=${llmFar.toFixed(2)}. Using value closer to PLUTO FAR (${plutoData.residfar}).`;
      } else {
        note = `FAR disagreement: rule=${ruleFar.toFixed(2)}, LLM=${llmFar.toFixed(2)}. Using rule-based value.`;
      }
    }

    reconciliation.push({
      field: 'far',
      ruleBasedValue: ruleFar,
      llmValue: llmFar,
      agreement,
      finalValue,
      finalConfidence,
      note,
    });
  }

  const ruleLotArea = v2Result.zoning.lotArea?.value ?? null;
  const llmLotArea = llmExtraction.zoning.lotAreaSf;

  if (ruleLotArea !== null && llmLotArea !== null && llmLotArea > 0) {
    const lotDiff = Math.abs(ruleLotArea - llmLotArea) / Math.max(ruleLotArea, 1);
    const agreement = lotDiff <= 0.05;

    let finalValue = ruleLotArea;
    let note = '';

    if (agreement) {
      note = `Lot area agreement: rule=${ruleLotArea.toLocaleString()}, LLM=${llmLotArea.toLocaleString()}.`;
    } else if (plutoData && plutoData.lotarea > 0) {
      const ruleDeviation = Math.abs(ruleLotArea - plutoData.lotarea) / plutoData.lotarea;
      const llmDeviation = Math.abs(llmLotArea - plutoData.lotarea) / plutoData.lotarea;
      finalValue = ruleDeviation <= llmDeviation ? ruleLotArea : llmLotArea;
      note = `Lot area disagreement. Using value closer to PLUTO (${plutoData.lotarea.toLocaleString()} SF).`;
    } else {
      note = `Lot area disagreement: rule=${ruleLotArea.toLocaleString()}, LLM=${llmLotArea.toLocaleString()}.`;
    }

    reconciliation.push({
      field: 'lotArea',
      ruleBasedValue: ruleLotArea,
      llmValue: llmLotArea,
      agreement,
      finalValue,
      finalConfidence: agreement ? 0.9 : 0.7,
      note,
    });
  } else if (llmLotArea !== null && llmLotArea > 0) {
    reconciliation.push({
      field: 'lotArea',
      ruleBasedValue: null,
      llmValue: llmLotArea,
      agreement: null,
      finalValue: llmLotArea,
      finalConfidence: 0.7,
      note: `LLM extracted lot area: ${llmLotArea.toLocaleString()} SF (no rule-based value).`,
    });
  }

  reconcileNumericField(reconciliation, 'zoningFloorArea',
    v2Result.zoning.zoningFloorArea?.value ?? null,
    llmExtraction.zoning.zoningFloorAreaSf, 0.05, 'Zoning floor area');

  reconcileNumericField(reconciliation, 'maxFar',
    null, llmExtraction.zoning.maxFar, 0.05, 'Max FAR');

  reconcileStringField(reconciliation, 'zone',
    v2Result.zoning.zone?.value ?? null,
    llmExtraction.zoning.zone, 'Zone district');

  reconcileNumericField(reconciliation, 'floors',
    v2Result.coverSheet.floors?.value ?? null,
    llmExtraction.building.floors, 0.01, 'Floors');

  reconcileNumericField(reconciliation, 'buildingArea',
    v2Result.coverSheet.buildingArea?.value ?? null,
    llmExtraction.building.buildingAreaSf, 0.05, 'Building area');

  const ruleUnitMix = v2Result.unitMix?.value ?? {};
  const llmMix = llmExtraction.unitMix;
  const mixFields: Array<[string, string, string]> = [
    ['studio', 'STUDIO', 'Studios'],
    ['br1', '1BR', '1-Bedrooms'],
    ['br2', '2BR', '2-Bedrooms'],
    ['br3', '3BR', '3-Bedrooms'],
    ['br4plus', '4BR_PLUS', '4+ Bedrooms'],
  ];
  for (const [llmKey, ruleKey, label] of mixFields) {
    const ruleVal = ruleUnitMix[ruleKey] ?? null;
    const llmVal = llmMix[llmKey as keyof typeof llmMix];
    reconcileNumericField(reconciliation, llmKey,
      ruleVal !== null && ruleVal > 0 ? ruleVal : null,
      llmVal, 0.01, label);
  }

  reconcileNumericField(reconciliation, 'affordableUnits',
    null, llmExtraction.totals.affordableUnits, 0.01, 'Affordable units');

  reconcileNumericField(reconciliation, 'marketUnits',
    null, llmExtraction.totals.marketUnits, 0.01, 'Market units');

  return { reconciliation, updatedMentions };
}

function reconcileNumericField(
  reconciliation: LlmReconciliation[],
  field: string,
  ruleVal: number | null,
  llmVal: number | null,
  tolerance: number,
  label: string,
) {
  if (ruleVal !== null && llmVal !== null) {
    const denom = Math.max(Math.abs(ruleVal), 0.1);
    const agreement = Math.abs(ruleVal - llmVal) / denom <= tolerance;
    reconciliation.push({
      field,
      ruleBasedValue: ruleVal,
      llmValue: llmVal,
      agreement,
      finalValue: agreement ? ruleVal : ruleVal,
      finalConfidence: agreement ? 0.9 : 0.65,
      note: agreement
        ? `${label} agreement: rule=${fmt(ruleVal)}, LLM=${fmt(llmVal)}.`
        : `${label} disagreement: rule=${fmt(ruleVal)}, LLM=${fmt(llmVal)}. Manual review recommended.`,
    });
  } else if (llmVal !== null && llmVal !== 0) {
    reconciliation.push({
      field,
      ruleBasedValue: null,
      llmValue: llmVal,
      agreement: null,
      finalValue: llmVal,
      finalConfidence: 0.7,
      note: `${label}: LLM extracted ${fmt(llmVal)} (no rule-based value).`,
    });
  }
}

function reconcileStringField(
  reconciliation: LlmReconciliation[],
  field: string,
  ruleVal: string | null,
  llmVal: string | null,
  label: string,
) {
  if (ruleVal && llmVal) {
    const agreement = ruleVal.trim().toUpperCase() === llmVal.trim().toUpperCase();
    reconciliation.push({
      field,
      ruleBasedValue: ruleVal,
      llmValue: llmVal,
      agreement,
      finalValue: agreement ? ruleVal : ruleVal,
      finalConfidence: agreement ? 0.9 : 0.6,
      note: agreement
        ? `${label} agreement: "${ruleVal}".`
        : `${label} disagreement: rule="${ruleVal}", LLM="${llmVal}".`,
    });
  } else if (llmVal) {
    reconciliation.push({
      field,
      ruleBasedValue: null,
      llmValue: llmVal,
      agreement: null,
      finalValue: llmVal,
      finalConfidence: 0.7,
      note: `${label}: LLM extracted "${llmVal}" (no rule-based value).`,
    });
  }
}

function fmt(v: number | string): string {
  return typeof v === 'number'
    ? Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
    : v;
}
