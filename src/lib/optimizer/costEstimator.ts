export interface CostEstimatorInput {
  bldgClass: string;
  zoneDist: string;
  numFloors: number;
  borough: string;
  yearBuilt: number;
  landUse: string;
  lotArea: number;
}

export interface CostEstimate {
  estimatedHardCostPerSF: number;
  tier: string;
  adjustments: string[];
}

interface TierMatch {
  tier: string;
  base: number;
  luxury: boolean;
}

function classifyTier(input: CostEstimatorInput): TierMatch {
  const z = (input.zoneDist || '').toUpperCase();
  const lu = input.landUse || '';
  const bc = (input.bldgClass || '').toUpperCase();

  if (bc.startsWith('R') || z.startsWith('R10')) {
    return { tier: 'Luxury Residential', base: 500, luxury: true };
  }

  if (['05', '06'].includes(lu) || 'OKLEFGHIJ'.split('').some((c) => bc.startsWith(c))) {
    return { tier: 'Commercial / Office', base: 300, luxury: false };
  }

  const isMixedUse = z.startsWith('C') || (z.startsWith('M') && z.includes('/'));
  if (isMixedUse) {
    return { tier: 'Mixed-Use / Multi-family', base: 400, luxury: false };
  }

  const isHighDensityRes = ['R6', 'R7', 'R8', 'R9'].some((r) => z.startsWith(r));
  if (isHighDensityRes || ['02', '03'].includes(lu) || 'CD'.split('').some((c) => bc.startsWith(c))) {
    return { tier: 'Multi-family Residential', base: 350, luxury: false };
  }

  const isLowDensityRes = ['R1', 'R2', 'R3', 'R4', 'R5'].some((r) => z.startsWith(r));
  if (isLowDensityRes || ['01'].includes(lu) || 'ABS'.split('').some((c) => bc.startsWith(c))) {
    return { tier: 'Standard Residential', base: 325, luxury: false };
  }

  return { tier: 'General', base: 350, luxury: false };
}

export function estimateHardCost(input: CostEstimatorInput): CostEstimate {
  const { tier, base, luxury } = classifyTier(input);
  const adjustments: string[] = [];
  let cost = base;

  if (input.numFloors > 30) {
    cost += 250;
    adjustments.push(`Supertall (${input.numFloors} stories): +$250/SF`);
  } else if (input.numFloors > 15) {
    cost += 150;
    adjustments.push(`Tall high-rise (${input.numFloors} stories): +$150/SF`);
  } else if (input.numFloors > 7) {
    cost += 75;
    adjustments.push(`High-rise (${input.numFloors} stories): +$75/SF`);
  }

  if (input.borough === '1') {
    cost += 75;
    adjustments.push('Manhattan: +$75/SF');
  }

  if (luxury && !adjustments.some((a) => a.includes('Luxury'))) {
    cost += 150;
    adjustments.push('Luxury finish (R-class / R10): +$150/SF');
  }

  if (input.yearBuilt > 0 && input.yearBuilt < 1940) {
    cost += 75;
    adjustments.push(`Pre-war conversion (built ${input.yearBuilt}): +$75/SF`);
  }

  if (input.lotArea > 0 && input.lotArea < 2500) {
    cost += 25;
    adjustments.push(`Small lot (${input.lotArea.toLocaleString()} SF): +$25/SF`);
  }

  const cap = luxury ? 1500 : 1000;
  if (cost > cap) {
    cost = cap;
    adjustments.push(`Capped at $${cap}/SF`);
  }

  return {
    estimatedHardCostPerSF: Math.round(cost),
    tier,
    adjustments,
  };
}

export function estimateLandCost(
  saleAmount: number | null,
  buildableSF: number | null,
  ppbsf: number | null,
): { landCostPerSF: number; source: string } {
  if (ppbsf && ppbsf > 0) {
    return {
      landCostPerSF: Math.round(ppbsf),
      source: `ACRIS sale: $${Math.round(ppbsf)}/buildable SF`,
    };
  }

  if (saleAmount && saleAmount > 0 && buildableSF && buildableSF > 0) {
    const derived = Math.round(saleAmount / buildableSF);
    return {
      landCostPerSF: derived,
      source: `Derived: $${saleAmount.toLocaleString()} / ${buildableSF.toLocaleString()} buildable SF`,
    };
  }

  return {
    landCostPerSF: 150,
    source: 'Default estimate (no sale data)',
  };
}
