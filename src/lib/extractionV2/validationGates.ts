import type {
  ExtractionV2Result,
  ValidationGate,
  ValidationGateStatus,
  Evidence,
} from './types';
import { getZoningParams } from '../zoning/zoningTable';

interface PlutoData {
  lotarea: number;
  residfar: number;
  bldgarea: number;
}

const AVG_UNIT_SF_FLOOR = 680;
const AVG_UNIT_SF_CEILING = 800;
const UNIT_COUNT_HIGH_MULTIPLIER = 1.5;
const UNIT_COUNT_LOW_MULTIPLIER = 0.25;
const FAR_TOLERANCE = 0.2;

function computeImpliedMaxUnits(lotArea: number, residFar: number): number {
  const usableFloorArea = lotArea * residFar * 0.80;
  return Math.ceil(usableFloorArea / AVG_UNIT_SF_CEILING);
}

function computeImpliedMinUnits(lotArea: number, residFar: number): number {
  const usableFloorArea = lotArea * residFar * 0.80;
  return Math.max(1, Math.floor(usableFloorArea / (AVG_UNIT_SF_FLOOR * 1.5)));
}

export function applyValidationGates(
  v2Result: ExtractionV2Result,
  plutoData?: PlutoData | null,
  zoneDist?: string | null,
): { gates: ValidationGate[]; passedAll: boolean; needsManualFields: string[] } {
  const gates: ValidationGate[] = [];
  const needsManualFields: string[] = [];

  if (v2Result.totalUnits && plutoData && plutoData.lotarea > 0 && plutoData.residfar > 0) {
    const extractedUnits = v2Result.totalUnits.value;
    const impliedMax = computeImpliedMaxUnits(plutoData.lotarea, plutoData.residfar);
    const impliedMin = computeImpliedMinUnits(plutoData.lotarea, plutoData.residfar);
    const ceiling = Math.ceil(impliedMax * UNIT_COUNT_HIGH_MULTIPLIER);
    const floor = Math.max(1, Math.floor(impliedMin * UNIT_COUNT_LOW_MULTIPLIER));

    let status: ValidationGateStatus = 'PASS';
    let message = `Unit count ${extractedUnits} is within expected range (${floor}-${ceiling})`;

    if (extractedUnits > ceiling) {
      status = 'NEEDS_OVERRIDE';
      message = `Extracted unit count (${extractedUnits}) exceeds 150% of city-data implied maximum (${impliedMax}). Lot: ${plutoData.lotarea.toLocaleString()} SF, FAR: ${plutoData.residfar}`;
      needsManualFields.push('totalUnits');
    } else if (extractedUnits < floor) {
      status = 'NEEDS_OVERRIDE';
      message = `Extracted unit count (${extractedUnits}) is below 25% of city-data implied minimum (${impliedMin}). Lot: ${plutoData.lotarea.toLocaleString()} SF, FAR: ${plutoData.residfar}`;
      needsManualFields.push('totalUnits');
    } else if (extractedUnits > impliedMax * 1.2 || extractedUnits < impliedMin * 0.5) {
      status = 'WARN';
      message = `Unit count ${extractedUnits} is borderline. City data implies ${impliedMin}-${impliedMax} units.`;
    }

    gates.push({
      field: 'totalUnits',
      extractedValue: extractedUnits,
      expectedRange: { min: floor, max: ceiling },
      cityBasis: `PLUTO lot area ${plutoData.lotarea.toLocaleString()} SF, resid FAR ${plutoData.residfar}`,
      status,
      evidence: v2Result.totalUnits.evidence,
      message,
    });
  }

  const extractedFar = v2Result.zoning.far?.value ?? null;
  if (extractedFar !== null && plutoData && plutoData.residfar > 0) {
    const plutoFar = plutoData.residfar;
    const deviation = Math.abs(extractedFar - plutoFar) / plutoFar;

    const zoneKey = zoneDist ?? v2Result.zoning.zone?.value ?? null;
    const zoningParams = zoneKey ? getZoningParams(zoneKey) : null;
    const maxLegalFar = zoningParams
      ? zoningParams.qualifyingAffordableFar
      : plutoFar * 1.5;

    let status: ValidationGateStatus = 'PASS';
    let message = `Extracted FAR ${extractedFar.toFixed(2)} is within 20% of PLUTO FAR ${plutoFar.toFixed(2)}`;

    if (deviation > FAR_TOLERANCE) {
      if (extractedFar <= maxLegalFar) {
        status = 'WARN';
        message = `Extracted FAR ${extractedFar.toFixed(2)} deviates ${(deviation * 100).toFixed(0)}% from PLUTO FAR ${plutoFar.toFixed(2)}, but within affordable bonus FAR (${maxLegalFar.toFixed(2)})`;
      } else {
        status = 'NEEDS_OVERRIDE';
        message = `Extracted FAR ${extractedFar.toFixed(2)} deviates ${(deviation * 100).toFixed(0)}% from PLUTO FAR ${plutoFar.toFixed(2)} and exceeds max legal FAR (${maxLegalFar.toFixed(2)})`;
        needsManualFields.push('far');
      }
    }

    gates.push({
      field: 'far',
      extractedValue: extractedFar,
      expectedRange: { min: plutoFar * (1 - FAR_TOLERANCE), max: maxLegalFar },
      cityBasis: `PLUTO resid FAR ${plutoFar.toFixed(2)}${zoningParams ? `, zone ${zoneKey} max affordable FAR ${maxLegalFar.toFixed(2)}` : ''}`,
      status,
      evidence: v2Result.zoning.far?.evidence ?? [],
      message,
    });
  }

  if (v2Result.unitCountMentions.length > 0) {
    const values = v2Result.unitCountMentions.map((m) => m.value);
    const unique = [...new Set(values)];

    if (unique.length > 1) {
      const resolved = v2Result.totalUnits?.value ?? 0;
      const agreeing = values.filter((v) => Math.abs(v - resolved) <= 2).length;
      const disagreeing = values.filter((v) => Math.abs(v - resolved) > 2);

      if (disagreeing.length > 0) {
        const maxDisagree = Math.max(...disagreeing);
        const minDisagree = Math.min(...disagreeing);
        const variance = resolved > 0 ? Math.abs(maxDisagree - resolved) / resolved : 1;

        let status: ValidationGateStatus = 'WARN';
        let message = `${agreeing}/${values.length} sources agree on ~${resolved} units; ${disagreeing.length} disagree (${[...new Set(disagreeing)].join(', ')})`;

        if (variance > 0.3 && agreeing < 2) {
          status = 'CONFLICTING';
          message = `Significant conflict: sources report ${unique.join(', ')} units. Only ${agreeing} source(s) agree on ${resolved}.`;
          needsManualFields.push('totalUnits');
        }

        const evidence: Evidence[] = v2Result.unitCountMentions
          .filter((m) => Math.abs(m.value - resolved) > 2)
          .map((m) => ({
            page: m.page,
            snippet: m.snippet,
            sourceType: m.sourceType === 'llm' ? 'regex' as const : m.sourceType,
            confidence: m.confidence,
          }));

        gates.push({
          field: 'unitCountRedundancy',
          extractedValue: resolved,
          expectedRange: { min: Math.min(...values), max: Math.max(...values) },
          cityBasis: `${values.length} mentions found across PDF (${v2Result.redundancyScore.toFixed(2)} redundancy score)`,
          status,
          evidence,
          message,
        });
      }
    }
  }

  const lotArea = v2Result.zoning.lotArea?.value ?? null;
  if (lotArea !== null && plutoData && plutoData.lotarea > 0) {
    const deviation = Math.abs(lotArea - plutoData.lotarea) / plutoData.lotarea;
    let status: ValidationGateStatus = 'PASS';
    let message = `Extracted lot area ${lotArea.toLocaleString()} SF matches PLUTO ${plutoData.lotarea.toLocaleString()} SF`;

    if (deviation > 0.15) {
      status = 'NEEDS_OVERRIDE';
      message = `Extracted lot area ${lotArea.toLocaleString()} SF deviates ${(deviation * 100).toFixed(0)}% from PLUTO ${plutoData.lotarea.toLocaleString()} SF`;
      needsManualFields.push('lotArea');
    } else if (deviation > 0.08) {
      status = 'WARN';
      message = `Extracted lot area ${lotArea.toLocaleString()} SF differs by ${(deviation * 100).toFixed(0)}% from PLUTO ${plutoData.lotarea.toLocaleString()} SF`;
    }

    gates.push({
      field: 'lotArea',
      extractedValue: lotArea,
      expectedRange: { min: plutoData.lotarea * 0.85, max: plutoData.lotarea * 1.15 },
      cityBasis: `PLUTO lot area ${plutoData.lotarea.toLocaleString()} SF`,
      status,
      evidence: v2Result.zoning.lotArea?.evidence ?? [],
      message,
    });
  }

  const passedAll = gates.every((g) => g.status === 'PASS' || g.status === 'WARN');

  return { gates, passedAll, needsManualFields };
}
