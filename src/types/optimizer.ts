export interface UnitTypeConfig {
  type: string;
  minSF: number;
  maxSF: number;
}

export interface RentAssumption {
  unitType: string;
  amiBand: number;
  monthlyRent: number;
}

export interface CostAssumptions {
  hardCostPerSF: number;
  softCostPct: number;
  landCostPerSF: number;
  hardCostSource?: string;
  landCostSource?: string;
}

export interface BedroomMixRule {
  min2BRPlusPct: number;
  distribution: Record<string, number>;
}

export interface ProgramConstraint {
  program: string;
  minAffordablePct: number;
  amiBands: number[];
  minPctByBand: Record<number, number>;
  bedroomMix?: BedroomMixRule;
  requiresProportionalBedrooms?: boolean;
  weightedAvgAmiMax?: number;
  unitMinSizes?: Record<string, number>;
  stackingConflicts?: string[];
}

export interface OptimizerInputs {
  netResidentialSF: number;
  totalUnits?: number;
  allowedUnitTypes: UnitTypeConfig[];
  rentAssumptions: RentAssumption[];
  costAssumptions: CostAssumptions;
  programConstraints: ProgramConstraint[];
}

export interface UnitAllocation {
  unitType: string;
  amiBand: number;
  count: number;
  avgSF: number;
  totalSF: number;
  monthlyRent: number;
  programTags?: string[];
}

export interface ConstraintSlack {
  constraint: string;
  required: number;
  actual: number;
  slack: number;
  binding: boolean;
}

export interface SensitivityRow {
  parameter: string;
  change: string;
  baseROI: number;
  newROI: number;
  roiDelta: number;
  stillFeasible: boolean;
}

export interface OptimizerResult {
  allocations: UnitAllocation[];
  constraintSlack: ConstraintSlack[];
  sensitivity: SensitivityRow[];
  totalUnits: number;
  affordableUnitCount: number;
  marketUnitCount: number;
  totalSF: number;
  totalMonthlyRent: number;
  blendedAmi: number;
  annualRevenue: number;
  totalDevelopmentCost: number;
  roiProxy: number;
  feasible: boolean;
  solverMethod: 'heuristic' | 'milp';
}

export const DEFAULT_UNIT_TYPES: UnitTypeConfig[] = [
  { type: 'Studio', minSF: 400, maxSF: 550 },
  { type: '1BR', minSF: 550, maxSF: 750 },
  { type: '2BR', minSF: 750, maxSF: 1050 },
  { type: '3BR', minSF: 1050, maxSF: 1350 },
];

export const DEFAULT_RENTS: RentAssumption[] = [
  { unitType: 'Studio', amiBand: 0, monthlyRent: 3200 },
  { unitType: '1BR', amiBand: 0, monthlyRent: 4100 },
  { unitType: '2BR', amiBand: 0, monthlyRent: 5500 },
  { unitType: '3BR', amiBand: 0, monthlyRent: 7200 },

  { unitType: 'Studio', amiBand: 30, monthlyRent: 850 },
  { unitType: '1BR', amiBand: 30, monthlyRent: 911 },
  { unitType: '2BR', amiBand: 30, monthlyRent: 1093 },
  { unitType: '3BR', amiBand: 30, monthlyRent: 1263 },

  { unitType: 'Studio', amiBand: 40, monthlyRent: 1134 },
  { unitType: '1BR', amiBand: 40, monthlyRent: 1215 },
  { unitType: '2BR', amiBand: 40, monthlyRent: 1458 },
  { unitType: '3BR', amiBand: 40, monthlyRent: 1685 },

  { unitType: 'Studio', amiBand: 50, monthlyRent: 1417 },
  { unitType: '1BR', amiBand: 50, monthlyRent: 1518 },
  { unitType: '2BR', amiBand: 50, monthlyRent: 1822 },
  { unitType: '3BR', amiBand: 50, monthlyRent: 2106 },

  { unitType: 'Studio', amiBand: 60, monthlyRent: 1701 },
  { unitType: '1BR', amiBand: 60, monthlyRent: 1822 },
  { unitType: '2BR', amiBand: 60, monthlyRent: 2187 },
  { unitType: '3BR', amiBand: 60, monthlyRent: 2527 },

  { unitType: 'Studio', amiBand: 70, monthlyRent: 1984 },
  { unitType: '1BR', amiBand: 70, monthlyRent: 2126 },
  { unitType: '2BR', amiBand: 70, monthlyRent: 2551 },
  { unitType: '3BR', amiBand: 70, monthlyRent: 2948 },

  { unitType: 'Studio', amiBand: 80, monthlyRent: 2268 },
  { unitType: '1BR', amiBand: 80, monthlyRent: 2430 },
  { unitType: '2BR', amiBand: 80, monthlyRent: 2916 },
  { unitType: '3BR', amiBand: 80, monthlyRent: 3370 },

  { unitType: 'Studio', amiBand: 100, monthlyRent: 2835 },
  { unitType: '1BR', amiBand: 100, monthlyRent: 3037 },
  { unitType: '2BR', amiBand: 100, monthlyRent: 3645 },
  { unitType: '3BR', amiBand: 100, monthlyRent: 4212 },

  { unitType: 'Studio', amiBand: 130, monthlyRent: 3685 },
  { unitType: '1BR', amiBand: 130, monthlyRent: 3948 },
  { unitType: '2BR', amiBand: 130, monthlyRent: 4738 },
  { unitType: '3BR', amiBand: 130, monthlyRent: 5476 },

  { unitType: 'Studio', amiBand: 165, monthlyRent: 4678 },
  { unitType: '1BR', amiBand: 165, monthlyRent: 5011 },
  { unitType: '2BR', amiBand: 165, monthlyRent: 6014 },
  { unitType: '3BR', amiBand: 165, monthlyRent: 6950 },
];

export const DEFAULT_COSTS: CostAssumptions = {
  hardCostPerSF: 350,
  softCostPct: 0.30,
  landCostPerSF: 150,
};

export type ScenarioSource = 'optimized' | 'imported' | 'manual';

export interface OptimizerScenario {
  id: string;
  name: string;
  source: ScenarioSource;
  result: OptimizerResult | null;
}
