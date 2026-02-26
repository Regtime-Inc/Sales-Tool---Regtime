import type { CapacityResult, ProgramEvaluation, ProgramOption, AmiBand } from '../../types/feasibility';
import { calcTotalProjectedUnits, calcRequiredAffordableUnits } from '../units/unitMath';

interface Option421aDef {
  name: string;
  setAsidePct: number;
  avgAmi: number;
  constructionYears: number;
  postConstructionYears: number;
  bands: { maxAmi: number; minPctOfAffordable: number }[];
}

const OPTIONS_421A: Option421aDef[] = [
  {
    name: 'Option A (Homeownership)',
    setAsidePct: 0.25,
    avgAmi: 130,
    constructionYears: 3,
    postConstructionYears: 25,
    bands: [
      { maxAmi: 100, minPctOfAffordable: 30 },
      { maxAmi: 130, minPctOfAffordable: 70 },
    ],
  },
  {
    name: 'Option B (Rental)',
    setAsidePct: 0.25,
    avgAmi: 130,
    constructionYears: 3,
    postConstructionYears: 35,
    bands: [
      { maxAmi: 100, minPctOfAffordable: 30 },
      { maxAmi: 130, minPctOfAffordable: 40 },
      { maxAmi: 165, minPctOfAffordable: 30 },
    ],
  },
  {
    name: 'Option C (Enhanced Affordability)',
    setAsidePct: 0.30,
    avgAmi: 60,
    constructionYears: 3,
    postConstructionYears: 35,
    bands: [
      { maxAmi: 40, minPctOfAffordable: 30 },
      { maxAmi: 60, minPctOfAffordable: 40 },
      { maxAmi: 80, minPctOfAffordable: 30 },
    ],
  },
];

export function evaluate421a(capacity: CapacityResult): ProgramEvaluation {
  const gaps: string[] = [
    '421-a expired June 15, 2022. Only grandfathered projects may qualify.',
  ];
  const notes: string[] = [
    '421-a (Affordable New York Housing Program) benefit: construction period + post-construction.',
    'Projects must have commenced construction before expiration to be grandfathered.',
  ];

  if (!capacity.zoneAllowsResidential) {
    gaps.push('Zoning does not appear to allow residential use');
  }
  if (capacity.newResFa <= 0) {
    gaps.push('No new residential floor area available');
  }

  const totalProjectedUnits = calcTotalProjectedUnits(capacity.maxResFa, capacity.duFactor);

  const options: ProgramOption[] = OPTIONS_421A.map((def) => {
    const affordableUnits = calcRequiredAffordableUnits(totalProjectedUnits, def.setAsidePct);
    const afa = Math.round(def.setAsidePct * capacity.maxResFa);

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

    const totalBenefitYears = def.constructionYears + def.postConstructionYears;

    return {
      name: def.name,
      affordableSetAsidePct: def.setAsidePct * 100,
      affordableFloorArea: afa,
      affordableUnits,
      avgAmi: def.avgAmi,
      amiBands,
      benefitYears: totalBenefitYears,
      constructionPeriodYears: def.constructionYears,
      registrationDeadline: null,
      details: {
        totalNewResFa: capacity.maxResFa,
        constructionPeriod: `${def.constructionYears} years`,
        postConstructionPeriod: `${def.postConstructionYears} years`,
        totalBenefitPeriod: `${totalBenefitYears} years`,
        programStatus: 'expired',
        expirationDate: '2022-06-15',
      },
    };
  });

  return {
    program: '421-a',
    eligible: 'no' as const,
    applicableOption: null,
    options,
    gaps,
    notes,
    missingData: [],
    citations: [{ source: 'NYC HPD', field: '421-a program sunset' }],
  };
}
