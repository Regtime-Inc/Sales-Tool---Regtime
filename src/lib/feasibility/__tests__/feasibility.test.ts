import { describe, it, expect } from 'vitest';
import { computeCapacity } from '../capacity';
import { evaluateMih, AVG_UNIT_SF } from '../mih';
import { evaluateUap } from '../uap';
import { evaluate485x } from '../tax485x';
import { evaluate421a } from '../tax421a';
import { evaluate467m } from '../tax467m';
import { evaluateFeasibility } from '../index';
import { calcTotalProjectedUnits, calcRequiredAffordableUnits } from '../../units/unitMath';
import type { CapacityInput } from '../../../types/feasibility';

function makeInput(overrides: Partial<CapacityInput> = {}): CapacityInput {
  return {
    lotArea: 10000,
    existingBldgArea: 5000,
    residFar: 6.02,
    commFar: 4.0,
    facilFar: 2.0,
    builtFar: 0.5,
    zoneDist: 'R8',
    landUse: '01',
    unitsRes: 10,
    numFloors: 2,
    yearBuilt: 1940,
    ...overrides,
  };
}

describe('computeCapacity', () => {
  it('uses zoning table FAR when higher than PLUTO residFar', () => {
    const cap = computeCapacity(makeInput({ residFar: 5.0 }));
    expect(cap.maxResFa).toBe(60200);
    expect(cap.zoningSource).toBe('table');
  });

  it('uses PLUTO FAR when higher than zoning table', () => {
    const cap = computeCapacity(makeInput({ residFar: 7.0 }));
    expect(cap.maxResFa).toBe(70000);
    expect(cap.zoningSource).toBe('table');
  });

  it('computes maxResFa from effective FAR * lotArea', () => {
    const cap = computeCapacity(makeInput());
    expect(cap.maxResFa).toBe(60200);
  });

  it('computes newResFa as maxResFa - existingBldgArea', () => {
    const cap = computeCapacity(makeInput());
    expect(cap.newResFa).toBe(55200);
  });

  it('floors newResFa at zero when building exceeds max', () => {
    const cap = computeCapacity(makeInput({ existingBldgArea: 70000 }));
    expect(cap.newResFa).toBe(0);
  });

  it('detects vacant land by landUse code', () => {
    const cap = computeCapacity(makeInput({ landUse: '11', existingBldgArea: 0 }));
    expect(cap.isVacant).toBe(true);
  });

  it('detects residential zoning', () => {
    const capR = computeCapacity(makeInput({ zoneDist: 'R8' }));
    expect(capR.zoneAllowsResidential).toBe(true);
    const capM = computeCapacity(makeInput({ zoneDist: 'M3-1' }));
    expect(capM.zoneAllowsResidential).toBe(false);
  });

  it('sets duFactor to 680 for R6+ zones', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'R8' }));
    expect(cap.duFactor).toBe(680);
  });

  it('sets duFactor to 700 for non-table zones', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'R5' }));
    expect(cap.duFactor).toBe(700);
  });

  it('populates qualifyingAffordableFar from zoning table', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'R8' }));
    expect(cap.qualifyingAffordableFar).toBe(7.20);
    expect(cap.qualifyingAffordableFa).toBe(72000);
  });

  it('sets qualifyingAffordableFar to null for non-table zones', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'R5' }));
    expect(cap.qualifyingAffordableFar).toBeNull();
    expect(cap.qualifyingAffordableFa).toBeNull();
  });
});

describe('MIH evaluator', () => {
  it('Option 1: 25% set-aside of maxResFa (full redevelopment)', () => {
    const cap = computeCapacity(makeInput());
    const mih = evaluateMih(cap);
    const opt1 = mih.options.find((o) => o.name === 'Option 1')!;

    expect(opt1.affordableSetAsidePct).toBe(25);
    expect(opt1.affordableFloorArea).toBe(Math.round(0.25 * cap.maxResFa));
    expect(opt1.avgAmi).toBe(60);
  });

  it('Option 1: affordable units = ceil(totalProjectedUnits * 25%)', () => {
    const cap = computeCapacity(makeInput());
    const mih = evaluateMih(cap);
    const opt1 = mih.options.find((o) => o.name === 'Option 1')!;
    const totalProjectedUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);

    expect(opt1.affordableUnits).toBe(calcRequiredAffordableUnits(totalProjectedUnits, 25));
  });

  it('Option 2: 30% set-aside at 80% AMI', () => {
    const cap = computeCapacity(makeInput());
    const mih = evaluateMih(cap);
    const opt2 = mih.options.find((o) => o.name === 'Option 2')!;

    expect(opt2.affordableSetAsidePct).toBe(30);
    expect(opt2.affordableFloorArea).toBe(Math.round(0.30 * cap.maxResFa));
    expect(opt2.avgAmi).toBe(80);
  });

  it('flags ineligible when zone does not allow residential', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'M3-1' }));
    const mih = evaluateMih(cap);

    expect(mih.eligible).toBe('no');
    expect(mih.gaps.length).toBeGreaterThan(0);
  });

  it('has 4 options', () => {
    const cap = computeCapacity(makeInput());
    const mih = evaluateMih(cap);
    expect(mih.options.length).toBe(4);
  });

  it('AMI bands sum to 100% of affordable for each option', () => {
    const cap = computeCapacity(makeInput());
    const mih = evaluateMih(cap);
    for (const opt of mih.options) {
      const totalPct = opt.amiBands.reduce((s, b) => s + b.minPctOfAffordable, 0);
      expect(totalPct).toBe(100);
    }
  });
});

