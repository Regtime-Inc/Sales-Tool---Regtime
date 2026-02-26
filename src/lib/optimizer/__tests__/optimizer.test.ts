import { describe, it, expect } from 'vitest';
import { solve } from '../solver';
import { evaluateConstraints, isFeasible } from '../constraints';
import { runSensitivity } from '../sensitivity';
import { mergeProgramConstraints } from '../mergeConstraints';
import type { OptimizerInputs, UnitAllocation, ProgramConstraint } from '../../../types/optimizer';
import {
  DEFAULT_UNIT_TYPES,
  DEFAULT_RENTS,
  DEFAULT_COSTS,
} from '../../../types/optimizer';

function makeInputs(overrides: Partial<OptimizerInputs> = {}): OptimizerInputs {
  return {
    netResidentialSF: 50000,
    allowedUnitTypes: DEFAULT_UNIT_TYPES,
    rentAssumptions: DEFAULT_RENTS,
    costAssumptions: DEFAULT_COSTS,
    programConstraints: [],
    ...overrides,
  };
}

const MIH_CONSTRAINT: ProgramConstraint = {
  program: 'MIH Option 1',
  minAffordablePct: 0.25,
  amiBands: [40, 60, 80],
  minPctByBand: { 40: 0.10, 60: 0.50, 80: 0.40 },
};

const CONSTRAINT_485X_A: ProgramConstraint = {
  program: '485-x Option A',
  minAffordablePct: 0.25,
  amiBands: [60, 80, 100],
  minPctByBand: { 60: 0.30, 80: 0.40, 100: 0.30 },
};

const CONSTRAINT_485X_B: ProgramConstraint = {
  program: '485-x Option B',
  minAffordablePct: 0.20,
  amiBands: [60, 80, 100],
  minPctByBand: { 60: 0.30, 80: 0.40, 100: 0.30 },
};

const CONSTRAINT_UAP_ANDREWS: ProgramConstraint = {
  program: 'UAP',
  minAffordablePct: 0.3243,
  amiBands: [50, 70],
  minPctByBand: { 50: 0.50, 70: 0.50 },
};

const CONSTRAINT_UAP: ProgramConstraint = {
  program: 'UAP',
  minAffordablePct: 0.20,
  amiBands: [50, 70],
  minPctByBand: { 50: 0.50, 70: 0.50 },
};

const CONSTRAINT_467M: ProgramConstraint = {
  program: '467-m',
  minAffordablePct: 0.25,
  amiBands: [40, 80, 100],
  minPctByBand: { 40: 0.20, 80: 0.40, 100: 0.40 },
};

describe('solve', () => {
  it('returns feasible solution for unconstrained scenario', () => {
    const result = solve(makeInputs());
    expect(result.feasible).toBe(true);
    expect(result.totalUnits).toBeGreaterThan(0);
    expect(result.totalSF).toBeGreaterThan(0);
    expect(result.totalSF).toBeLessThanOrEqual(50000);
    expect(result.annualRevenue).toBeGreaterThan(0);
    expect(result.roiProxy).toBeGreaterThan(0);
  });

  it('allocates all available SF (within rounding)', () => {
    const result = solve(makeInputs());
    expect(result.totalSF).toBeGreaterThan(45000);
  });

  it('returns empty result for zero SF', () => {
    const result = solve(makeInputs({ netResidentialSF: 0 }));
    expect(result.feasible).toBe(false);
    expect(result.totalUnits).toBe(0);
  });

  it('respects MIH affordable constraint', () => {
    const result = solve(makeInputs({ programConstraints: [MIH_CONSTRAINT] }));
    expect(result.feasible).toBe(true);

    const affordableUnits = result.allocations.filter((a) => a.amiBand > 0);
    const totalUnits = result.allocations.reduce((s, a) => s + a.count, 0);
    const affordableCount = affordableUnits.reduce((s, a) => s + a.count, 0);
    const affordablePct = affordableCount / totalUnits;

    expect(affordablePct).toBeGreaterThanOrEqual(0.24);
  });

  it('produces market-rate and affordable allocations with MIH', () => {
    const result = solve(makeInputs({ programConstraints: [MIH_CONSTRAINT] }));
    const marketUnits = result.allocations.filter((a) => a.amiBand === 0);
    const affordUnits = result.allocations.filter((a) => a.amiBand > 0);
    expect(marketUnits.length).toBeGreaterThan(0);
    expect(affordUnits.length).toBeGreaterThan(0);
  });

  it('unit counts are positive integers', () => {
    const result = solve(makeInputs());
    for (const a of result.allocations) {
      expect(Number.isInteger(a.count)).toBe(true);
      expect(a.count).toBeGreaterThan(0);
    }
  });

  it('total SF per allocation matches count * avgSF', () => {
    const result = solve(makeInputs());
    for (const a of result.allocations) {
      expect(a.totalSF).toBe(a.count * a.avgSF);
    }
  });

  it('uses heuristic solver method', () => {
    const result = solve(makeInputs());
    expect(result.solverMethod).toBe('heuristic');
  });

  it('handles small SF (only fits a few units)', () => {
    const result = solve(makeInputs({ netResidentialSF: 1200 }));
    expect(result.feasible).toBe(true);
    expect(result.totalUnits).toBeGreaterThan(0);
    expect(result.totalUnits).toBeLessThanOrEqual(3);
  });

  it('handles large SF efficiently', () => {
    const result = solve(makeInputs({ netResidentialSF: 500000 }));
    expect(result.feasible).toBe(true);
    expect(result.totalUnits).toBeGreaterThan(100);
  });
});

