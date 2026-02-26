import { supabase } from './supabase';
import type { UnitTypeConfig, RentAssumption } from '../types/optimizer';

export interface MarketEstimate {
  unitType: string;
  monthlyRent: number;
  avgSf: number;
}

const FALLBACK_RENTS: Record<string, MarketEstimate[]> = {
  '1': [
    { unitType: 'Studio', monthlyRent: 3200, avgSf: 450 },
    { unitType: '1BR', monthlyRent: 4100, avgSf: 650 },
    { unitType: '2BR', monthlyRent: 5500, avgSf: 950 },
    { unitType: '3BR', monthlyRent: 7200, avgSf: 1250 },
  ],
  '2': [
    { unitType: 'Studio', monthlyRent: 1600, avgSf: 400 },
    { unitType: '1BR', monthlyRent: 1900, avgSf: 600 },
    { unitType: '2BR', monthlyRent: 2300, avgSf: 850 },
    { unitType: '3BR', monthlyRent: 2700, avgSf: 1100 },
  ],
  '3': [
    { unitType: 'Studio', monthlyRent: 2500, avgSf: 425 },
    { unitType: '1BR', monthlyRent: 3200, avgSf: 625 },
    { unitType: '2BR', monthlyRent: 4000, avgSf: 900 },
    { unitType: '3BR', monthlyRent: 5000, avgSf: 1200 },
  ],
  '4': [
    { unitType: 'Studio', monthlyRent: 1800, avgSf: 425 },
    { unitType: '1BR', monthlyRent: 2300, avgSf: 625 },
    { unitType: '2BR', monthlyRent: 2900, avgSf: 875 },
    { unitType: '3BR', monthlyRent: 3500, avgSf: 1150 },
  ],
  '5': [
    { unitType: 'Studio', monthlyRent: 1400, avgSf: 450 },
    { unitType: '1BR', monthlyRent: 1700, avgSf: 650 },
    { unitType: '2BR', monthlyRent: 2100, avgSf: 950 },
    { unitType: '3BR', monthlyRent: 2600, avgSf: 1250 },
  ],
};

const DEFAULT_ESTIMATES: MarketEstimate[] = [
  { unitType: 'Studio', monthlyRent: 2500, avgSf: 425 },
  { unitType: '1BR', monthlyRent: 3200, avgSf: 625 },
  { unitType: '2BR', monthlyRent: 4000, avgSf: 900 },
  { unitType: '3BR', monthlyRent: 5000, avgSf: 1200 },
];

const BOROUGH_NAMES: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

export function getBoroughName(code: string): string {
  return BOROUGH_NAMES[code] ?? 'Unknown';
}

export async function getLocationEstimates(boroughCode: string): Promise<{
  estimates: MarketEstimate[];
  source: string;
}> {
  try {
    const { data, error } = await supabase
      .from('market_rent_estimates')
      .select('unit_type, monthly_rent, avg_sf')
      .eq('borough_code', boroughCode);

    if (!error && data && data.length > 0) {
      return {
        estimates: data.map((r) => ({
          unitType: r.unit_type,
          monthlyRent: r.monthly_rent,
          avgSf: r.avg_sf,
        })),
        source: `${getBoroughName(boroughCode)} avg (Supabase)`,
      };
    }
  } catch {
    // fall through
  }

  const fallback = FALLBACK_RENTS[boroughCode] ?? DEFAULT_ESTIMATES;
  return {
    estimates: fallback,
    source: FALLBACK_RENTS[boroughCode]
      ? `${getBoroughName(boroughCode)} avg (local fallback)`
      : 'NYC default estimate',
  };
}

export function estimatesToRents(estimates: MarketEstimate[]): Record<string, number> {
  const rents: Record<string, number> = {};
  for (const e of estimates) {
    rents[e.unitType] = e.monthlyRent;
  }
  return rents;
}

export function estimatesToRentAssumptions(
  estimates: MarketEstimate[],
  baseRents: RentAssumption[]
): RentAssumption[] {
  return baseRents.map((r) => {
    if (r.amiBand === 0) {
      const match = estimates.find((e) => e.unitType === r.unitType);
      if (match) return { ...r, monthlyRent: match.monthlyRent };
    }
    return r;
  });
}