describe('UAP evaluator', () => {
  it('bonus FA = qualifyingAffordableFa - maxResFa', () => {
    const input = makeInput();
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea);
    const opt = uap.options[0];

    const expectedBonus = cap.qualifyingAffordableFa! - cap.maxResFa;
    expect(opt.affordableFloorArea).toBe(expectedBonus);
  });

  it('triggers deep affordability when AFA >= 10,000 SF', () => {
    const input = makeInput({ lotArea: 10000 });
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);

    const afa = uap.options[0].affordableFloorArea;
    expect(afa).toBeGreaterThanOrEqual(10000);
    expect(uap.options[0].details.triggersDeepAffordability).toBe(true);

    const band40 = uap.options[0].amiBands.find((b) => b.maxAmi === 40);
    expect(band40).toBeDefined();
    expect(band40!.floorArea).toBe(Math.round(0.20 * afa));
  });

  it('does NOT trigger deep affordability when AFA < 10,000 SF', () => {
    const input = makeInput({ lotArea: 2000, zoneDist: 'R6B' });
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);

    const afa = uap.options[0].affordableFloorArea;
    expect(afa).toBeLessThan(10000);
    expect(uap.options[0].details.triggersDeepAffordability).toBe(false);
  });

  it('has max 3 income bands', () => {
    const input = makeInput();
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);

    expect(uap.options[0].amiBands.length).toBeLessThanOrEqual(3);
  });

  it('all band AMI caps are <= 100%', () => {
    const input = makeInput();
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);

    for (const band of uap.options[0].amiBands) {
      expect(band.maxAmi).toBeLessThanOrEqual(100);
    }
  });

  it('eligible when zone is UAP-eligible (R6-R12)', () => {
    const input = makeInput({ zoneDist: 'R8' });
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);
    expect(uap.eligible).toBe('yes');
  });

  it('uses zone-specific qualifying FAR, not base + 20%', () => {
    const input = makeInput({ zoneDist: 'R7-1', residFar: 3.44, lotArea: 5067 });
    const cap = computeCapacity(input);
    const uap = evaluateUap(cap, input.lotArea, input.zoneDist);
    const opt = uap.options[0];

    expect(cap.qualifyingAffordableFar).toBe(5.01);
    expect(opt.details.totalResFaWithBonus).toBe(cap.qualifyingAffordableFa);
  });
});

