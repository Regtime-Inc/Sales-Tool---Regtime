import type {
  OptimizerInputs,
  OptimizerResult,
  UnitAllocation,
  RentAssumption,
  ProgramConstraint,
  UnitTypeConfig,
} from '../../types/optimizer';
import { evaluateConstraints, isFeasible } from './constraints';
import { getRentLimit } from '../rentLimits';
import { mergeProgramConstraints } from './mergeConstraints';
import type { MergedBandRequirement } from './mergeConstraints';

function getRent(
  rents: RentAssumption[],
  unitType: string,
  amiBand: number
): number {
  if (amiBand > 0) {
    const hpdRent = getRentLimit(unitType, amiBand);
    if (hpdRent !== null) return hpdRent;
  }

  const exact = rents.find((r) => r.unitType === unitType && r.amiBand === amiBand);
  if (exact) return exact.monthlyRent;
  const sameType = rents.filter((r) => r.unitType === unitType);
  if (sameType.length === 0) return 2000;
  const closest = sameType.reduce((best, r) =>
    Math.abs(r.amiBand - amiBand) < Math.abs(best.amiBand - amiBand) ? r : best
  );
  return closest.monthlyRent;
}

function computeRevenue(allocations: UnitAllocation[]): number {
  return allocations.reduce((s, a) => s + a.count * a.monthlyRent * 12, 0);
}

function computeCost(
  totalSF: number,
  hardCostPerSF: number,
  softCostPct: number,
  landCostPerSF: number
): number {
  const hard = totalSF * hardCostPerSF;
  return hard + hard * softCostPct + totalSF * landCostPerSF;
}

function computeSummary(allocations: UnitAllocation[]) {
  const affordableAllocs = allocations.filter((a) => a.amiBand > 0);
  const marketAllocs = allocations.filter((a) => a.amiBand === 0);
  const affordableUnitCount = affordableAllocs.reduce((s, a) => s + a.count, 0);
  const marketUnitCount = marketAllocs.reduce((s, a) => s + a.count, 0);
  const totalMonthlyRent = allocations.reduce((s, a) => s + a.count * a.monthlyRent, 0);

  let blendedAmi = 0;
  if (affordableUnitCount > 0) {
    const weightedAmi = affordableAllocs.reduce((s, a) => s + a.amiBand * a.count, 0);
    blendedAmi = Math.round(weightedAmi / affordableUnitCount);
  }

  return { affordableUnitCount, marketUnitCount, totalMonthlyRent, blendedAmi };
}

const DEFAULT_BEDROOM_MIX: Record<string, number> = {
  Studio: 0.15,
  '1BR': 0.30,
  '2BR': 0.35,
  '3BR': 0.20,
};

const UAP_BEDROOM_MIX: Record<string, number> = {
  Studio: 0.10,
  '1BR': 0.25,
  '2BR': 0.40,
  '3BR': 0.25,
};

function getBedroomDistribution(constraint: ProgramConstraint): Record<string, number> {
  if (constraint.bedroomMix?.distribution) {
    return constraint.bedroomMix.distribution;
  }
  if (constraint.program === 'UAP') return UAP_BEDROOM_MIX;
  return DEFAULT_BEDROOM_MIX;
}

function applyUnitMinSizes(
  unitTypes: UnitTypeConfig[],
  constraints: ProgramConstraint[]
): UnitTypeConfig[] {
  const mergedMins: Record<string, number> = {};
  for (const pc of constraints) {
    if (!pc.unitMinSizes) continue;
    for (const [type, minSF] of Object.entries(pc.unitMinSizes)) {
      mergedMins[type] = Math.max(mergedMins[type] ?? 0, minSF);
    }
  }
  if (Object.keys(mergedMins).length === 0) return unitTypes;

  return unitTypes.map((ut) => {
    const required = mergedMins[ut.type];
    if (!required || ut.minSF >= required) return ut;
    return { ...ut, minSF: required, maxSF: Math.max(ut.maxSF, required) };
  });
}

