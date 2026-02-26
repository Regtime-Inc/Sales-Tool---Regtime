import type { ProgramConstraint } from '../../types/optimizer';

export interface MergedBandRequirement {
  amiBand: number;
  pct: number;
  minUnits: number;
  programs: string[];
}

export interface MergedConstraintSet {
  maxAffordablePct: number;
  mergedAffordableTarget: number;
  bandRequirements: MergedBandRequirement[];
  programNames: string[];
}

export function mergeProgramConstraints(
  constraints: ProgramConstraint[],
  estTotalUnits: number
): MergedConstraintSet {
  if (constraints.length === 0) {
    return { maxAffordablePct: 0, mergedAffordableTarget: 0, bandRequirements: [], programNames: [] };
  }

  const maxAffordablePct = Math.max(...constraints.map((c) => c.minAffordablePct));
  const mergedAffordableTarget = Math.ceil(maxAffordablePct * estTotalUnits);

  const bandMap = new Map<number, { pct: number; programs: string[] }>();

  for (const pc of constraints) {
    for (const band of pc.amiBands) {
      const bandPct = pc.minPctByBand[band] ?? 0;
      const existing = bandMap.get(band);
      if (existing) {
        existing.pct = Math.max(existing.pct, bandPct);
        if (!existing.programs.includes(pc.program)) {
          existing.programs.push(pc.program);
        }
      } else {
        bandMap.set(band, { pct: bandPct, programs: [pc.program] });
      }
    }
  }

  const bandEntries = Array.from(bandMap.entries());
  const totalPct = bandEntries.reduce((s, [, req]) => s + req.pct, 0);
  if (totalPct > 1.0) {
    for (const [, req] of bandEntries) {
      req.pct = req.pct / totalPct;
    }
  }

  const rawAllocs = bandEntries.map(([, req]) => req.pct * mergedAffordableTarget);
  const floored = rawAllocs.map((v) => Math.max(1, Math.floor(v)));
  let deficit = mergedAffordableTarget - floored.reduce((s, v) => s + v, 0);

  const remainders = rawAllocs.map((v, i) => ({ i, r: v - floored[i] }));
  remainders.sort((a, b) => b.r - a.r);
  for (const { i } of remainders) {
    if (deficit <= 0) break;
    floored[i] += 1;
    deficit -= 1;
  }

  const bandRequirements: MergedBandRequirement[] = bandEntries.map(([amiBand, req], i) => ({
    amiBand,
    pct: req.pct,
    minUnits: floored[i],
    programs: req.programs,
  }));

  return {
    maxAffordablePct,
    mergedAffordableTarget,
    bandRequirements,
    programNames: constraints.map((c) => c.program),
  };
}
