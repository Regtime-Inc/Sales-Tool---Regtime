import type { CapacityInput, CapacityResult } from '../../types/feasibility';
import { getZoningParams, DEFAULT_DU_FACTOR } from '../zoning/zoningTable';
import { getResidentialEquivalent } from '../zoning/equivalences';

const RESIDENTIAL_ZONE_PREFIXES = ['R', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'MX'];

export function zoneAllowsRes(zoneDist: string): boolean {
  const zu = (zoneDist || '').toUpperCase();
  if (RESIDENTIAL_ZONE_PREFIXES.some((p) => zu.startsWith(p))) return true;
  if (zu.includes('/R')) return true;
  if (/^M\d/.test(zu) && zu.includes('/')) {
    const after = zu.split('/')[1] || '';
    if (/^R\d/.test(after)) return true;
  }
  return false;
}

export function extractResDesignation(zoneDist: string): string {
  return getResidentialEquivalent(zoneDist) || '';
}

export function computeCapacity(input: CapacityInput): CapacityResult {
  const zoningParams = getZoningParams(input.zoneDist);
  const effectiveResFar = zoningParams
    ? Math.max(zoningParams.standardFar, input.residFar)
    : input.residFar;
  const duFactor = zoningParams?.duFactor ?? DEFAULT_DU_FACTOR;
  const zoningSource = zoningParams ? 'table' as const : 'pluto' as const;

  const maxResFa = effectiveResFar * input.lotArea;
  const maxAllowFar = Math.max(effectiveResFar, input.commFar, input.facilFar);
  const maxBuildableSf = maxAllowFar * input.lotArea;
  const buildableSlackSf = Math.max(maxBuildableSf - input.existingBldgArea, 0);
  const newResFa = Math.max(maxResFa - input.existingBldgArea, 0);
  const isVacant = input.existingBldgArea <= 0 || input.landUse === '11';
  const zoneAllowsResidential = zoneAllowsRes(input.zoneDist);

  const qualifyingAffordableFar = zoningParams?.qualifyingAffordableFar ?? null;
  const qualifyingAffordableFa = qualifyingAffordableFar !== null
    ? Math.round(qualifyingAffordableFar * input.lotArea)
    : null;

  return {
    maxResFa: Math.round(maxResFa),
    maxBuildableSf: Math.round(maxBuildableSf),
    existingBldgArea: Math.round(input.existingBldgArea),
    buildableSlackSf: Math.round(buildableSlackSf),
    newResFa: Math.round(newResFa),
    isVacant,
    zoneAllowsResidential,
    duFactor,
    qualifyingAffordableFar,
    qualifyingAffordableFa,
    zoningSource,
  };
}
