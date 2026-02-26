import type {
  Signal,
  ExtractionV2Result,
  CoverSheetSignals,
  ZoningSignals,
  UnitMixSignal,
  ClassifiedTable,
  UnitCountMention,
} from './types';
import type { UnitRecord } from '../../types/pdf';

interface WeightedSignal {
  value: number;
  confidence: number;
  source: string;
  signal: Signal<number>;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  cover_sheet: 0.9,
  zoning: 0.85,
  table: 0.8,
};

export function computeRedundancyScore(
  mentions: UnitCountMention[],
  resolvedValue: number,
): number {
  if (mentions.length === 0) return 0;

  const agreeing = mentions.filter((m) => Math.abs(m.value - resolvedValue) <= 2);
  const uniqueSources = new Set(agreeing.map((m) => `${m.sourceType}-${m.page}`));
  const sourceCount = uniqueSources.size;

  if (sourceCount >= 3) return 0.95;
  if (sourceCount === 2) return 0.85;
  if (sourceCount === 1) return 0.6;
  return 0.3;
}

function resolveUnitCount(
  coverSheet: CoverSheetSignals,
  zoning: ZoningSignals,
  tableCounts: UnitMixSignal,
  warnings: string[],
  mentions: UnitCountMention[],
): Signal<number> | null {
  const candidates: WeightedSignal[] = [];

  if (coverSheet.totalUnits) {
    candidates.push({
      value: coverSheet.totalUnits.value,
      confidence: coverSheet.totalUnits.confidence * SOURCE_WEIGHTS.cover_sheet,
      source: 'cover_sheet',
      signal: coverSheet.totalUnits,
    });
  }

  if (zoning.totalDwellingUnits) {
    candidates.push({
      value: zoning.totalDwellingUnits.value,
      confidence: zoning.totalDwellingUnits.confidence * SOURCE_WEIGHTS.zoning,
      source: 'zoning',
      signal: zoning.totalDwellingUnits,
    });
  }

  if (tableCounts.totalUnits) {
    candidates.push({
      value: tableCounts.totalUnits.value,
      confidence: tableCounts.totalUnits.confidence * SOURCE_WEIGHTS.table,
      source: 'table',
      signal: tableCounts.totalUnits,
    });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const only = candidates[0];
    only.confidence = Math.min(only.confidence, 0.6);
    return {
      value: only.value,
      confidence: only.confidence,
      evidence: only.signal.evidence,
    };
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (Math.abs(candidates[i].value - candidates[j].value) <= 2) {
        candidates[i].confidence = Math.min(1, candidates[i].confidence + 0.1);
        candidates[j].confidence = Math.min(1, candidates[j].confidence + 0.1);
      }
    }
  }

  const values = candidates.map((c) => c.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);

  if (maxVal > minVal * 2 && minVal < 30) {
    const highCand = candidates.find((c) => c.value === maxVal);
    const lowCand = candidates.find((c) => c.value === minVal);
    if (highCand && lowCand) {
      highCand.confidence = Math.max(0, highCand.confidence - 0.4);
      warnings.push(
        `Conflicting unit counts: ${lowCand.source} says ${lowCand.value}, ${highCand.source} says ${highCand.value}. Using ${lowCand.source} value.`
      );
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];

  const redundancy = computeRedundancyScore(mentions, best.value);
  if (redundancy >= 0.95 && candidates.length >= 3) {
    best.confidence = Math.min(1, best.confidence + 0.05);
  }

  return {
    value: best.value,
    confidence: best.confidence,
    evidence: best.signal.evidence,
  };
}

export function resolveExtraction(
  coverSheet: CoverSheetSignals,
  zoning: ZoningSignals,
  tableCounts: UnitMixSignal,
  tablesSummary: ClassifiedTable[],
  ocrUsed: boolean,
  unitCountMentions: UnitCountMention[] = [],
): ExtractionV2Result {
  const warnings: string[] = [];

  const totalUnits = resolveUnitCount(coverSheet, zoning, tableCounts, warnings, unitCountMentions);

  const resolvedValue = totalUnits?.value ?? 0;
  const redundancyScore = computeRedundancyScore(unitCountMentions, resolvedValue);

  let unitMix = tableCounts.unitMix;
  if (!unitMix) {
    warnings.push('Unit mix schedule not found; not inferred from floor plans.');
  }

  let unitRecords: UnitRecord[] = tableCounts.unitRecords?.value ?? [];

  if (unitRecords.length === 0 && totalUnits && totalUnits.value > 0) {
    warnings.push('No unit schedule table found. Total unit count is from cover sheet/zoning text only.');
  }

  if (
    totalUnits &&
    unitRecords.length > 0 &&
    Math.abs(unitRecords.length - totalUnits.value) > 2
  ) {
    warnings.push(
      `Unit records (${unitRecords.length}) differ from resolved total (${totalUnits.value}); records may be incomplete.`
    );
  }

  const hasNoAffordableData = unitRecords.every((r) => r.allocation === 'UNKNOWN');
  if (hasNoAffordableData && unitRecords.length > 0) {
    warnings.push('Affordable/Market allocation not found in plans.');
  }

  const resolvedZoning: ZoningSignals = {
    totalDwellingUnits: zoning.totalDwellingUnits,
    lotArea: zoning.lotArea ?? coverSheet.lotArea,
    far: zoning.far ?? coverSheet.far,
    zoningFloorArea: zoning.zoningFloorArea,
    zone: zoning.zone ?? coverSheet.zone,
  };

  return {
    totalUnits,
    unitMix,
    unitRecords,
    zoning: resolvedZoning,
    coverSheet,
    warnings,
    tablesSummary,
    ocrUsed,
    unitCountMentions,
    redundancyScore,
    validationGates: [],
    llmReconciliation: [],
    pageRelevance: [],
  };
}
