import type { CapacityResult, ProgramEvaluation, ProgramOption, AmiBand } from '../../types/feasibility';
import type { MihEligibilityResult } from '../mih/types';
import { AVG_UNIT_SF, calcTotalProjectedUnits, calcRequiredAffordableUnits, calcMarketRateUnits } from '../units/unitMath';

export { AVG_UNIT_SF };

interface MihOptionDef {
  name: string;
  setAsidePct: number;
  avgAmi: number;
  bands: { maxAmi: number; minPctOfAffordable: number }[];
}

const MIH_OPTIONS: MihOptionDef[] = [
  {
    name: 'Option 1',
    setAsidePct: 0.25,
    avgAmi: 60,
    bands: [
      { maxAmi: 40, minPctOfAffordable: 10 },
      { maxAmi: 60, minPctOfAffordable: 50 },
      { maxAmi: 80, minPctOfAffordable: 40 },
    ],
  },
  {
    name: 'Option 2',
    setAsidePct: 0.30,
    avgAmi: 80,
    bands: [
      { maxAmi: 60, minPctOfAffordable: 20 },
      { maxAmi: 80, minPctOfAffordable: 40 },
      { maxAmi: 100, minPctOfAffordable: 40 },
    ],
  },
  {
    name: 'Option 3 (Deep Affordability)',
    setAsidePct: 0.20,
    avgAmi: 40,
    bands: [
      { maxAmi: 30, minPctOfAffordable: 40 },
      { maxAmi: 40, minPctOfAffordable: 40 },
      { maxAmi: 50, minPctOfAffordable: 20 },
    ],
  },
  {
    name: 'Option 4 (Workforce)',
    setAsidePct: 0.30,
    avgAmi: 115,
    bands: [
      { maxAmi: 80, minPctOfAffordable: 20 },
      { maxAmi: 115, minPctOfAffordable: 50 },
      { maxAmi: 130, minPctOfAffordable: 30 },
    ],
  },
];

export function evaluateMih(capacity: CapacityResult): ProgramEvaluation {
  const gaps: string[] = [];
  const notes: string[] = [
    'MIH applies only in MIH-designated areas (zoning map overlay required for confirmation).',
    'Per ZR 23-154 / 23-90 (ZTIA), MIH options are selected at time of zoning certification.',
  ];

  if (!capacity.zoneAllowsResidential) {
    gaps.push('Zoning does not appear to allow residential use');
  }
  if (capacity.newResFa <= 0) {
    gaps.push('No new residential floor area available under current FAR');
  }

  const totalProjectedUnits = calcTotalProjectedUnits(capacity.maxResFa, capacity.duFactor);

  const options: ProgramOption[] = MIH_OPTIONS.map((def) => {
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
      benefitYears: null,
      constructionPeriodYears: null,
      registrationDeadline: null,
      details: {
        totalNewResFa: capacity.maxResFa,
        totalProjectedUnits,
        marketRateFloorArea: capacity.maxResFa - afa,
        marketRateUnits: marketUnits,
      },
    };
  });

  const eligible = gaps.length > 0 ? 'no' : 'needs_verification' as const;

  return {
    program: 'MIH',
    eligible,
    applicableOption: eligible !== 'no' ? options[0] ?? null : null,
    options,
    gaps,
    notes,
    missingData: [],
    citations: [{ source: 'PLUTO', field: 'ResidFAR' }, { source: 'PLUTO', field: 'ZoneDist1' }],
  };
}

export function applyMihOverlay(
  base: ProgramEvaluation,
  overlay: MihEligibilityResult
): ProgramEvaluation {
  if (overlay.status === 'unavailable') {
    return {
      ...base,
      eligible: base.eligible === 'no' ? 'no' : 'unknown',
      missingData: ['MIH map layer could not be loaded'],
    };
  }

  if (overlay.status === 'needs_verification') {
    return {
      ...base,
      eligible: base.eligible === 'no' ? 'no' : 'needs_verification',
      missingData: [],
      notes: [
        ...base.notes.filter((n) => !n.includes('zoning map overlay')),
        ...(overlay.notes || []),
      ],
    };
  }

  if (overlay.status === 'not_eligible') {
    return {
      ...base,
      eligible: 'no',
      applicableOption: null,
      gaps: [...base.gaps, 'Property is not within an MIH-designated area'],
      missingData: [],
      notes: base.notes.filter((n) => !n.includes('zoning map overlay')),
    };
  }

  if (base.gaps.some((g) => g.includes('Zoning') || g.includes('floor area'))) {
    return {
      ...base,
      missingData: [],
      notes: [
        ...base.notes.filter((n) => !n.includes('zoning map overlay')),
        overlay.derived.areaName
          ? `Located in MIH area: ${overlay.derived.areaName}`
          : 'Located in an MIH-designated area',
      ],
    };
  }

  const extraNotes: string[] = [];
  if (overlay.derived.areaName) {
    extraNotes.push(`MIH area: ${overlay.derived.areaName}`);
  }
  if (overlay.derived.option) {
    extraNotes.push(`MIH option from dataset: ${overlay.derived.option}`);
  }
  if (overlay.notes?.length) {
    extraNotes.push(...overlay.notes);
  }

  return {
    ...base,
    eligible: 'yes',
    missingData: [],
    notes: [
      ...base.notes.filter((n) => !n.includes('zoning map overlay')),
      ...extraNotes,
    ],
    citations: [
      ...base.citations,
      { source: 'NYC Open Data MIH Layer', field: 'bw8v-wzdr' },
    ],
  };
}
