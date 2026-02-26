import type { CapacityResult, ProgramEvaluation, ProgramOption, AmiBand } from '../../types/feasibility';
import { calcTotalProjectedUnits } from '../units/unitMath';
import { isUapEligibleDistrict } from '../zoning/equivalences';

const UAP_AVG_AMI = 60;
const UAP_MAX_BANDS = 3;
const UAP_BAND_CAP = 100;
const UAP_DEEP_THRESHOLD_SF = 10_000;
const UAP_DEEP_AMI = 40;
const UAP_DEEP_SHARE = 0.20;

const UNIT_MIN_SIZES: Record<string, number> = {
  Studio: 400,
  '1BR': 575,
  '2BR': 750,
  '3BR': 1000,
};

export function evaluateUap(
  capacity: CapacityResult,
  lotArea: number,
  zoneDist?: string,
  uapAffordableUtilizationPct?: number
): ProgramEvaluation {
  const gaps: string[] = [];
  const duFactor = capacity.duFactor;
  const notes: string[] = [
    'UAP provides additional residential FAR for qualifying affordable housing per ZR 23-22.',
    `Unit minimums: Studio ${UNIT_MIN_SIZES.Studio} SF, 1BR ${UNIT_MIN_SIZES['1BR']} SF, 2BR ${UNIT_MIN_SIZES['2BR']} SF, 3BR ${UNIT_MIN_SIZES['3BR']} SF.`,
    'At least 50% of affordable units should have 2+ bedrooms (bedroom mix constraint).',
    `Max ${UAP_MAX_BANDS} income bands, each capped at ${UAP_BAND_CAP}% AMI.`,
  ];

  if (!capacity.zoneAllowsResidential) {
    gaps.push('Zoning does not appear to allow residential use');
  }
  if (capacity.maxResFa <= 0) {
    gaps.push('No residential FAR available for bonus calculation');
  }

  const isUapZone = zoneDist ? isUapEligibleDistrict(zoneDist) : false;
  if (zoneDist && !isUapZone) {
    gaps.push(`Zone ${zoneDist} is not in UAP-eligible range (R6-R12 or commercial equivalent)`);
  }

  const hasQualifyingFar = capacity.qualifyingAffordableFar !== null
    && capacity.qualifyingAffordableFa !== null
    && capacity.qualifyingAffordableFa > capacity.maxResFa;

  if (!hasQualifyingFar && isUapZone) {
    gaps.push('No qualifying affordable FAR found in zoning table for this district');
  }

  const totalFaWithUap = hasQualifyingFar ? capacity.qualifyingAffordableFa! : capacity.maxResFa;
  const baseFa = capacity.maxResFa;
  const maxBonusFa = Math.max(totalFaWithUap - baseFa, 0);

  const utilizationPct = uapAffordableUtilizationPct != null
    ? Math.max(0, Math.min(100, uapAffordableUtilizationPct)) / 100
    : 1;
  const bonusFa = Math.round(maxBonusFa * utilizationPct);
  const affordableFloorArea = bonusFa;

  const effectiveTotalFa = baseFa + bonusFa;
  const totalUnitsWithBonus = calcTotalProjectedUnits(effectiveTotalFa, duFactor);
  const baseUnits = calcTotalProjectedUnits(baseFa, duFactor);
  const bonusUnits = Math.max(totalUnitsWithBonus - baseUnits, 0);
  const affordableUnits = bonusUnits;

  const affordablePctOfTotal = totalUnitsWithBonus > 0
    ? Math.round((affordableUnits / totalUnitsWithBonus) * 10000) / 100
    : 0;

  const triggersDeepAffordability = affordableFloorArea >= UAP_DEEP_THRESHOLD_SF;

  let amiBands: AmiBand[];
  if (triggersDeepAffordability) {
    const deepFa = Math.round(UAP_DEEP_SHARE * affordableFloorArea);
    const deepUnits = Math.max(Math.ceil(affordableUnits * UAP_DEEP_SHARE), 1);
    const remainingFa = affordableFloorArea - deepFa;
    const remainingUnits = affordableUnits - deepUnits;
    const midUnits = Math.ceil(remainingUnits * 0.5);
    const topUnits = Math.max(remainingUnits - midUnits, 0);
    amiBands = [
      { maxAmi: UAP_DEEP_AMI, minPctOfAffordable: 20, floorArea: deepFa, units: deepUnits },
      { maxAmi: 60, minPctOfAffordable: 40, floorArea: Math.round(remainingFa * 0.5), units: midUnits },
      { maxAmi: 80, minPctOfAffordable: 40, floorArea: remainingFa - Math.round(remainingFa * 0.5), units: topUnits },
    ];
    notes.push(`AFA (${affordableFloorArea.toLocaleString()} SF) >= 10,000 SF: 20% must be at <= 40% AMI.`);
  } else {
    const halfUnits = Math.ceil(affordableUnits * 0.5);
    const rest = Math.max(affordableUnits - halfUnits, 0);
    const bandFa = Math.round(affordableFloorArea / 2);
    amiBands = [
      { maxAmi: 50, minPctOfAffordable: 50, floorArea: bandFa, units: halfUnits },
      { maxAmi: 70, minPctOfAffordable: 50, floorArea: affordableFloorArea - bandFa, units: rest },
    ];
  }

  if (utilizationPct < 1) {
    notes.push(`UAP utilization set to ${Math.round(utilizationPct * 100)}% (${affordableFloorArea.toLocaleString()} of ${maxBonusFa.toLocaleString()} SF bonus).`);
  }
  if (affordableFloorArea > 0 && affordableFloorArea < UAP_DEEP_THRESHOLD_SF) {
    notes.push(`Affordable floor area (${affordableFloorArea.toLocaleString()} SF) is under 10,000 SF; deep affordability not triggered.`);
  }

  const bonusFarValue = capacity.qualifyingAffordableFar !== null
    ? Math.round((capacity.qualifyingAffordableFar - (capacity.maxResFa / lotArea)) * 100) / 100
    : 0;

  const option: ProgramOption = {
    name: 'UAP Bonus',
    affordableSetAsidePct: affordablePctOfTotal,
    affordableFloorArea,
    affordableUnits,
    avgAmi: UAP_AVG_AMI,
    amiBands,
    benefitYears: null,
    constructionPeriodYears: null,
    registrationDeadline: null,
    details: {
      totalProjectedUnits: totalUnitsWithBonus,
      standardFar: Math.round((capacity.maxResFa / lotArea) * 100) / 100,
      qualifyingAffordableFar: capacity.qualifyingAffordableFar ?? 0,
      bonusFar: bonusFarValue,
      bonusFloorArea: bonusFa,
      maxBonusFloorArea: maxBonusFa,
      uapUtilizationPct: Math.round(utilizationPct * 100),
      totalResFaWithBonus: effectiveTotalFa,
      totalUnitsWithBonus,
      baseUnits,
      marketRateUnits: totalUnitsWithBonus - affordableUnits,
      duFactor,
      triggersDeepAffordability,
      deepAffordableThresholdSf: UAP_DEEP_THRESHOLD_SF,
      zoningSource: capacity.zoningSource,
    },
  };

  const eligible = gaps.length > 0 ? 'no' : isUapZone && hasQualifyingFar ? 'yes' as const : 'no' as const;

  notes.push(
    `All bonus floor area above the standard FAR must be permanently affordable at avg ${UAP_AVG_AMI}% AMI.`
  );

  return {
    program: 'UAP',
    eligible,
    applicableOption: eligible !== 'no' ? option : null,
    options: [option],
    gaps,
    notes,
    missingData: eligible !== 'no' ? ['HPD UAP program enrollment confirmation'] : [],
    citations: [{ source: 'ZR 23-22', field: 'Qualifying Affordable FAR' }, { source: 'PLUTO', field: 'ZoneDist1' }],
  };
}
