import type { CapacityResult, ProgramEvaluation, ProgramOption, AmiBand } from '../../types/feasibility';
import { calcTotalProjectedUnits, calcRequiredAffordableUnits } from '../units/unitMath';

const AFFORDABLE_SET_ASIDE = 0.25;
const DEEP_AFFORDABLE_SET_ASIDE = 0.05;
const DEEP_AMI_CAP = 40;
const WEIGHTED_AVG_AMI_MAX = 80;
const MAX_BANDS = 3;
const BAND_CAP_AMI = 100;
const CONVERSION_MIN_PREEXISTING = 0.50;
const CONFLICTING_PROGRAMS = ['421-a', '485-x', 'J-51'];

export function evaluate467m(
  capacity: CapacityResult,
  activePrograms: string[]
): ProgramEvaluation {
  const gaps: string[] = [];
  const notes: string[] = [
    '467-m: 25% affordable, 5% at <= 40% AMI, weighted avg <= 80% AMI.',
    `Max ${MAX_BANDS} income bands, each capped at ${BAND_CAP_AMI}% AMI.`,
    'Conversion projects: >= 50% of total floor area must be pre-existing.',
    'Cannot stack with 421-a, 485-x, J-51, or other property tax exemptions/abatements.',
  ];

  if (!capacity.zoneAllowsResidential) {
    gaps.push('Zoning does not appear to allow residential use');
  }
  if (capacity.newResFa <= 0) {
    gaps.push('No new residential floor area available');
  }

  const conflicts = activePrograms.filter((p) =>
    CONFLICTING_PROGRAMS.some((c) => p.toLowerCase().includes(c.toLowerCase()))
  );
  if (conflicts.length > 0) {
    gaps.push(`Stacking conflict with: ${conflicts.join(', ')}`);
  }

  const totalResFa = capacity.maxResFa;
  const totalProjectedUnits = calcTotalProjectedUnits(totalResFa, capacity.duFactor);
  const affordableFa = Math.round(AFFORDABLE_SET_ASIDE * totalResFa);
  const deepFa = Math.round(DEEP_AFFORDABLE_SET_ASIDE * totalResFa);
  const midFa = affordableFa - deepFa;
  const affordableUnits = calcRequiredAffordableUnits(totalProjectedUnits, AFFORDABLE_SET_ASIDE);
  const deepUnits = Math.ceil(affordableUnits * (DEEP_AFFORDABLE_SET_ASIDE / AFFORDABLE_SET_ASIDE));

  const amiBands: AmiBand[] = [
    {
      maxAmi: DEEP_AMI_CAP,
      minPctOfAffordable: Math.round((deepFa / (affordableFa || 1)) * 100),
      floorArea: deepFa,
      units: deepUnits,
    },
    {
      maxAmi: 80,
      minPctOfAffordable: Math.round(((midFa * 0.5) / (affordableFa || 1)) * 100),
      floorArea: Math.round(midFa * 0.5),
      units: Math.ceil((affordableUnits - deepUnits) * 0.5),
    },
    {
      maxAmi: BAND_CAP_AMI,
      minPctOfAffordable: Math.round(((midFa * 0.5) / (affordableFa || 1)) * 100),
      floorArea: midFa - Math.round(midFa * 0.5),
      units: Math.max(affordableUnits - deepUnits - Math.ceil((affordableUnits - deepUnits) * 0.5), 0),
    },
  ];

  const weightedAvg =
    affordableFa > 0
      ? Math.round(
          amiBands.reduce((sum, b) => sum + b.maxAmi * b.floorArea, 0) / affordableFa
        )
      : 0;

  const isConversion = capacity.existingBldgArea > 0 && !capacity.isVacant;
  const conversionRatio =
    capacity.existingBldgArea > 0 && capacity.maxBuildableSf > 0
      ? capacity.existingBldgArea / capacity.maxBuildableSf
      : 0;
  const conversionMeetsThreshold = conversionRatio >= CONVERSION_MIN_PREEXISTING;

  if (isConversion && !conversionMeetsThreshold) {
    gaps.push(
      `Conversion requires >= 50% pre-existing floor area (current: ${Math.round(conversionRatio * 100)}%)`
    );
  }

  const option: ProgramOption = {
    name: '467-m',
    affordableSetAsidePct: AFFORDABLE_SET_ASIDE * 100,
    affordableFloorArea: affordableFa,
    affordableUnits,
    avgAmi: weightedAvg,
    amiBands,
    benefitYears: null,
    constructionPeriodYears: null,
    registrationDeadline: null,
    details: {
      totalNewResFa: totalResFa,
      totalProjectedUnits,
      deepAffordableFa: deepFa,
      deepAffordableUnits: deepUnits,
      weightedAvgAmi: weightedAvg,
      weightedAvgAmiLimit: WEIGHTED_AVG_AMI_MAX,
      meetsWeightedAvg: weightedAvg <= WEIGHTED_AVG_AMI_MAX,
      isConversion,
      conversionRatioPct: Math.round(conversionRatio * 100),
      conversionMeetsThreshold,
      stackingConflicts: conflicts.join(', ') || 'none',
    },
  };

  const eligible =
    gaps.length > 0 ? 'no' : capacity.maxResFa > 0 ? 'needs_verification' as const : 'no' as const;

  return {
    program: '467-m',
    eligible,
    applicableOption: eligible !== 'no' ? option : null,
    options: [option],
    gaps,
    notes,
    missingData: eligible !== 'no' ? ['NB permit commencement date', '467-m stacking confirmation'] : [],
    citations: [{ source: 'PLUTO', field: 'ResidFAR' }, { source: 'NYC DOF', field: '467-m schedule' }],
  };
}