describe('solve with totalUnits', () => {
  it('respects fixed total of 14 units with 485-x at 25%', () => {
    const result = solve(makeInputs({
      netResidentialSF: 10000,
      totalUnits: 14,
      programConstraints: [CONSTRAINT_485X_A],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(14);
    expect(result.affordableUnitCount).toBeGreaterThanOrEqual(3);
    expect(result.marketUnitCount).toBeGreaterThan(0);
  });

  it('respects fixed total of 14 units with UAP at 20%', () => {
    const result = solve(makeInputs({
      netResidentialSF: 10000,
      totalUnits: 14,
      programConstraints: [CONSTRAINT_UAP],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(14);
    expect(result.affordableUnitCount).toBeGreaterThanOrEqual(2);
    expect(result.marketUnitCount).toBeGreaterThan(0);
  });

  it('falls back to SF-based estimate when totalUnits not provided', () => {
    const result = solve(makeInputs({ netResidentialSF: 50000 }));
    expect(result.totalUnits).toBeGreaterThan(10);
  });

  it('caps unit allocation to totalUnits even with excess SF', () => {
    const result = solve(makeInputs({
      netResidentialSF: 100000,
      totalUnits: 10,
    }));
    expect(result.totalUnits).toBeLessThanOrEqual(10);
  });
});

describe('proportional bedroom mix', () => {
  it('distributes affordable units across multiple bedroom types', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_CONSTRAINT],
    }));

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const unitTypes = new Set(affordAllocs.map((a) => a.unitType));
    expect(unitTypes.size).toBeGreaterThan(1);
  });

  it('does not allocate all affordable units as Studios', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [MIH_CONSTRAINT],
    }));

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const studioCount = affordAllocs
      .filter((a) => a.unitType === 'Studio')
      .reduce((s, a) => s + a.count, 0);
    const totalAfford = affordAllocs.reduce((s, a) => s + a.count, 0);

    expect(studioCount).toBeLessThan(totalAfford);
  });

  it('UAP bedroom mix has >= 50% units with 2+ bedrooms', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP],
    }));

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const totalAfford = affordAllocs.reduce((s, a) => s + a.count, 0);
    const twoPlusBR = affordAllocs
      .filter((a) => a.unitType === '2BR' || a.unitType === '3BR')
      .reduce((s, a) => s + a.count, 0);

    if (totalAfford > 2) {
      expect(twoPlusBR / totalAfford).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('affordable avgSF varies by unit type', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_CONSTRAINT],
    }));

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const uniqueSFs = new Set(affordAllocs.map((a) => a.avgSF));
    expect(uniqueSFs.size).toBeGreaterThan(1);
  });
});

