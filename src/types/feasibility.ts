export interface CapacityInput {
  lotArea: number;
  existingBldgArea: number;
  residFar: number;
  commFar: number;
  facilFar: number;
  builtFar: number;
  zoneDist: string;
  landUse: string;
  unitsRes: number;
  numFloors: number;
  yearBuilt: number;
}

export interface CapacityResult {
  maxResFa: number;
  maxBuildableSf: number;
  existingBldgArea: number;
  buildableSlackSf: number;
  newResFa: number;
  isVacant: boolean;
  zoneAllowsResidential: boolean;
  duFactor: number;
  qualifyingAffordableFar: number | null;
  qualifyingAffordableFa: number | null;
  zoningSource: 'table' | 'pluto';
}

export interface AmiBand {
  maxAmi: number;
  minPctOfAffordable: number;
  floorArea: number;
  units: number;
}

export interface ProgramOption {
  name: string;
  affordableSetAsidePct: number;
  affordableFloorArea: number;
  affordableUnits: number;
  avgAmi: number;
  amiBands: AmiBand[];
  benefitYears: number | null;
  constructionPeriodYears: number | null;
  registrationDeadline: string | null;
  details: Record<string, string | number | boolean>;
}

export interface ProgramCitation {
  source: string;
  field: string;
}

export interface ProgramEvaluation {
  program: string;
  eligible: 'yes' | 'no' | 'needs_verification' | 'unknown';
  applicableOption: ProgramOption | null;
  options: ProgramOption[];
  gaps: string[];
  notes: string[];
  missingData: string[];
  citations: ProgramCitation[];
}

export interface FeasibilityResult {
  capacity: CapacityResult;
  programs: ProgramEvaluation[];
  stackingConflicts: string[];
}
