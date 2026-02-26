export interface PlutoData {
  zonedist1: string;
  landuse: string;
  lotarea: number;
  bldgarea: number;
  builtfar: number;
  residfar: number;
  commfar: number;
  facilfar: number;
  numfloors: number;
  unitsres: number;
  unitstotal: number;
  yearbuilt: number;
  ownername: string;
  bldgclass: string;
}

export interface Metrics {
  builtFarCalc: number;
  maxAllowableFar: number;
  maxBuildableSf: number;
  buildableSlackSf: number;
  underbuiltRatio: number;
  ppsf: number | null;
  ppbsf: number | null;
}

export interface SaleData {
  source: 'acris' | 'rolling_sales';
  documentId?: string;
  docType: string;
  documentDate: string;
  amount: number;
  buyer: string;
  seller: string;
  remarks: string[];
}

export interface DobFiling {
  source: 'dob_bis' | 'dob_now';
  jobNumber: string;
  jobType: string;
  jobDescription: string;
  filingDate: string;
  status: string;
  existingStories: number | null;
  proposedStories: number | null;
  applicantName: string | null;
  applicantTitle: string | null;
  applicantLicense: string | null;
  applicantBusinessName: string | null;
  ownerName: string | null;
  ownerBusinessName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerAddress: string | null;
  ownerContactSource: 'dobnow_payload' | 'dobnow_manual_import' | null;
  filingRepName: string | null;
  filingRepBusinessName: string | null;
  filingRepAddress: string | null;
  initialCost: number | null;
  existingDwellingUnits: number | null;
  proposedDwellingUnits: number | null;
  approvedDate: string | null;
  permittedDate: string | null;
  signoffDate: string | null;
  bin: string | null;
}

export interface DobPermit {
  jobNumber: string;
  workType: string;
  permitStatus: string;
  permitType: string;
  filingDate: string;
  issuanceDate: string | null;
  expirationDate: string | null;
  jobStartDate: string | null;
  permitteeName: string | null;
  permitteeBusinessName: string | null;
  permitteePhone: string | null;
  permitteeLicenseType: string | null;
  permitteeLicenseNumber: string | null;
  ownerName: string | null;
  ownerBusinessName: string | null;
  ownerPhone: string | null;
  ownerAddress: string | null;
  jobDescription: string | null;
  estimatedCost: number | null;
  bin: string | null;
}

export interface BisWebFiling {
  jobNumber: string;
  jobType: string;
  jobStatus: string;
  applicantName: string | null;
  applicantLicenseType: string | null;
  applicantLicenseNumber: string | null;
  filingRepName: string | null;
  filingRepBusinessName: string | null;
  ownerName: string | null;
  ownerBusinessName: string | null;
  filingDate: string | null;
  expirationDate: string | null;
  jobDescription: string | null;
  existingStories: number | null;
  proposedStories: number | null;
  existingDwellingUnits: number | null;
  proposedDwellingUnits: number | null;
  bin: string | null;
}

export interface HpdContact {
  type: string;
  contactDescription: string;
  corporationName: string;
  firstName: string;
  lastName: string;
  businessAddress: string;
}

export interface HpdRegistration {
  registrationId: string;
  buildingId: string;
  boro: string;
  houseNumber: string;
  streetName: string;
  zip: string;
  bin: string;
  communityBoard: string;
  lastRegistrationDate: string;
  registrationEndDate: string;
  contacts: HpdContact[];
}

export interface Flags {
  is485x: boolean;
  isUap: boolean;
  isMih: boolean;
  is421a: boolean;
  is467m: boolean;
  is485xEvidence: string[];
  uapEvidence: string[];
  mihEvidence: string[];
  evidence421a: string[];
  evidence467m: string[];
}

export interface ScoreBreakdown {
  category: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface Scoring {
  devScore: number;
  rentalOverlay: number;
  totalScore: number;
  classification: 'Low' | 'Moderate' | 'High' | 'Very High';
  breakdown: ScoreBreakdown[];
}

export interface TraceEntry {
  step: string;
  status: 'success' | 'warning' | 'error';
  detail: string;
  timestamp: string;
}

export interface AnalysisResult {
  bbl: string;
  address: string | null;
  borough: string;
  block: string;
  lot: string;
  latitude: number | null;
  longitude: number | null;
  pluto: PlutoData | null;
  metrics: Metrics | null;
  recentSale: SaleData | null;
  secondarySale?: SaleData | null;
  dobFilings: DobFiling[];
  dobPermits: DobPermit[];
  bisWebFilings: BisWebFiling[];
  hpdRegistrations: HpdRegistration[];
  flags: Flags;
  scoring: Scoring;
  feasibility: import('../types/feasibility').FeasibilityResult | null;
  taxProjections: import('../types/tax').TaxProjections | null;
  stakeholders?: import('../types/stakeholders').StakeholderRecord[];
  summary: string;
  trace: TraceEntry[];
  nextActions: string[];
  analyzedAt: string;
}

export interface AnalysisError {
  error: string;
  trace?: TraceEntry[];
}
