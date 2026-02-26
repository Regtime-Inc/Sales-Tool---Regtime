export interface TaxRateSchedule {
  taxClass: 1 | 2 | 3 | 4;
  ratePerDollar: number;
  description: string;
  taxYear: number;
}

export interface ExemptionScheduleEntry {
  year: number;
  exemptionPct: number;
  abatementPct: number;
}

export interface IncentiveSchedule {
  program: string;
  option: string;
  label: string;
  entries: ExemptionScheduleEntry[];
}

export interface AnnualTaxRow {
  year: number;
  assessedValue: number;
  taxableValue: number;
  exemptionAmount: number;
  grossTax: number;
  abatementCredit: number;
  netTax: number;
}

export interface TaxScenario {
  program: string;
  option: string;
  label: string;
  illustrative: true;
  rows: AnnualTaxRow[];
  totalSavings: number;
  realSavings: number;
  savingsPct: number;
  reason?: string;
}

export interface AVEstimateInfo {
  estimatedNewAV: number;
  marketValueEstimate: number;
  avPerGsf: number;
  methodUsed: string;
  confidence: 'HIGH' | 'MED' | 'LOW';
  reasoning: string;
  borough: string;
  proposedGSF: number;
  assessmentRatio: number;
}

export interface TaxProjections {
  taxClass: number;
  taxRate: number;
  taxYear: number;
  estimatedAssessedValue: number;
  avEstimate?: AVEstimateInfo;
  assessmentGrowthRate: number;
  baseline: AnnualTaxRow[];
  baselineWithGrowth: AnnualTaxRow[];
  noExemptionTotalTax: number;
  scenarios: TaxScenario[];
  disclaimer: string;
}