const SF_SPREAD = 0.15;

export function estimatesToUnitTypes(estimates: MarketEstimate[]): UnitTypeConfig[] {
  return estimates.map((e) => ({
    type: e.unitType,
    minSF: Math.round(e.avgSf * (1 - SF_SPREAD)),
    maxSF: Math.round(e.avgSf * (1 + SF_SPREAD)),
  }));
}

export interface UnitMixRecommendation {
  recommended: string[];
  weights: Record<string, number>;
  reasoning: string;
}

export function inferOptimalUnitMix(
  boroughCode: string | undefined,
  zoneDist: string | undefined,
  lotArea: number | undefined,
  residFar: number | undefined,
  numFloors: number | undefined,
  unitsRes: number | undefined,
): UnitMixRecommendation {
  const zone = (zoneDist || '').toUpperCase();
  const boro = boroughCode || '0';
  const lot = lotArea || 0;
  const rFar = residFar || 0;
  const floors = numFloors || 0;

  const weights: Record<string, number> = {
    Studio: 0.25,
    '1BR': 0.30,
    '2BR': 0.25,
    '3BR': 0.20,
  };

  const reasons: string[] = [];

  const isHighDensityManhattan =
    boro === '1' ||
    zone.startsWith('R10') ||
    zone.startsWith('C5') ||
    zone.startsWith('C6') ||
    zone.startsWith('C1-9') ||
    zone.startsWith('C2-8');

  if (isHighDensityManhattan) {
    weights['Studio'] = 0.30;
    weights['1BR'] = 0.35;
    weights['2BR'] = 0.25;
    weights['3BR'] = 0.10;
    reasons.push('High-density Manhattan zone favoring smaller units');
  }

  const isFamilyOriented =
    boro === '2' || boro === '5' ||
    zone.startsWith('R5') || zone.startsWith('R6') ||
    zone.startsWith('R3') || zone.startsWith('R4');

  if (isFamilyOriented && !isHighDensityManhattan) {
    weights['Studio'] = 0.10;
    weights['1BR'] = 0.20;
    weights['2BR'] = 0.40;
    weights['3BR'] = 0.30;
    reasons.push('Family-oriented borough/zone favoring larger units');
  }

  const isMidRise = !isHighDensityManhattan && !isFamilyOriented;
  if (isMidRise) {
    if (zone.startsWith('R7') || zone.startsWith('R8') || zone.startsWith('R9')) {
      weights['Studio'] = 0.20;
      weights['1BR'] = 0.30;
      weights['2BR'] = 0.30;
      weights['3BR'] = 0.20;
      reasons.push('Mid-to-high density residential zone');
    }
  }

  if (rFar >= 6 && floors >= 15) {
    weights['Studio'] += 0.05;
    weights['1BR'] += 0.05;
    weights['2BR'] -= 0.05;
    weights['3BR'] -= 0.05;
    reasons.push('High-rise tower profile');
  }

  if (lot > 20000 && rFar < 3) {
    weights['2BR'] += 0.05;
    weights['3BR'] += 0.05;
    weights['Studio'] -= 0.05;
    weights['1BR'] -= 0.05;
    reasons.push('Large lot / low density');
  }

  if (unitsRes && unitsRes > 0 && unitsRes <= 10) {
    weights['2BR'] += 0.05;
    weights['3BR'] += 0.05;
    weights['Studio'] -= 0.05;
    weights['1BR'] -= 0.05;
    reasons.push('Small building, family-sized units');
  }

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(weights)) {
    weights[k] = Math.max(0, weights[k] / total);
  }

  const threshold = 0.10;
  const recommended = Object.entries(weights)
    .filter(([, w]) => w >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([type]) => type);

  if (recommended.length === 0) {
    return {
      recommended: ['Studio', '1BR', '2BR', '3BR'],
      weights,
      reasoning: 'Default balanced mix',
    };
  }

  return {
    recommended,
    weights,
    reasoning: reasons.length > 0 ? reasons.join('; ') : 'Balanced mix for this location',
  };
}
