import type { UnitRecord, UnitMixExtraction } from '../../types/pdf';
import type {
  OptimizerResult,
  UnitAllocation,
  RentAssumption,
  CostAssumptions,
  ProgramConstraint,
} from '../../types/optimizer';
import { evaluateConstraints, isFeasible } from './constraints';

const BEDROOM_TYPE_MAP: Record<string, string> = {
  STUDIO: 'Studio',
  '1BR': '1BR',
  '2BR': '2BR',
  '3BR': '3BR',
  '4BR_PLUS': '3BR',
  UNKNOWN: '1BR',
};

const ALLOCATION_AMI_MAP: Record<string, number> = {
  MARKET: 0,
  AFFORDABLE: 60,
  MIH_RESTRICTED: 80,
  UNKNOWN: 0,
};

const DEFAULT_SF: Record<string, number> = {
  Studio: 475,
  '1BR': 650,
  '2BR': 900,
  '3BR': 1200,
};

function lookupRent(
  rents: RentAssumption[],
  unitType: string,
  amiBand: number,
): number {
  const exact = rents.find((r) => r.unitType === unitType && r.amiBand === amiBand);
  if (exact) return exact.monthlyRent;
  const sameType = rents.filter((r) => r.unitType === unitType);
  if (sameType.length === 0) return 2000;
  let closest = sameType[0];
  for (const r of sameType) {
    if (Math.abs(r.amiBand - amiBand) < Math.abs(closest.amiBand - amiBand)) {
      closest = r;
    }
  }
  return closest.monthlyRent;
}

export function buildResultFromAllocations(
  allocations: UnitAllocation[],
  netResidentialSF: number,
  rentAssumptions: RentAssumption[],
  costAssumptions: CostAssumptions,
  programConstraints: ProgramConstraint[],
): OptimizerResult {
  const filtered = allocations.filter((a) => a.count > 0);

  for (const a of filtered) {
    if (a.monthlyRent <= 0) {
      a.monthlyRent = lookupRent(rentAssumptions, a.unitType, a.amiBand);
    }
  }

  const totalUnits = filtered.reduce((s, a) => s + a.count, 0);
  const totalSF = filtered.reduce((s, a) => s + a.totalSF, 0);
  const totalMonthlyRent = filtered.reduce((s, a) => s + a.count * a.monthlyRent, 0);
  const annualRevenue = totalMonthlyRent * 12;

  const affordableAllocs = filtered.filter((a) => a.amiBand > 0);
  const affordableUnitCount = affordableAllocs.reduce((s, a) => s + a.count, 0);
  const marketUnitCount = totalUnits - affordableUnitCount;

  let blendedAmi = 0;
  if (affordableUnitCount > 0) {
    blendedAmi = Math.round(
      affordableAllocs.reduce((s, a) => s + a.amiBand * a.count, 0) / affordableUnitCount,
    );
  }

  const { hardCostPerSF, softCostPct, landCostPerSF } = costAssumptions;
  const totalDevelopmentCost =
    totalSF * hardCostPerSF * (1 + softCostPct) + totalSF * landCostPerSF;
  const roiProxy = totalDevelopmentCost > 0 ? annualRevenue / totalDevelopmentCost : 0;

  const constraintSlack = evaluateConstraints(filtered, netResidentialSF, programConstraints);
  const feasible = isFeasible(constraintSlack);

  return {
    allocations: filtered,
    constraintSlack,
    sensitivity: [],
    totalUnits,
    affordableUnitCount,
    marketUnitCount,
    totalSF,
    totalMonthlyRent,
    blendedAmi,
    annualRevenue,
    totalDevelopmentCost,
    roiProxy,
    feasible,
    solverMethod: 'heuristic',
  };
}

export function buildResultFromUnitRecords(
  records: UnitRecord[],
  netResidentialSF: number,
  rentAssumptions: RentAssumption[],
  costAssumptions: CostAssumptions,
  programConstraints: ProgramConstraint[],
): OptimizerResult {
  const groups = new Map<string, UnitAllocation>();

  for (const rec of records) {
    const unitType = BEDROOM_TYPE_MAP[rec.bedroomType] ?? '1BR';
    const amiBand = rec.amiBand ?? ALLOCATION_AMI_MAP[rec.allocation] ?? 0;
    const sf = rec.areaSf ?? DEFAULT_SF[unitType] ?? 650;
    const key = `${unitType}-${amiBand}`;

    const existing = groups.get(key);
    if (existing) {
      const totalSFNew = existing.totalSF + sf;
      const countNew = existing.count + 1;
      existing.count = countNew;
      existing.totalSF = totalSFNew;
      existing.avgSF = Math.round(totalSFNew / countNew);
    } else {
      groups.set(key, {
        unitType,
        amiBand,
        count: 1,
        avgSF: Math.round(sf),
        totalSF: Math.round(sf),
        monthlyRent: lookupRent(rentAssumptions, unitType, amiBand),
      });
    }
  }

  return buildResultFromAllocations(
    Array.from(groups.values()),
    netResidentialSF,
    rentAssumptions,
    costAssumptions,
    programConstraints,
  );
}

export function buildResultFromUnitMix(
  unitMix: UnitMixExtraction,
  netResidentialSF: number,
  rentAssumptions: RentAssumption[],
  costAssumptions: CostAssumptions,
  programConstraints: ProgramConstraint[],
): OptimizerResult {
  if (unitMix.unitRecords.length > 0) {
    return buildResultFromUnitRecords(
      unitMix.unitRecords,
      netResidentialSF,
      rentAssumptions,
      costAssumptions,
      programConstraints,
    );
  }

  const allocations: UnitAllocation[] = [];
  const totals = unitMix.totals;

  for (const [bedType, count] of Object.entries(totals.byBedroomType)) {
    if (count <= 0) continue;
    const unitType = BEDROOM_TYPE_MAP[bedType] ?? '1BR';
    const sf = DEFAULT_SF[unitType] ?? 650;
    allocations.push({
      unitType,
      amiBand: 0,
      count,
      avgSF: sf,
      totalSF: sf * count,
      monthlyRent: lookupRent(rentAssumptions, unitType, 0),
    });
  }

  return buildResultFromAllocations(
    allocations,
    netResidentialSF,
    rentAssumptions,
    costAssumptions,
    programConstraints,
  );
}