function buildSolverMerge(
  constraints: ProgramConstraint[],
  estTotalUnits: number,
  allowedUnitTypes: UnitTypeConfig[],
  marketMix?: Record<string, number>
): { mergedAffordableTarget: number; bandRequirements: MergedBandRequirement[]; mergedMix: Record<string, number>; programNames: string[] } {
  if (constraints.length === 0) {
    return { mergedAffordableTarget: 0, bandRequirements: [], mergedMix: DEFAULT_BEDROOM_MIX, programNames: [] };
  }

  const merged = mergeProgramConstraints(constraints, estTotalUnits);

  const requiresProportional = constraints.some((c) => c.requiresProportionalBedrooms);
  if (requiresProportional && marketMix && Object.keys(marketMix).length > 0) {
    return {
      mergedAffordableTarget: merged.mergedAffordableTarget,
      bandRequirements: merged.bandRequirements,
      mergedMix: marketMix,
      programNames: merged.programNames,
    };
  }

  const mixWeights: Record<string, number> = {};
  for (const pc of constraints) {
    const dist = getBedroomDistribution(pc);
    for (const [ut, pct] of Object.entries(dist)) {
      mixWeights[ut] = Math.max(mixWeights[ut] ?? 0, pct);
    }
  }
  const mixTotal = Object.values(mixWeights).reduce((s, v) => s + v, 0);
  const mergedMix: Record<string, number> = {};
  for (const [ut, w] of Object.entries(mixWeights)) {
    mergedMix[ut] = w / mixTotal;
  }

  return {
    mergedAffordableTarget: merged.mergedAffordableTarget,
    bandRequirements: merged.bandRequirements,
    mergedMix,
    programNames: merged.programNames,
  };
}

function distributeByMix(
  totalCount: number,
  mix: Record<string, number>,
  unitTypes: UnitTypeConfig[]
): { type: string; count: number; avgSF: number }[] {
  const typeNames = unitTypes.map((ut) => ut.type);
  const raw = typeNames.map((t) => (mix[t] ?? 0) * totalCount);
  const floored = raw.map((v) => Math.floor(v));
  let deficit = totalCount - floored.reduce((s, v) => s + v, 0);

  const remainders = raw.map((v, i) => ({ i, r: v - floored[i] }));
  remainders.sort((a, b) => b.r - a.r);
  for (const { i } of remainders) {
    if (deficit <= 0) break;
    floored[i] += 1;
    deficit -= 1;
  }

  return typeNames.map((t, i) => ({
    type: t,
    count: floored[i],
    avgSF: Math.round((unitTypes[i].minSF + unitTypes[i].maxSF) / 2),
  }));
}

