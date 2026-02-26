import type { NormalizedPlanExtract, ValidationResult } from '../../types/pdf';

interface PlutoInput {
  lotarea: number;
  residfar: number;
  bldgarea: number;
}

const UNIT_SIZE_RANGES: Record<string, { min: number; max: number }> = {
  Studio: { min: 300, max: 600 },
  '1BR': { min: 500, max: 850 },
  '2BR': { min: 700, max: 1200 },
  '3BR': { min: 900, max: 1500 },
};

export function validateExtraction(
  normalized: NormalizedPlanExtract,
  plutoData?: PlutoInput | null
): ValidationResult {
  const warnings: string[] = [];
  let penalty = 0;

  const { lotAreaSf, zoningFloorAreaSf, far } = normalized.zoning;

  if (lotAreaSf && zoningFloorAreaSf && lotAreaSf > 0) {
    const computedFar = zoningFloorAreaSf / lotAreaSf;
    if (far !== null) {
      const diff = Math.abs(far - computedFar) / computedFar;
      if (diff > 0.02) {
        warnings.push(
          `FAR inconsistency: extracted ${far.toFixed(2)} vs computed ${computedFar.toFixed(2)} (ZFA/Lot Area). Difference: ${(diff * 100).toFixed(1)}%`
        );
        penalty += 0.1;
      }
    }
  }

  const { totals, unitMix } = normalized;
  if (totals.totalUnits !== null && unitMix) {
    const mixTotal =
      (unitMix.studio || 0) +
      (unitMix.br1 || 0) +
      (unitMix.br2 || 0) +
      (unitMix.br3 || 0) +
      (unitMix.br4plus || 0);
    if (mixTotal > 0 && totals.totalUnits > 0) {
      const diff = Math.abs(totals.totalUnits - mixTotal) / totals.totalUnits;
      if (diff > 0.05) {
        warnings.push(
          `Unit count mismatch: total ${totals.totalUnits} vs bedroom mix sum ${mixTotal} (${(diff * 100).toFixed(1)}% diff)`
        );
        penalty += 0.08;
      }
    }
  }

  for (const [type, sizes] of Object.entries(normalized.unitSizes.byType)) {
    const range = UNIT_SIZE_RANGES[type];
    if (!range || sizes.length === 0) continue;
    const avg = sizes.reduce((s, v) => s + v, 0) / sizes.length;
    if (avg < range.min * 0.8 || avg > range.max * 1.3) {
      warnings.push(
        `${type} avg size ${Math.round(avg)} SF is outside typical NYC range (${range.min}-${range.max} SF)`
      );
    }
  }

  if (plutoData) {
    if (lotAreaSf && plutoData.lotarea > 0) {
      const diff = Math.abs(lotAreaSf - plutoData.lotarea) / plutoData.lotarea;
      if (diff > 0.1) {
        warnings.push(
          `Lot area mismatch: extracted ${lotAreaSf.toLocaleString()} SF vs PLUTO ${plutoData.lotarea.toLocaleString()} SF (${(diff * 100).toFixed(1)}% diff)`
        );
        penalty += 0.05;
      }
    }

    if (far !== null && plutoData.residfar > 0) {
      if (far > plutoData.residfar * 1.05) {
        warnings.push(
          `Extracted FAR ${far.toFixed(2)} exceeds PLUTO residential FAR ${plutoData.residfar.toFixed(2)} by ${((far / plutoData.residfar - 1) * 100).toFixed(1)}%`
        );
        penalty += 0.05;
      }
    }
  }

  const baseConfidence = normalized.confidence.overall;
  const adjustedConfidence = Math.max(0.1, Math.min(0.99, baseConfidence - penalty));

  return { warnings, adjustedConfidence };
}