describe('market-rate bedroom distribution', () => {
  it('distributes market-rate units across multiple bedroom types', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [],
    }));

    const marketAllocs = result.allocations.filter((a) => a.amiBand === 0);
    const unitTypes = new Set(marketAllocs.map((a) => a.unitType));
    expect(unitTypes.size).toBeGreaterThan(1);
  });

  it('does not allocate all market-rate units as a single type', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [],
    }));

    const marketAllocs = result.allocations.filter((a) => a.amiBand === 0);
    const maxCount = Math.max(...marketAllocs.map((a) => a.count));
    expect(maxCount).toBeLessThan(result.totalUnits);
  });

  it('market-rate units include multiple sizes with MIH constraint', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_CONSTRAINT],
    }));

    const marketAllocs = result.allocations.filter((a) => a.amiBand === 0);
    const unitTypes = new Set(marketAllocs.map((a) => a.unitType));
    expect(unitTypes.size).toBeGreaterThan(1);
  });
});

describe('multi-program overlap', () => {
  it('merged affordable % uses max, not sum of programs', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [MIH_CONSTRAINT, CONSTRAINT_UAP],
    }));

    const affordPct = result.affordableUnitCount / result.totalUnits;
    expect(affordPct).toBeGreaterThanOrEqual(0.24);
    expect(affordPct).toBeLessThan(0.50);
  });

  it('market units exist when two programs overlap', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [MIH_CONSTRAINT, CONSTRAINT_UAP],
    }));

    expect(result.marketUnitCount).toBeGreaterThan(0);
    expect(result.affordableUnitCount).toBeGreaterThan(0);
  });

  it('program tags are assigned to affordable allocations', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_CONSTRAINT, CONSTRAINT_UAP],
    }));

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const withTags = affordAllocs.filter((a) => a.programTags && a.programTags.length > 0);
    expect(withTags.length).toBeGreaterThan(0);
  });

  it('single program constraint produces correct affordable count', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [MIH_CONSTRAINT],
    }));

    expect(result.affordableUnitCount).toBeGreaterThanOrEqual(Math.ceil(79 * 0.25) - 1);
    expect(result.marketUnitCount).toBeGreaterThan(0);
  });

  it('no programs means no affordable units', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 79,
      programConstraints: [],
    }));

    expect(result.affordableUnitCount).toBe(0);
    expect(result.marketUnitCount).toBe(result.totalUnits);
  });

  it('totalUnits 75 with MIH 25% produces ~19 affordable and ~56 market', () => {
    const result = solve(makeInputs({
      netResidentialSF: 52500,
      totalUnits: 75,
      programConstraints: [MIH_CONSTRAINT],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(75);
    expect(result.affordableUnitCount).toBeGreaterThanOrEqual(18);
    expect(result.affordableUnitCount).toBeLessThanOrEqual(20);
    expect(result.marketUnitCount).toBeGreaterThan(0);
    expect(result.affordableUnitCount + result.marketUnitCount).toBe(result.totalUnits);
  });

  it('different totalUnits produces different allocation', () => {
    const small = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 12,
      programConstraints: [MIH_CONSTRAINT],
    }));
    const large = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 75,
      programConstraints: [MIH_CONSTRAINT],
    }));

    expect(large.totalUnits).toBeGreaterThan(small.totalUnits);
    expect(large.affordableUnitCount).toBeGreaterThan(small.affordableUnitCount);
  });
});

describe('summary statistics', () => {
  it('computes blended AMI as weighted average of affordable units', () => {
    const result = solve(makeInputs({
      totalUnits: 14,
      netResidentialSF: 10000,
      programConstraints: [CONSTRAINT_485X_A],
    }));

    expect(result.blendedAmi).toBeGreaterThan(0);
    expect(result.blendedAmi).toBeLessThanOrEqual(100);

    const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);
    const affordCount = affordAllocs.reduce((s, a) => s + a.count, 0);
    const weightedAmi = affordAllocs.reduce((s, a) => s + a.amiBand * a.count, 0);
    const expectedBlended = Math.round(weightedAmi / affordCount);
    expect(result.blendedAmi).toBe(expectedBlended);
  });

  it('blended AMI is 0 when no affordable units', () => {
    const result = solve(makeInputs({ totalUnits: 10, netResidentialSF: 10000 }));
    expect(result.blendedAmi).toBe(0);
  });

  it('totalMonthlyRent equals sum of all unit rents', () => {
    const result = solve(makeInputs({ totalUnits: 14, netResidentialSF: 10000 }));
    const expected = result.allocations.reduce((s, a) => s + a.count * a.monthlyRent, 0);
    expect(result.totalMonthlyRent).toBe(expected);
  });

  it('affordableUnitCount + marketUnitCount = totalUnits', () => {
    const result = solve(makeInputs({
      totalUnits: 14,
      netResidentialSF: 10000,
      programConstraints: [CONSTRAINT_485X_A],
    }));
    expect(result.affordableUnitCount + result.marketUnitCount).toBe(result.totalUnits);
  });
});

