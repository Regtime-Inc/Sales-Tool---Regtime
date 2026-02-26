export interface ZoningDistrictParams {
  standardFar: number;
  qualifyingAffordableFar: number;
  duFactor: number;
  isQualityHousingMandatory: boolean;
}

const ZONING_TABLE: Record<string, ZoningDistrictParams> = {
  R6:   { standardFar: 2.20, qualifyingAffordableFar: 3.90, duFactor: 680, isQualityHousingMandatory: false },
  R6A:  { standardFar: 3.00, qualifyingAffordableFar: 3.90, duFactor: 680, isQualityHousingMandatory: true },
  'R6-1': { standardFar: 3.00, qualifyingAffordableFar: 3.90, duFactor: 680, isQualityHousingMandatory: false },
  R6B:  { standardFar: 2.00, qualifyingAffordableFar: 2.40, duFactor: 680, isQualityHousingMandatory: true },
  R6D:  { standardFar: 2.50, qualifyingAffordableFar: 3.00, duFactor: 680, isQualityHousingMandatory: false },
  'R6-2': { standardFar: 2.50, qualifyingAffordableFar: 3.00, duFactor: 680, isQualityHousingMandatory: false },

  R7A:  { standardFar: 4.00, qualifyingAffordableFar: 5.01, duFactor: 680, isQualityHousingMandatory: true },
  'R7-1': { standardFar: 3.44, qualifyingAffordableFar: 5.01, duFactor: 680, isQualityHousingMandatory: false },
  'R7-2': { standardFar: 3.44, qualifyingAffordableFar: 5.01, duFactor: 680, isQualityHousingMandatory: false },
  R7D:  { standardFar: 4.66, qualifyingAffordableFar: 5.60, duFactor: 680, isQualityHousingMandatory: true },
  R7X:  { standardFar: 5.00, qualifyingAffordableFar: 6.00, duFactor: 680, isQualityHousingMandatory: true },
  'R7-3': { standardFar: 5.00, qualifyingAffordableFar: 6.00, duFactor: 680, isQualityHousingMandatory: false },

  R8:   { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680, isQualityHousingMandatory: false },
  R8A:  { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680, isQualityHousingMandatory: true },
  R8X:  { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680, isQualityHousingMandatory: true },
  R8B:  { standardFar: 4.00, qualifyingAffordableFar: 4.80, duFactor: 680, isQualityHousingMandatory: true },

  R9:   { standardFar: 7.52, qualifyingAffordableFar: 9.02, duFactor: 680, isQualityHousingMandatory: false },
  R9A:  { standardFar: 7.52, qualifyingAffordableFar: 9.02, duFactor: 680, isQualityHousingMandatory: true },
  R9D:  { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680, isQualityHousingMandatory: true },
  R9X:  { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680, isQualityHousingMandatory: true },
  'R9-1': { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680, isQualityHousingMandatory: false },

  R10:  { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680, isQualityHousingMandatory: false },
  R10A: { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680, isQualityHousingMandatory: true },
  R10X: { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680, isQualityHousingMandatory: true },

  R11:  { standardFar: 12.00, qualifyingAffordableFar: 15.00, duFactor: 680, isQualityHousingMandatory: false },
  R12:  { standardFar: 15.00, qualifyingAffordableFar: 18.00, duFactor: 680, isQualityHousingMandatory: false },
};

import { getResidentialEquivalent, isUapEligibleDistrict } from './equivalences';

export const DEFAULT_DU_FACTOR = 700;
export const ZONING_DU_FACTOR = 680;

function normalizeZoneKey(zoneDist: string): string {
  const zu = (zoneDist || '').toUpperCase().trim();
  if (zu.startsWith('R')) {
    const base = zu.split(/[^A-Z0-9-]/)[0];
    return base;
  }
  if (zu.includes('/')) {
    const after = zu.split('/')[1] || '';
    if (/^R\d/.test(after)) return after.split(/[^A-Z0-9-]/)[0];
  }
  const res = getResidentialEquivalent(zu);
  if (res) return res;
  return zu;
}

export function getZoningParams(zoneDist: string): ZoningDistrictParams | null {
  const key = normalizeZoneKey(zoneDist);
  if (ZONING_TABLE[key]) return ZONING_TABLE[key];

  const rMatch = key.match(/^(R\d+)/);
  if (rMatch) {
    const base = rMatch[1];
    if (ZONING_TABLE[base]) return ZONING_TABLE[base];
  }

  return null;
}

export function isUapEligibleZone(zoneDist: string): boolean {
  if (!isUapEligibleDistrict(zoneDist)) return false;
  const params = getZoningParams(zoneDist);
  return params !== null && params.qualifyingAffordableFar > params.standardFar;
}
