import type { CapacityResult, ProgramEvaluation, ProgramOption, AmiBand } from '../../types/feasibility';
import { AVG_UNIT_SF, calcTotalProjectedUnits, calcRequiredAffordableUnits, calcMarketRateUnits } from '../units/unitMath';

interface Option485xDef {
  name: string;
  setAsidePct: number;
  avgAmi: number;
  benefitYears: number;
  minUnits: number;
  maxUnits: number;
  bands: { maxAmi: number; minPctOfAffordable: number }[];
}

const OPTIONS_485X: Option485xDef[] = [
  {
    name: 'Option A (Large)',
    setAsidePct: 0.25,
    avgAmi: 80,
    benefitYears: 35,
    minUnits: 100,
    maxUnits: 149,
    bands: [
      { maxAmi: 60, minPctOfAffordable: 30 },
      { maxAmi: 80, minPctOfAffordable: 40 },
      { maxAmi: 100, minPctOfAffordable: 30 },
    ],
  },
  {
    name: 'Option A (Very Large)',
    setAsidePct: 0.25,
    avgAmi: 60,
    benefitYears: 40,
    minUnits: 150,
    maxUnits: Infinity,
    bands: [
      { maxAmi: 40, minPctOfAffordable: 30 },
      { maxAmi: 60, minPctOfAffordable: 40 },
      { maxAmi: 80, minPctOfAffordable: 30 },
    ],
  },
  {
    name: 'Option B',
    setAsidePct: 0.20,
    avgAmi: 80,
    benefitYears: 35,
    minUnits: 6,
    maxUnits: 99,
    bands: [
      { maxAmi: 60, minPctOfAffordable: 30 },
      { maxAmi: 80, minPctOfAffordable: 40 },
      { maxAmi: 100, minPctOfAffordable: 30 },
    ],
  },
];

export function evaluate485x(capacity: CapacityResult): ProgramEvaluation {
  const gaps: string[] = [];
  const notes: string[] = [
    '485-x (Affordable Neighborhoods for New Yorkers) enacted 2024.',
    'Registration deadline varies by option and project commencement date.',
    'Unit counts use ceiling rounding per HPD guidance.',
    'Options C (small rental, rent-stabilization) and D (homeownership) are not modeled here.',
  ];

  if (!capacity.zoneAllowsResidential) {
    gaps.push('Zoning does not appear to allow residential use');
  }
  if (capacity.newResFa <= 0) {
    gaps.push('No new residential floor area available');
  }

  const totalProjectedUnits = calcTotalProjectedUnits(capacity.maxResFa, capacity.duFactor);

  if (totalProjectedUnits < 6) {
    gaps.push('Fewer than 6 projected units; 485-x Options A/B require at least 6 dwelling units');
  }

  const options: ProgramOption[] = OPTIONS_485X.map((def) => {
    const affordableUnits = calcRequiredAffordableUnits(totalProjectedUnits, def.setAsidePct);
    const afa = Math.round(def.setAsidePct * capacity.maxResFa);
    const marketUnits = calcMarketRateUnits(totalProjectedUnits, affordableUnits);

    const amiBands: AmiBand[] = def.bands.map((b) => {
      const bandFa = Math.round((b.minPctOfAffordable / 100) * afa);
      const bandUnits = Math.ceil(affordableUnits * b.minPctOfAffordable / 100);
      return {
        maxAmi: b.maxAmi,
        minPctOfAffordable: b.minPctOfAffordable,
        floorArea: bandFa,
        units: bandUnits,
      };
    });

    return {
      name: def.name,
      affordableSetAsidePct: def.setAsidePct * 100,
      affordableFloorArea: afa,
      affordableUnits,
      avgAmi: def.avgAmi,
      amiBands,
      benefitYears: def.benefitYears,
      constructionPeriodYears: null,
      registrationDeadline: null,
      details: {
        totalNewResFa: capacity.maxResFa,
        totalProjectedUnits,
        marketRateFloorArea: capacity.maxResFa - afa,
        marketRateUnits: marketUnits,
        roundingMethod: 'ceil',
      },
    };
  });

  const eligible = gaps.length > 0 ? 'no' : 'yes' as const;

  let applicableIdx = 0;
  if (totalProjectedUnits >= 150) applicableIdx = 1;
  else if (totalProjectedUnits >= 100) applicableIdx = 0;
  else applicableIdx = 2;

  return {
    program: '485-x',
    eligible,
    applicableOption: eligible !== 'no' ? options[applicableIdx] ?? null : null,
    options,
    gaps,
    notes,
    missingData: eligible !== 'no' ? ['NB permit commencement date', 'HPD 485-x registration filing'] : [],
    citations: [{ source: 'PLUTO', field: 'ResidFAR' }, { source: 'NYC HPD', field: '485-x options' }],
  };
}
