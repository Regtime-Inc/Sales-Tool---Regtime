import type { UnitAllocation, ProgramConstraint, ConstraintSlack } from '../../types/optimizer';
import { mergeProgramConstraints } from './mergeConstraints';

const PROPORTIONALITY_TOLERANCE = 0.10;

function computeBedroomDistribution(
  allocs: UnitAllocation[]
): Record<string, number> {
  const total = allocs.reduce((s, a) => s + a.count, 0);
  if (total === 0) return {};
  const dist: Record<string, number> = {};
  for (const a of allocs) {
    dist[a.unitType] = (dist[a.unitType] ?? 0) + a.count;
  }
  for (const key of Object.keys(dist)) {
    dist[key] = dist[key] / total;
  }
  return dist;
}

export function evaluateConstraints(
  allocations: UnitAllocation[],
  totalSF: number,
  programConstraints: ProgramConstraint[]
): ConstraintSlack[] {
  const slacks: ConstraintSlack[] = [];

  const affordableUnits = allocations.filter((a) => a.amiBand > 0);
  const marketUnits = allocations.filter((a) => a.amiBand === 0);
  const totalUnits = allocations.reduce((s, a) => s + a.count, 0);
  const affordableCount = affordableUnits.reduce((s, a) => s + a.count, 0);
  const affordablePct = totalUnits > 0 ? affordableCount / totalUnits : 0;

  if (programConstraints.length > 0) {
    const merged = mergeProgramConstraints(programConstraints, totalUnits);
    const programLabel = merged.programNames.join(' + ');

    slacks.push({
      constraint: `${programLabel}: Min ${Math.round(merged.maxAffordablePct * 100)}% affordable`,
      required: merged.maxAffordablePct,
      actual: affordablePct,
      slack: affordablePct - merged.maxAffordablePct,
      binding: Math.abs(affordablePct - merged.maxAffordablePct) < 0.01,
    });

    for (const br of merged.bandRequirements) {
      if (br.pct <= 0) continue;

      const bandUnits = allocations
        .filter((a) => a.amiBand === br.amiBand)
        .reduce((s, a) => s + a.count, 0);
      const bandPctOfAffordable = affordableCount > 0 ? bandUnits / affordableCount : 0;
      const minUnitsForBand = Math.max(1, Math.floor(br.pct * affordableCount));
      const bandSlack = bandUnits >= minUnitsForBand
        ? Math.max(0, bandPctOfAffordable - br.pct)
        : bandPctOfAffordable - br.pct;

      const bandLabel = br.programs.join(' + ');

      slacks.push({
        constraint: `${bandLabel}: AMI ${br.amiBand}% band min ${Math.round(br.pct * 100)}% of affordable`,
        required: br.pct,
        actual: bandPctOfAffordable,
        slack: bandSlack,
        binding: Math.abs(bandPctOfAffordable - br.pct) < 0.01,
      });
    }

    const requiresProportional = programConstraints.some((c) => c.requiresProportionalBedrooms);
    if (requiresProportional && affordableCount > 2 && marketUnits.length > 0) {
      const marketDist = computeBedroomDistribution(marketUnits);
      const affordDist = computeBedroomDistribution(affordableUnits);
      const allTypes = new Set([...Object.keys(marketDist), ...Object.keys(affordDist)]);
      let worstDeviation = 0;
      for (const t of allTypes) {
        const dev = Math.abs((affordDist[t] ?? 0) - (marketDist[t] ?? 0));
        worstDeviation = Math.max(worstDeviation, dev);
      }
      const propLabel = programConstraints
        .filter((c) => c.requiresProportionalBedrooms)
        .map((c) => c.program)
        .join(' + ');
      slacks.push({
        constraint: `${propLabel}: Bedroom proportionality (max ${Math.round(PROPORTIONALITY_TOLERANCE * 100)}% deviation)`,
        required: PROPORTIONALITY_TOLERANCE,
        actual: worstDeviation,
        slack: PROPORTIONALITY_TOLERANCE - worstDeviation,
        binding: Math.abs(worstDeviation - PROPORTIONALITY_TOLERANCE) < 0.02,
      });
    }

    for (const pc of programConstraints) {
      if (pc.bedroomMix && pc.bedroomMix.min2BRPlusPct > 0 && affordableCount > 2) {
        const twoPlusBR = affordableUnits
          .filter((a) => a.unitType === '2BR' || a.unitType === '3BR')
          .reduce((s, a) => s + a.count, 0);
        const twoPlusPct = twoPlusBR / affordableCount;
        slacks.push({
          constraint: `${pc.program}: Min ${Math.round(pc.bedroomMix.min2BRPlusPct * 100)}% affordable units 2BR+`,
          required: pc.bedroomMix.min2BRPlusPct,
          actual: twoPlusPct,
          slack: twoPlusPct - pc.bedroomMix.min2BRPlusPct,
          binding: Math.abs(twoPlusPct - pc.bedroomMix.min2BRPlusPct) < 0.02,
        });
      }

      if (pc.unitMinSizes) {
        for (const a of affordableUnits) {
          const minSF = pc.unitMinSizes[a.unitType];
          if (minSF && a.avgSF < minSF) {
            slacks.push({
              constraint: `${pc.program}: ${a.unitType} min ${minSF} SF`,
              required: minSF,
              actual: a.avgSF,
              slack: a.avgSF - minSF,
              binding: false,
            });
          }
        }
      }

      if (pc.weightedAvgAmiMax && affordableCount > 0) {
        const weightedAmi = affordableUnits.reduce((s, a) => s + a.amiBand * a.count, 0) / affordableCount;
        slacks.push({
          constraint: `${pc.program}: Weighted avg AMI <= ${pc.weightedAvgAmiMax}%`,
          required: pc.weightedAvgAmiMax,
          actual: weightedAmi,
          slack: pc.weightedAvgAmiMax - weightedAmi,
          binding: Math.abs(weightedAmi - pc.weightedAvgAmiMax) < 1,
        });
      }
    }
  }

  const usedSF = allocations.reduce((s, a) => s + a.totalSF, 0);
  slacks.push({
    constraint: 'Total SF <= Net Residential SF',
    required: totalSF,
    actual: usedSF,
    slack: totalSF - usedSF,
    binding: totalSF - usedSF < 100,
  });

  return slacks;
}

export function isFeasible(slacks: ConstraintSlack[]): boolean {
  return slacks.every((s) => s.slack >= -0.001);
}