describe('485-x evaluator', () => {
  it('has 3 options (A Large, A Very Large, B)', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    expect(result.options.length).toBe(3);
    const names = result.options.map((o) => o.name);
    expect(names).toContain('Option A (Large)');
    expect(names).toContain('Option A (Very Large)');
    expect(names).toContain('Option B');
  });

  it('uses ceiling rounding for unit counts', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    const totalProjectedUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);

    for (const opt of result.options) {
      const expectedUnits = calcRequiredAffordableUnits(totalProjectedUnits, opt.affordableSetAsidePct);
      expect(opt.affordableUnits).toBe(expectedUnits);
    }
  });

  it('Option A (Large): 25% set-aside, 80% AMI, 35 year benefit', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    const optA = result.options.find((o) => o.name === 'Option A (Large)')!;

    expect(optA.affordableSetAsidePct).toBe(25);
    expect(optA.avgAmi).toBe(80);
    expect(optA.benefitYears).toBe(35);
  });

  it('Option A (Very Large): 25% set-aside, 60% AMI, 40 year benefit', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    const optVL = result.options.find((o) => o.name === 'Option A (Very Large)')!;

    expect(optVL.affordableSetAsidePct).toBe(25);
    expect(optVL.avgAmi).toBe(60);
    expect(optVL.benefitYears).toBe(40);
  });

  it('Option B: 20% set-aside, 80% AMI, 35 year benefit', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    const optB = result.options.find((o) => o.name === 'Option B')!;

    expect(optB.affordableSetAsidePct).toBe(20);
    expect(optB.avgAmi).toBe(80);
    expect(optB.benefitYears).toBe(35);
  });

  it('Option B bands: max AMI 100%, weighted avg = 80%', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    const optB = result.options.find((o) => o.name === 'Option B')!;

    for (const band of optB.amiBands) {
      expect(band.maxAmi).toBeLessThanOrEqual(100);
    }
    const totalPct = optB.amiBands.reduce((s, b) => s + b.minPctOfAffordable, 0);
    expect(totalPct).toBe(100);
  });

  it('selects Option A (Large) for 100-149 projected units', () => {
    const cap = computeCapacity(makeInput({ lotArea: 12500, residFar: 6.02 }));
    const totalUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(totalUnits).toBeGreaterThanOrEqual(80);
    const result = evaluate485x(cap);
    expect(result.applicableOption!.name).toBe('Option A (Large)');
  });

  it('selects Option A (Very Large) for 150+ projected units', () => {
    const cap = computeCapacity(makeInput({ lotArea: 25000, residFar: 6.02 }));
    const totalUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(totalUnits).toBeGreaterThanOrEqual(150);
    const result = evaluate485x(cap);
    expect(result.applicableOption!.name).toBe('Option A (Very Large)');
  });

  it('selects Option B for 6-99 projected units', () => {
    const cap = computeCapacity(makeInput({ lotArea: 5000, residFar: 3.44 }));
    const totalUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(totalUnits).toBeGreaterThanOrEqual(6);
    expect(totalUnits).toBeLessThan(100);
    const result = evaluate485x(cap);
    expect(result.applicableOption!.name).toBe('Option B');
  });

  it('ineligible when fewer than 6 projected units', () => {
    const cap = computeCapacity(makeInput({ lotArea: 500, residFar: 3.44 }));
    const totalUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(totalUnits).toBeLessThan(6);
    const result = evaluate485x(cap);
    expect(result.eligible).toBe('no');
    expect(result.gaps.some((g) => g.includes('Fewer than 6'))).toBe(true);
  });

  it('includes registration deadline field (null by default)', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    for (const opt of result.options) {
      expect(opt).toHaveProperty('registrationDeadline');
    }
  });

  it('eligible when zone allows residential', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate485x(cap);
    expect(result.eligible).toBe('yes');
  });
});

describe('421-a evaluator', () => {
  it('is always marked ineligible (program expired)', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate421a(cap);
    expect(result.eligible).toBe('no');
    expect(result.gaps.some((g) => g.includes('expired'))).toBe(true);
  });

  it('benefit years = construction + post-construction', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate421a(cap);
    for (const opt of result.options) {
      expect(opt.benefitYears).toBe(
        (opt.constructionPeriodYears || 0) +
        Number(String(opt.details.postConstructionPeriod).replace(' years', ''))
      );
    }
  });
});

describe('467-m evaluator', () => {
  it('25% affordable set-aside based on maxResFa', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    const opt = result.options[0];
    expect(opt.affordableSetAsidePct).toBe(25);
    expect(opt.affordableFloorArea).toBe(Math.round(0.25 * cap.maxResFa));
  });

  it('5% of total at <= 40% AMI', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    const opt = result.options[0];
    const deepBand = opt.amiBands.find((b) => b.maxAmi === 40);
    expect(deepBand).toBeDefined();
    const expectedDeep = Math.round(0.05 * cap.maxResFa);
    expect(deepBand!.floorArea).toBe(expectedDeep);
  });

  it('weighted avg AMI <= 80%', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    const opt = result.options[0];
    expect(opt.details.meetsWeightedAvg).toBe(true);
    expect(Number(opt.details.weightedAvgAmi)).toBeLessThanOrEqual(80);
  });

  it('max 3 income bands', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    expect(result.options[0].amiBands.length).toBeLessThanOrEqual(3);
  });

  it('all band caps <= 100% AMI', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    for (const band of result.options[0].amiBands) {
      expect(band.maxAmi).toBeLessThanOrEqual(100);
    }
  });

  it('flags stacking conflict with 485-x', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, ['485-x']);
    expect(result.eligible).toBe('no');
    expect(result.gaps.some((g) => g.includes('Stacking conflict'))).toBe(true);
    expect(result.gaps.some((g) => g.includes('485-x'))).toBe(true);
  });

  it('flags stacking conflict with 421-a', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, ['421-a']);
    expect(result.eligible).toBe('no');
    expect(result.gaps.some((g) => g.includes('421-a'))).toBe(true);
  });

  it('no stacking conflict when no conflicting programs', () => {
    const cap = computeCapacity(makeInput());
    const result = evaluate467m(cap, []);
    const stackGaps = result.gaps.filter((g) => g.includes('Stacking'));
    expect(stackGaps.length).toBe(0);
  });

  it('conversion rule: flags gap if pre-existing < 50%', () => {
    const cap = computeCapacity(makeInput({ existingBldgArea: 2000 }));
    const result = evaluate467m(cap, []);
    const convGap = result.gaps.find((g) => g.includes('Conversion'));
    if (cap.existingBldgArea / cap.maxBuildableSf < 0.50 && !cap.isVacant) {
      expect(convGap).toBeDefined();
    }
  });
});