describe('evaluateConstraints', () => {
  it('identifies SF constraint as satisfied', () => {
    const allocs: UnitAllocation[] = [
      { unitType: 'Studio', amiBand: 0, count: 10, avgSF: 475, totalSF: 4750, monthlyRent: 3200 },
    ];
    const slacks = evaluateConstraints(allocs, 5000, []);
    const sfSlack = slacks.find((s) => s.constraint.includes('Total SF'));
    expect(sfSlack).toBeDefined();
    expect(sfSlack!.slack).toBeGreaterThanOrEqual(0);
  });

  it('identifies SF constraint as violated', () => {
    const allocs: UnitAllocation[] = [
      { unitType: 'Studio', amiBand: 0, count: 20, avgSF: 475, totalSF: 9500, monthlyRent: 3200 },
    ];
    const slacks = evaluateConstraints(allocs, 5000, []);
    const sfSlack = slacks.find((s) => s.constraint.includes('Total SF'));
    expect(sfSlack!.slack).toBeLessThan(0);
    expect(isFeasible(slacks)).toBe(false);
  });

  it('checks affordable percentage constraint', () => {
    const allocs: UnitAllocation[] = [
      { unitType: 'Studio', amiBand: 0, count: 7, avgSF: 400, totalSF: 2800, monthlyRent: 3200 },
      { unitType: 'Studio', amiBand: 60, count: 3, avgSF: 400, totalSF: 1200, monthlyRent: 1200 },
    ];
    const slacks = evaluateConstraints(allocs, 5000, [MIH_CONSTRAINT]);
    const affSlack = slacks.find((s) => s.constraint.includes('affordable'));
    expect(affSlack).toBeDefined();
    expect(affSlack!.actual).toBeCloseTo(0.3, 1);
  });
});