export function solve(inputs: OptimizerInputs): OptimizerResult {
  const { netResidentialSF, rentAssumptions, costAssumptions, programConstraints } = inputs;
  const effectiveUnitTypes = applyUnitMinSizes(inputs.allowedUnitTypes, programConstraints);

  if (netResidentialSF <= 0 || effectiveUnitTypes.length === 0) {
    return emptyResult();
  }

  const marketAvgSFs = effectiveUnitTypes.map((ut) => Math.round((ut.minSF + ut.maxSF) / 2));
  const bestMarketSF = Math.min(...marketAvgSFs);

  const fixedTotal = inputs.totalUnits;
  const estTotalUnits = fixedTotal && fixedTotal > 0
    ? fixedTotal
    : Math.floor(netResidentialSF / bestMarketSF);

  const allocations: UnitAllocation[] = [];
  let remainingSF = netResidentialSF;
  let remainingUnits = estTotalUnits;

  const hasUap = programConstraints.some((c) => c.program === 'UAP');
  const requiresProportional = programConstraints.some((c) => c.requiresProportionalBedrooms);
  const marketMixBase = hasUap ? UAP_BEDROOM_MIX : DEFAULT_BEDROOM_MIX;

  const { mergedAffordableTarget, bandRequirements, mergedMix, programNames } =
    buildSolverMerge(
      programConstraints,
      estTotalUnits,
      effectiveUnitTypes,
      requiresProportional ? marketMixBase : undefined,
    );

  if (mergedAffordableTarget > 0 && bandRequirements.length > 0) {
    const effectiveTarget = fixedTotal && fixedTotal > 0
      ? Math.min(mergedAffordableTarget, remainingUnits)
      : mergedAffordableTarget;

    const mixedUnits = distributeByMix(effectiveTarget, mergedMix, effectiveUnitTypes);
    const totalMixedUnits = mixedUnits.reduce((s, m) => s + m.count, 0);

    let unitIdx = 0;
    for (const br of bandRequirements) {
      let bandRemaining = Math.min(br.minUnits, totalMixedUnits);
      const tags = br.programs.length > 0 ? br.programs : programNames;

      while (bandRemaining > 0 && unitIdx < mixedUnits.length) {
        const mu = mixedUnits[unitIdx];
        if (mu.count <= 0) { unitIdx++; continue; }

        const take = Math.min(bandRemaining, mu.count);
        const sfNeeded = take * mu.avgSF;

        if (sfNeeded > remainingSF) {
          const fitCount = Math.floor(remainingSF / mu.avgSF);
          if (fitCount > 0) {
            pushAllocation(allocations, mu.type, br.amiBand, fitCount, mu.avgSF,
              getRent(rentAssumptions, mu.type, br.amiBand), tags);
            remainingSF -= fitCount * mu.avgSF;
            remainingUnits -= fitCount;
            mu.count -= fitCount;
          }
          break;
        }

        pushAllocation(allocations, mu.type, br.amiBand, take, mu.avgSF,
          getRent(rentAssumptions, mu.type, br.amiBand), tags);
        remainingSF -= sfNeeded;
        remainingUnits -= take;
        mu.count -= take;
        bandRemaining -= take;

        if (mu.count <= 0) unitIdx++;
      }
    }

    for (let i = unitIdx; i < mixedUnits.length; i++) {
      const mu = mixedUnits[i];
      if (mu.count <= 0) continue;
      const defaultBand = bandRequirements[bandRequirements.length - 1]?.amiBand ?? 60;
      const sfNeeded = mu.count * mu.avgSF;
      if (sfNeeded > remainingSF) {
        const fitCount = Math.floor(remainingSF / mu.avgSF);
        if (fitCount > 0) {
          pushAllocation(allocations, mu.type, defaultBand, fitCount, mu.avgSF,
            getRent(rentAssumptions, mu.type, defaultBand), programNames);
          remainingSF -= fitCount * mu.avgSF;
          remainingUnits -= fitCount;
        }
        break;
      }
      pushAllocation(allocations, mu.type, defaultBand, mu.count, mu.avgSF,
        getRent(rentAssumptions, mu.type, defaultBand), programNames);
      remainingSF -= sfNeeded;
      remainingUnits -= mu.count;
    }
  }

  const marketMix = hasUap ? UAP_BEDROOM_MIX : DEFAULT_BEDROOM_MIX;

  const marketTypeInfo = effectiveUnitTypes.map((ut) => {
    const avgSF = Math.round((ut.minSF + ut.maxSF) / 2);
    const rent = getRent(rentAssumptions, ut.type, 0);
    return { ...ut, avgSF, rent, revenuePerSF: rent / avgSF };
  });

  const marketEstimate = fixedTotal && fixedTotal > 0
    ? Math.max(0, remainingUnits)
    : Math.floor(remainingSF / Math.min(...marketTypeInfo.map((m) => m.avgSF)));

  if (marketEstimate > 0) {
    const mixedMarket = distributeByMix(marketEstimate, marketMix, effectiveUnitTypes);

    for (const mu of mixedMarket) {
      if (mu.count <= 0) continue;
      const info = marketTypeInfo.find((m) => m.type === mu.type);
      if (!info) continue;
      const sfNeeded = mu.count * mu.avgSF;
      if (sfNeeded > remainingSF) {
        const fitCount = Math.floor(remainingSF / mu.avgSF);
        if (fitCount > 0) {
          pushAllocation(allocations, mu.type, 0, fitCount, mu.avgSF, info.rent);
          remainingSF -= fitCount * mu.avgSF;
          remainingUnits -= fitCount;
        }
        continue;
      }
      const count = fixedTotal && fixedTotal > 0
        ? Math.min(mu.count, remainingUnits)
        : mu.count;
      if (count <= 0) continue;
      pushAllocation(allocations, mu.type, 0, count, mu.avgSF, info.rent);
      remainingSF -= count * mu.avgSF;
      remainingUnits -= count;
    }

    const bestByRevenue = [...marketTypeInfo].sort((a, b) => b.revenuePerSF - a.revenuePerSF);
    for (const mt of bestByRevenue) {
      if (remainingSF < mt.avgSF) continue;
      if (fixedTotal && fixedTotal > 0 && remainingUnits <= 0) break;
      const maxBySpace = Math.floor(remainingSF / mt.avgSF);
      const count = fixedTotal && fixedTotal > 0
        ? Math.min(maxBySpace, remainingUnits)
        : maxBySpace;
      if (count <= 0) continue;
      pushAllocation(allocations, mt.type, 0, count, mt.avgSF, mt.rent);
      remainingSF -= count * mt.avgSF;
      remainingUnits -= count;
    }
  }

  for (let repair = 0; repair < 30; repair++) {
    const slacks = evaluateConstraints(allocations.filter((a) => a.count > 0), netResidentialSF, programConstraints);
    const isFixed = fixedTotal && fixedTotal > 0;
    const violations = slacks
      .filter((s) => {
        if (s.slack >= -0.001) return false;
        if (s.constraint.includes('Total SF')) return false;
        if (isFixed) {
          return s.constraint.includes('2BR+')
            || s.constraint.includes('proportionality')
            || s.constraint.includes('Weighted avg AMI');
        }
        return true;
      })
      .sort((a, b) => a.slack - b.slack);
    if (violations.length === 0) break;

    const violated = violations[0];
    const bandMatch = violated.constraint.match(/AMI (\d+)%/);
    const marketAlloc = allocations.find((a) => a.amiBand === 0 && a.count > 0);

    if (violated.constraint.includes('2BR+')) {
      const smallAfford = allocations.find(
        (a) => a.amiBand > 0 && (a.unitType === 'Studio' || a.unitType === '1BR') && a.count > 0
      );
      if (!smallAfford) break;
      const targetType = effectiveUnitTypes.find((ut) => ut.type === '2BR') ?? effectiveUnitTypes[effectiveUnitTypes.length - 1];
      const avgSF = Math.round((targetType.minSF + targetType.maxSF) / 2);
      smallAfford.count -= 1;
      smallAfford.totalSF -= smallAfford.avgSF;
      pushAllocation(allocations, targetType.type, smallAfford.amiBand, 1, avgSF,
        getRent(rentAssumptions, targetType.type, smallAfford.amiBand), programNames);
    } else if (violated.constraint.includes('proportionality')) {
      const affordAllocs = allocations.filter((a) => a.amiBand > 0 && a.count > 0);
      const marketAllocs = allocations.filter((a) => a.amiBand === 0 && a.count > 0);
      const marketTotal = marketAllocs.reduce((s, a) => s + a.count, 0);
      const affordTotal = affordAllocs.reduce((s, a) => s + a.count, 0);
      if (marketTotal === 0 || affordTotal === 0) break;

      const marketDist: Record<string, number> = {};
      for (const a of marketAllocs) {
        marketDist[a.unitType] = (marketDist[a.unitType] ?? 0) + a.count;
      }
      const affordDist: Record<string, number> = {};
      for (const a of affordAllocs) {
        affordDist[a.unitType] = (affordDist[a.unitType] ?? 0) + a.count;
      }

      let overType = '';
      let underType = '';
      let maxOver = -1;
      let maxUnder = -1;
      for (const t of Object.keys({ ...marketDist, ...affordDist })) {
        const mPct = (marketDist[t] ?? 0) / marketTotal;
        const aPct = (affordDist[t] ?? 0) / affordTotal;
        if (aPct - mPct > maxOver) { maxOver = aPct - mPct; overType = t; }
        if (mPct - aPct > maxUnder) { maxUnder = mPct - aPct; underType = t; }
      }

      if (overType && underType && overType !== underType) {
        const src = affordAllocs.find((a) => a.unitType === overType && a.count > 0);
        if (src) {
          const tgtCfg = effectiveUnitTypes.find((ut) => ut.type === underType);
          if (tgtCfg) {
            const avgSF = Math.round((tgtCfg.minSF + tgtCfg.maxSF) / 2);
            src.count -= 1;
            src.totalSF -= src.avgSF;
            pushAllocation(allocations, underType, src.amiBand, 1, avgSF,
              getRent(rentAssumptions, underType, src.amiBand), programNames);
          }
        }
      } else {
        break;
      }
    } else if (violated.constraint.includes('Weighted avg AMI')) {
      const affordAllocs = allocations.filter((a) => a.amiBand > 0 && a.count > 0);
      const highBandAlloc = [...affordAllocs].sort((a, b) => b.amiBand - a.amiBand).find((a) => a.count > 0);
      const lowBand = programConstraints.find((c) => c.weightedAvgAmiMax)?.amiBands[0] ?? 40;
      if (highBandAlloc && highBandAlloc.amiBand > lowBand) {
        highBandAlloc.count -= 1;
        highBandAlloc.totalSF -= highBandAlloc.avgSF;
        pushAllocation(allocations, highBandAlloc.unitType, lowBand, 1, highBandAlloc.avgSF,
          getRent(rentAssumptions, highBandAlloc.unitType, lowBand), programNames);
      } else {
        break;
      }
    } else if (!isFixed) {
      if (!marketAlloc) break;
      if (bandMatch) {
        const band = parseInt(bandMatch[1]);
        const repairType = effectiveUnitTypes[Math.floor(effectiveUnitTypes.length / 2)];
        const avgSF = Math.round((repairType.minSF + repairType.maxSF) / 2);
        marketAlloc.count -= 1;
        marketAlloc.totalSF -= marketAlloc.avgSF;
        pushAllocation(allocations, repairType.type, band, 1, avgSF,
          getRent(rentAssumptions, repairType.type, band), programNames);
      } else {
        const defaultBand = programConstraints[0]?.amiBands[0] ?? 60;
        const repairType = effectiveUnitTypes[Math.floor(effectiveUnitTypes.length / 2)];
        const avgSF = Math.round((repairType.minSF + repairType.maxSF) / 2);
        marketAlloc.count -= 1;
        marketAlloc.totalSF -= marketAlloc.avgSF;
        pushAllocation(allocations, repairType.type, defaultBand, 1, avgSF,
          getRent(rentAssumptions, repairType.type, defaultBand), programNames);
      }
    } else {
      break;
    }
  }

  const maxIter = 200;
  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;
    for (let i = 0; i < allocations.length; i++) {
      for (let j = i + 1; j < allocations.length; j++) {
        if (allocations[i].amiBand > 0 || allocations[j].amiBand > 0) continue;
        if (allocations[i].count < 2) continue;

        const trial = structuredClone(allocations);
        trial[i].count -= 1;
        trial[i].totalSF -= trial[i].avgSF;
        trial[j].count += 1;
        trial[j].totalSF += trial[j].avgSF;

        const usedSF = trial.reduce((s, a) => s + a.totalSF, 0);
        if (usedSF > netResidentialSF) continue;

        if (requiresProportional && programConstraints.length > 0) {
          const trialClean = trial.filter((a) => a.count > 0);
          const trialSlacks = evaluateConstraints(trialClean, netResidentialSF, programConstraints);
          if (!isFeasible(trialSlacks)) continue;
        }

        const oldRev = computeRevenue(allocations);
        const newRev = computeRevenue(trial);
        if (newRev > oldRev) {
          allocations[i].count = trial[i].count;
          allocations[i].totalSF = trial[i].totalSF;
          allocations[j].count = trial[j].count;
          allocations[j].totalSF = trial[j].totalSF;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const cleaned = allocations.filter((a) => a.count > 0);
  const totalSFUsed = cleaned.reduce((s, a) => s + a.totalSF, 0);
  const totalUnits = cleaned.reduce((s, a) => s + a.count, 0);
  const annualRevenue = computeRevenue(cleaned);
  const totalDevelopmentCost = computeCost(
    totalSFUsed,
    costAssumptions.hardCostPerSF,
    costAssumptions.softCostPct,
    costAssumptions.landCostPerSF
  );
  const roiProxy = totalDevelopmentCost > 0 ? annualRevenue / totalDevelopmentCost : 0;
  const slacks = evaluateConstraints(cleaned, netResidentialSF, programConstraints);
  const summary = computeSummary(cleaned);

  return {
    allocations: cleaned,
    constraintSlack: slacks,
    sensitivity: [],
    totalUnits,
    affordableUnitCount: summary.affordableUnitCount,
    marketUnitCount: summary.marketUnitCount,
    totalSF: totalSFUsed,
    totalMonthlyRent: summary.totalMonthlyRent,
    blendedAmi: summary.blendedAmi,
    annualRevenue,
    totalDevelopmentCost,
    roiProxy,
    feasible: isFeasible(slacks),
    solverMethod: 'heuristic',
  };
}

function pushAllocation(
  allocs: UnitAllocation[],
  unitType: string,
  amiBand: number,
  count: number,
  avgSF: number,
  monthlyRent: number,
  programTags?: string[]
) {
  const existing = allocs.find((a) => a.unitType === unitType && a.amiBand === amiBand);
  if (existing) {
    existing.count += count;
    existing.totalSF += count * avgSF;
    if (programTags && existing.programTags) {
      for (const tag of programTags) {
        if (!existing.programTags.includes(tag)) existing.programTags.push(tag);
      }
    }
  } else {
    allocs.push({
      unitType,
      amiBand,
      count,
      avgSF,
      totalSF: count * avgSF,
      monthlyRent,
      programTags: programTags ? [...programTags] : undefined,
    });
  }
}

function emptyResult(): OptimizerResult {
  return {
    allocations: [],
    constraintSlack: [],
    sensitivity: [],
    totalUnits: 0,
    affordableUnitCount: 0,
    marketUnitCount: 0,
    totalSF: 0,
    totalMonthlyRent: 0,
    blendedAmi: 0,
    annualRevenue: 0,
    totalDevelopmentCost: 0,
    roiProxy: 0,
    feasible: false,
    solverMethod: 'heuristic',
  };
}