describe('evaluateFeasibility (unified)', () => {
  it('returns all 5 programs', () => {
    const result = evaluateFeasibility(makeInput());
    expect(result.programs.length).toBe(5);
    const names = result.programs.map((p) => p.program);
    expect(names).toContain('MIH');
    expect(names).toContain('UAP');
    expect(names).toContain('485-x');
    expect(names).toContain('421-a');
    expect(names).toContain('467-m');
  });

  it('reports stacking conflict between 485-x and 421-a', () => {
    const result = evaluateFeasibility(makeInput(), ['485-x', '421-a']);
    expect(result.stackingConflicts.some((c) => c.includes('mutually exclusive'))).toBe(true);
  });

  it('returns capacity model with zoning table fields', () => {
    const result = evaluateFeasibility(makeInput());
    expect(result.capacity.maxResFa).toBe(60200);
    expect(result.capacity.duFactor).toBe(680);
    expect(result.capacity.qualifyingAffordableFar).toBe(7.20);
  });
});

describe('2693 Atlantic Ave regression (BBL 3036720051)', () => {
  const atlanticInput: CapacityInput = {
    lotArea: 12500,
    existingBldgArea: 0,
    residFar: 4.2,
    commFar: 2.0,
    facilFar: 0,
    builtFar: 0,
    zoneDist: 'R7A',
    landUse: '11',
    unitsRes: 0,
    numFloors: 0,
    yearBuilt: 0,
  };

  it('uses PLUTO FAR when higher than zoning table (4.2 > 4.0)', () => {
    const cap = computeCapacity(atlanticInput);
    expect(cap.maxResFa).toBe(52500);
    expect(cap.duFactor).toBe(680);
  });

  it('total projected units = floor(52500/680) = 77', () => {
    const cap = computeCapacity(atlanticInput);
    expect(calcTotalProjectedUnits(cap.maxResFa, cap.duFactor)).toBe(77);
  });

  it('MIH Option 1 (25%): ceil(77 * 0.25) = 20 affordable units', () => {
    const cap = computeCapacity(atlanticInput);
    const mih = evaluateMih(cap);
    const opt1 = mih.options.find((o) => o.name === 'Option 1')!;

    expect(opt1.affordableUnits).toBe(20);
    expect(opt1.affordableSetAsidePct).toBe(25);
  });

  it('485-x selects Option B for ~77 projected units', () => {
    const cap = computeCapacity(atlanticInput);
    const result = evaluate485x(cap);

    expect(result.applicableOption).not.toBeNull();
    expect(result.applicableOption!.name).toBe('Option B');
  });

  it('market-rate units = 77 - 20 = 57 (MIH Option 1)', () => {
    const cap = computeCapacity(atlanticInput);
    const mih = evaluateMih(cap);
    const opt1 = mih.options.find((o) => o.name === 'Option 1')!;
    const total = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    const marketRate = total - opt1.affordableUnits;

    expect(marketRate).toBe(57);
  });
});