describe('runSensitivity', () => {
  it('produces sensitivity rows for rent and cost shocks', () => {
    const inputs = makeInputs();
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.some((r) => r.change.includes('+10% Market'))).toBe(true);
    expect(rows.some((r) => r.change.includes('-10% Market'))).toBe(true);
  });

  it('higher rents improve ROI', () => {
    const inputs = makeInputs();
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    const up = rows.find((r) => r.change === '+10% Market Rents');
    expect(up).toBeDefined();
    expect(up!.roiDelta).toBeGreaterThan(0);
  });

  it('higher costs reduce ROI', () => {
    const inputs = makeInputs();
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    const up = rows.find((r) => r.change === '+10% Hard Costs');
    expect(up).toBeDefined();
    expect(up!.roiDelta).toBeLessThan(0);
  });

  it('all sensitivity scenarios remain feasible for unconstrained inputs', () => {
    const inputs = makeInputs();
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });

  it('preserves totalUnits in sensitivity re-solves', () => {
    const inputs = makeInputs({ totalUnits: 14, netResidentialSF: 10000 });
    const base = solve(inputs);
    expect(base.totalUnits).toBeLessThanOrEqual(14);
    const rows = runSensitivity(inputs, base);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('2256 Andrews Ave scenarios', () => {
  it('485-x only: 25 total, 5 affordable (20% of 25), 20 market', () => {
    const result = solve(makeInputs({
      netResidentialSF: 17430,
      totalUnits: 25,
      programConstraints: [CONSTRAINT_485X_B],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(25);
    expect(result.affordableUnitCount).toBe(5);
    expect(result.marketUnitCount).toBe(result.totalUnits - 5);
  });

  it('UAP + 485-x: 37 total, 12 affordable, 25 market', () => {
    const result = solve(makeInputs({
      netResidentialSF: 25386,
      totalUnits: 37,
      programConstraints: [CONSTRAINT_UAP_ANDREWS, CONSTRAINT_485X_B],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(37);
    expect(result.affordableUnitCount).toBe(12);
    expect(result.marketUnitCount).toBe(result.totalUnits - 12);
  });

  it('no programs: 25 total, 0 affordable', () => {
    const result = solve(makeInputs({
      netResidentialSF: 17430,
      totalUnits: 25,
      programConstraints: [],
    }));

    expect(result.totalUnits).toBeLessThanOrEqual(25);
    expect(result.affordableUnitCount).toBe(0);
    expect(result.marketUnitCount).toBe(result.totalUnits);
  });

  it('mergeConstraints does not inflate affordable target beyond ceil(maxPct * total)', () => {
    const result = solve(makeInputs({
      netResidentialSF: 25386,
      totalUnits: 37,
      programConstraints: [CONSTRAINT_UAP_ANDREWS, CONSTRAINT_485X_B],
    }));

    const maxPct = Math.max(CONSTRAINT_UAP_ANDREWS.minAffordablePct, CONSTRAINT_485X_B.minAffordablePct);
    const expectedMax = Math.ceil(maxPct * 37);
    expect(result.affordableUnitCount).toBeLessThanOrEqual(expectedMax);
  });
});

describe('mergeProgramConstraints', () => {
  it('merges overlapping bands from 485-x and 467-m using MAX', () => {
    const merged = mergeProgramConstraints([CONSTRAINT_485X_A, CONSTRAINT_467M], 100);

    expect(merged.maxAffordablePct).toBe(0.25);
    expect(merged.mergedAffordableTarget).toBe(25);

    const bands = merged.bandRequirements.map((b) => b.amiBand).sort((a, b) => a - b);
    expect(bands).toEqual([40, 60, 80, 100]);

    const band80 = merged.bandRequirements.find((b) => b.amiBand === 80)!;
    expect(band80.pct).toBeGreaterThanOrEqual(0.3);
    expect(band80.programs).toContain('485-x Option A');
    expect(band80.programs).toContain('467-m');
  });

  it('normalizes band pcts when total exceeds 100%', () => {
    const merged = mergeProgramConstraints([CONSTRAINT_485X_A, CONSTRAINT_467M], 100);
    const totalPct = merged.bandRequirements.reduce((s, b) => s + b.pct, 0);
    expect(totalPct).toBeLessThanOrEqual(1.001);
  });

  it('single program passes through unchanged', () => {
    const merged = mergeProgramConstraints([CONSTRAINT_485X_A], 100);
    expect(merged.maxAffordablePct).toBe(0.25);
    expect(merged.bandRequirements).toHaveLength(3);
    expect(merged.programNames).toEqual(['485-x Option A']);
  });

  it('empty constraints produces empty result', () => {
    const merged = mergeProgramConstraints([], 100);
    expect(merged.maxAffordablePct).toBe(0);
    expect(merged.bandRequirements).toHaveLength(0);
  });
});

describe('merged constraint evaluation (485-x + 467-m)', () => {
  it('485-x only is feasible', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_A],
    }));
    expect(result.feasible).toBe(true);
  });

  it('467-m only is feasible', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_467M],
    }));
    expect(result.feasible).toBe(true);
  });

  it('485-x + 467-m combined is feasible', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_A, CONSTRAINT_467M],
    }));
    expect(result.feasible).toBe(true);
    expect(result.affordableUnitCount).toBeGreaterThan(0);
    expect(result.marketUnitCount).toBeGreaterThan(0);
  });

  it('485-x + 467-m with fixed total units is feasible', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 75,
      programConstraints: [CONSTRAINT_485X_A, CONSTRAINT_467M],
    }));
    expect(result.feasible).toBe(true);
    expect(result.totalUnits).toBeLessThanOrEqual(75);
  });
});

describe('sensitivity with 485-x and 467-m', () => {
  it('485-x only: all sensitivity scenarios remain feasible', () => {
    const inputs = makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_A],
    });
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });

  it('467-m only: all sensitivity scenarios remain feasible', () => {
    const inputs = makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_467M],
    });
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });

  it('485-x + 467-m combined: sensitivity scenarios remain feasible', () => {
    const inputs = makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_A, CONSTRAINT_467M],
    });
    const base = solve(inputs);
    expect(base.feasible).toBe(true);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });

  it('UAP only: sensitivity scenarios remain feasible (regression)', () => {
    const inputs = makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP],
    });
    const base = solve(inputs);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });

  it('sensitivity with fixed totalUnits and 485-x + 467-m is feasible', () => {
    const inputs = makeInputs({
      netResidentialSF: 50000,
      totalUnits: 75,
      programConstraints: [CONSTRAINT_485X_A, CONSTRAINT_467M],
    });
    const base = solve(inputs);
    expect(base.feasible).toBe(true);
    const rows = runSensitivity(inputs, base);
    for (const row of rows) {
      expect(row.stillFeasible).toBe(true);
    }
  });
});

const MIH_PROPORTIONAL: ProgramConstraint = {
  program: 'MIH',
  minAffordablePct: 0.25,
  amiBands: [40, 60, 80],
  minPctByBand: { 40: 0.10, 60: 0.50, 80: 0.40 },
  requiresProportionalBedrooms: true,
};

const CONSTRAINT_485X_PROPORTIONAL: ProgramConstraint = {
  program: '485-x',
  minAffordablePct: 0.25,
  amiBands: [60, 80, 100],
  minPctByBand: { 60: 0.30, 80: 0.40, 100: 0.30 },
  requiresProportionalBedrooms: true,
};

const CONSTRAINT_UAP_FULL: ProgramConstraint = {
  program: 'UAP',
  minAffordablePct: 0.20,
  amiBands: [50, 70],
  minPctByBand: { 50: 0.50, 70: 0.50 },
  bedroomMix: {
    min2BRPlusPct: 0.50,
    distribution: { Studio: 0.10, '1BR': 0.25, '2BR': 0.40, '3BR': 0.25 },
  },
  unitMinSizes: { Studio: 400, '1BR': 575, '2BR': 750, '3BR': 1000 },
};

const CONSTRAINT_467M_WEIGHTED: ProgramConstraint = {
  program: '467-m',
  minAffordablePct: 0.25,
  amiBands: [40, 80, 100],
  minPctByBand: { 40: 0.20, 80: 0.40, 100: 0.40 },
  weightedAvgAmiMax: 80,
};

describe('bedroom proportionality (MIH / 485-x)', () => {
  it('MIH affordable bedroom mix mirrors market-rate within 10% tolerance', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_PROPORTIONAL],
    }));
    expect(result.feasible).toBe(true);

    const propSlack = result.constraintSlack.find((s) => s.constraint.includes('proportionality'));
    expect(propSlack).toBeDefined();
    expect(propSlack!.slack).toBeGreaterThanOrEqual(-0.001);
  });

  it('485-x proportional bedroom constraint is satisfied', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_PROPORTIONAL],
    }));
    expect(result.feasible).toBe(true);

    const propSlack = result.constraintSlack.find((s) => s.constraint.includes('proportionality'));
    expect(propSlack).toBeDefined();
    expect(propSlack!.slack).toBeGreaterThanOrEqual(-0.001);
  });

  it('proportionality slack measures max per-type deviation', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_PROPORTIONAL],
    }));

    const propSlack = result.constraintSlack.find((s) => s.constraint.includes('proportionality'));
    expect(propSlack).toBeDefined();
    expect(propSlack!.actual).toBeGreaterThanOrEqual(0);
    expect(propSlack!.actual).toBeLessThanOrEqual(1);
  });

  it('proportionality with fixed total units is feasible', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      totalUnits: 75,
      programConstraints: [MIH_PROPORTIONAL],
    }));
    expect(result.feasible).toBe(true);
    expect(result.affordableUnitCount).toBeGreaterThanOrEqual(18);
  });
});