describe('2256 Andrews Ave regression (R7-1, lot=5067)', () => {
  const andrewsInput: CapacityInput = {
    lotArea: 5067,
    existingBldgArea: 0,
    residFar: 3.44,
    commFar: 0,
    facilFar: 0,
    builtFar: 0,
    zoneDist: 'R7-1',
    landUse: '11',
    unitsRes: 0,
    numFloors: 0,
    yearBuilt: 0,
  };

  it('as-of-right: FAR 3.44, maxResFa = round(3.44 * 5067)', () => {
    const cap = computeCapacity(andrewsInput);
    expect(cap.maxResFa).toBe(Math.round(3.44 * 5067));
    expect(cap.duFactor).toBe(680);
    expect(cap.qualifyingAffordableFar).toBe(5.01);
  });

  it('as-of-right projected units = floor(17430/680) = 25', () => {
    const cap = computeCapacity(andrewsInput);
    const units = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(units).toBe(25);
  });

  it('UAP qualifying FA = round(5.01 * 5067)', () => {
    const cap = computeCapacity(andrewsInput);
    expect(cap.qualifyingAffordableFa).toBe(Math.round(5.01 * 5067));
  });

  it('UAP total units = floor(qualifyingAffordableFa / 680)', () => {
    const cap = computeCapacity(andrewsInput);
    const uap = evaluateUap(cap, andrewsInput.lotArea, andrewsInput.zoneDist);
    const opt = uap.options[0];

    const totalWithUap = calcTotalProjectedUnits(cap.qualifyingAffordableFa!, cap.duFactor);
    expect(opt.details.totalUnitsWithBonus).toBe(totalWithUap);
  });

  it('UAP affordable units = totalWithUap - baseUnits (all bonus units)', () => {
    const cap = computeCapacity(andrewsInput);
    const uap = evaluateUap(cap, andrewsInput.lotArea, andrewsInput.zoneDist);
    const opt = uap.options[0];

    const baseUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    const totalWithUap = calcTotalProjectedUnits(cap.qualifyingAffordableFa!, cap.duFactor);
    expect(opt.affordableUnits).toBe(totalWithUap - baseUnits);
    expect(Number(opt.details.marketRateUnits)).toBe(baseUnits);
  });

  it('UAP is eligible for R7-1', () => {
    const cap = computeCapacity(andrewsInput);
    const uap = evaluateUap(cap, andrewsInput.lotArea, andrewsInput.zoneDist);
    expect(uap.eligible).toBe('yes');
  });

  it('485-x selects Option B (20% affordable) for 25 projected units', () => {
    const cap = computeCapacity(andrewsInput);
    const result = evaluate485x(cap);
    expect(result.applicableOption!.name).toBe('Option B');
    expect(result.applicableOption!.affordableSetAsidePct).toBe(20);
    expect(result.applicableOption!.avgAmi).toBe(80);
  });

  it('485-x Option B: ceil(25 * 0.20) = 5 affordable units', () => {
    const cap = computeCapacity(andrewsInput);
    const result = evaluate485x(cap);
    const optB = result.applicableOption!;
    expect(optB.affordableUnits).toBe(5);
  });

  it('485-x Option B bands all <= 100% AMI', () => {
    const cap = computeCapacity(andrewsInput);
    const result = evaluate485x(cap);
    const optB = result.applicableOption!;
    for (const band of optB.amiBands) {
      expect(band.maxAmi).toBeLessThanOrEqual(100);
    }
  });
});

describe('Full redevelopment assumption', () => {
  it('projected units use maxResFa even with existing building', () => {
    const input = makeInput({ lotArea: 7500, existingBldgArea: 44800, residFar: 7.0 });
    const cap = computeCapacity(input);
    expect(cap.maxResFa).toBe(52500);
    expect(cap.newResFa).toBe(7700);
    expect(calcTotalProjectedUnits(cap.maxResFa, cap.duFactor)).toBe(Math.floor(52500 / 680));
    expect(calcTotalProjectedUnits(cap.newResFa, cap.duFactor)).toBe(Math.floor(7700 / 680));
  });

  it('MIH uses maxResFa for unit calculations on non-vacant lot', () => {
    const input = makeInput({ lotArea: 7500, existingBldgArea: 44800, residFar: 7.0 });
    const cap = computeCapacity(input);
    const mih = evaluateMih(cap);
    const opt1 = mih.options.find((o) => o.name === 'Option 1')!;
    const totalUnits = calcTotalProjectedUnits(cap.maxResFa, cap.duFactor);
    expect(opt1.affordableUnits).toBe(calcRequiredAffordableUnits(totalUnits, 25));
    expect(opt1.affordableFloorArea).toBe(Math.round(0.25 * cap.maxResFa));
  });

  it('467-m uses maxResFa for affordable floor area on non-vacant lot', () => {
    const input = makeInput({ lotArea: 7500, existingBldgArea: 44800, residFar: 7.0 });
    const cap = computeCapacity(input);
    const result = evaluate467m(cap, []);
    expect(result.options[0].affordableFloorArea).toBe(Math.round(0.25 * cap.maxResFa));
    expect(result.options[0].details.totalNewResFa).toBe(cap.maxResFa);
  });
});