describe('UAP 2BR+ hard constraint and unit min sizes', () => {
  it('UAP affordable units have >= 50% 2BR+', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP_FULL],
    }));
    expect(result.feasible).toBe(true);

    const brSlack = result.constraintSlack.find((s) => s.constraint.includes('2BR+'));
    expect(brSlack).toBeDefined();
    expect(brSlack!.slack).toBeGreaterThanOrEqual(-0.001);
  });

  it('UAP 2BR+ constraint shows in slack report', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP_FULL],
    }));

    const brSlack = result.constraintSlack.find((s) => s.constraint.includes('2BR+'));
    expect(brSlack).toBeDefined();
    expect(brSlack!.required).toBe(0.50);
    expect(brSlack!.actual).toBeGreaterThanOrEqual(0.50);
  });

  it('UAP unit min sizes raise 1BR from 550 to 575 SF', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP_FULL],
    }));

    const afford1BR = result.allocations.find(
      (a) => a.amiBand > 0 && a.unitType === '1BR'
    );
    if (afford1BR) {
      expect(afford1BR.avgSF).toBeGreaterThanOrEqual(575);
    }
  });

  it('no unit min size violations in slack for UAP', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_UAP_FULL],
    }));

    const sizeViolations = result.constraintSlack.filter(
      (s) => s.constraint.includes('min') && s.constraint.includes('SF') && s.slack < 0
    );
    expect(sizeViolations).toHaveLength(0);
  });
});

describe('467-m weighted avg AMI constraint', () => {
  it('467-m weighted avg AMI <= 80% is checked', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_467M_WEIGHTED],
    }));
    expect(result.feasible).toBe(true);

    const amiSlack = result.constraintSlack.find((s) => s.constraint.includes('Weighted avg AMI'));
    expect(amiSlack).toBeDefined();
    expect(amiSlack!.slack).toBeGreaterThanOrEqual(-0.001);
  });

  it('467-m weighted avg AMI is at or below 80', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_467M_WEIGHTED],
    }));

    const amiSlack = result.constraintSlack.find((s) => s.constraint.includes('Weighted avg AMI'));
    expect(amiSlack).toBeDefined();
    expect(amiSlack!.actual).toBeLessThanOrEqual(80 + 0.5);
  });
});

describe('stacking conflict enforcement', () => {
  it('evaluateConstraints does not crash with stacking fields', () => {
    const constraint467m: ProgramConstraint = {
      ...CONSTRAINT_467M_WEIGHTED,
      stackingConflicts: ['421-a', '485-x'],
    };
    const allocs: UnitAllocation[] = [
      { unitType: 'Studio', amiBand: 0, count: 7, avgSF: 475, totalSF: 3325, monthlyRent: 3200 },
      { unitType: '2BR', amiBand: 40, count: 3, avgSF: 900, totalSF: 2700, monthlyRent: 1458 },
    ];
    const slacks = evaluateConstraints(allocs, 10000, [constraint467m]);
    expect(slacks.length).toBeGreaterThan(0);
  });
});

describe('combined new constraints', () => {
  it('UAP + MIH proportional is feasible with both constraints', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_PROPORTIONAL, CONSTRAINT_UAP_FULL],
    }));
    expect(result.feasible).toBe(true);
    expect(result.affordableUnitCount).toBeGreaterThan(0);
  });

  it('all new constraint types appear in slack report', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [MIH_PROPORTIONAL, CONSTRAINT_UAP_FULL],
    }));

    const slackNames = result.constraintSlack.map((s) => s.constraint);
    expect(slackNames.some((n) => n.includes('proportionality'))).toBe(true);
    expect(slackNames.some((n) => n.includes('2BR+'))).toBe(true);
  });

  it('467-m weighted AMI constraint with 485-x proportional', () => {
    const result = solve(makeInputs({
      netResidentialSF: 50000,
      programConstraints: [CONSTRAINT_485X_PROPORTIONAL, CONSTRAINT_467M_WEIGHTED],
    }));
    expect(result.feasible).toBe(true);

    const amiSlack = result.constraintSlack.find((s) => s.constraint.includes('Weighted avg AMI'));
    expect(amiSlack).toBeDefined();
    expect(amiSlack!.slack).toBeGreaterThanOrEqual(-0.001);
  });
});
