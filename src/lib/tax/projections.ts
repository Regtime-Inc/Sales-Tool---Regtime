import type { AnnualTaxRow, TaxScenario, TaxProjections, IncentiveSchedule } from '../../types/tax';
import { getTaxRate, inferTaxClass } from './rates';
import { estimateNewBuildAV } from './assessedValueEstimator';
import { ALL_SCHEDULES } from './schedules';

export const DEFAULT_ASSESSMENT_GROWTH_RATE = 0.02;

export function computeBaselineTax(assessedValue: number, taxRate: number): number {
  return Math.round(assessedValue * taxRate * 100) / 100;
}

export function computeBaselineRow(year: number, assessedValue: number, taxRate: number): AnnualTaxRow {
  const grossTax = computeBaselineTax(assessedValue, taxRate);
  return {
    year,
    assessedValue,
    taxableValue: assessedValue,
    exemptionAmount: 0,
    grossTax,
    abatementCredit: 0,
    netTax: grossTax,
  };
}

export function computeGrowthBaselineRow(
  year: number,
  initialAV: number,
  taxRate: number,
  growthRate: number
): AnnualTaxRow {
  const av = Math.round(initialAV * Math.pow(1 + growthRate, year - 1));
  const grossTax = Math.round(av * taxRate * 100) / 100;
  return {
    year,
    assessedValue: av,
    taxableValue: av,
    exemptionAmount: 0,
    grossTax,
    abatementCredit: 0,
    netTax: grossTax,
  };
}

export function computeScenarioRow(
  year: number,
  assessedValue: number,
  taxRate: number,
  exemptionPct: number,
  abatementPct: number
): AnnualTaxRow {
  const exemptionAmount = Math.round(assessedValue * (exemptionPct / 100) * 100) / 100;
  const taxableValue = Math.max(assessedValue - exemptionAmount, 0);
  const grossTax = Math.round(taxableValue * taxRate * 100) / 100;
  const abatementCredit = Math.round(grossTax * (abatementPct / 100) * 100) / 100;
  const netTax = Math.max(grossTax - abatementCredit, 0);

  return {
    year,
    assessedValue,
    taxableValue,
    exemptionAmount,
    grossTax,
    abatementCredit,
    netTax,
  };
}

export function projectScenario(
  schedule: IncentiveSchedule,
  assessedValue: number,
  taxRate: number,
  growthRate: number = DEFAULT_ASSESSMENT_GROWTH_RATE,
  reason?: string
): TaxScenario {
  const rows: AnnualTaxRow[] = schedule.entries.map((entry) =>
    computeScenarioRow(entry.year, assessedValue, taxRate, entry.exemptionPct, entry.abatementPct)
  );

  const baselineTotal = rows.reduce(
    (sum, _row) => sum + computeBaselineTax(assessedValue, taxRate),
    0
  );
  const scenarioTotal = rows.reduce((sum, row) => sum + row.netTax, 0);
  const totalSavings = Math.round((baselineTotal - scenarioTotal) * 100) / 100;

  const growthBaselineTotal = rows.reduce(
    (sum, row) => sum + computeGrowthBaselineRow(row.year, assessedValue, taxRate, growthRate).netTax,
    0
  );
  const realSavings = Math.round((growthBaselineTotal - scenarioTotal) * 100) / 100;
  const savingsPct = growthBaselineTotal > 0 ? Math.round((realSavings / growthBaselineTotal) * 10000) / 100 : 0;

  return {
    program: schedule.program,
    option: schedule.option,
    label: schedule.label,
    illustrative: true,
    rows,
    totalSavings,
    realSavings,
    savingsPct,
    reason,
  };
}

export function computeTaxProjections(
  bldgClass: string,
  unitsRes: number,
  lotArea: number,
  bldgArea: number,
  newResFa: number,
  eligiblePrograms: string[],
  borough?: string
): TaxProjections {
  const taxClassNum = inferTaxClass(bldgClass, unitsRes);
  const rateInfo = getTaxRate(taxClassNum);
  const projectionYears = 40;
  const growthRate = DEFAULT_ASSESSMENT_GROWTH_RATE;

  const avEstimate = estimateNewBuildAV(
    borough || '3',
    newResFa > 0 ? newResFa : bldgArea,
    lotArea,
    unitsRes
  );
  const assessedValue = avEstimate.estimatedNewAV > 0 ? avEstimate.estimatedNewAV : Math.round((bldgArea + newResFa) * 15);

  const baseline: AnnualTaxRow[] = Array.from({ length: projectionYears }, (_, i) =>
    computeBaselineRow(i + 1, assessedValue, rateInfo.ratePerDollar)
  );

  const baselineWithGrowth: AnnualTaxRow[] = Array.from({ length: projectionYears }, (_, i) =>
    computeGrowthBaselineRow(i + 1, assessedValue, rateInfo.ratePerDollar, growthRate)
  );

  const noExemptionTotalTax = Math.round(
    baselineWithGrowth.reduce((sum, row) => sum + row.netTax, 0) * 100
  ) / 100;

  const programFilter = new Set(eligiblePrograms.map((p) => p.toLowerCase()));

  const applicableSchedules = ALL_SCHEDULES.filter((s) =>
    programFilter.has(s.program.toLowerCase())
  );

  const scenarios: TaxScenario[] = applicableSchedules.map((schedule) =>
    projectScenario(schedule, assessedValue, rateInfo.ratePerDollar, growthRate)
  );

  return {
    taxClass: taxClassNum,
    taxRate: rateInfo.ratePerDollar,
    taxYear: rateInfo.taxYear,
    estimatedAssessedValue: assessedValue,
    avEstimate: {
      estimatedNewAV: avEstimate.estimatedNewAV,
      marketValueEstimate: avEstimate.marketValueEstimate,
      avPerGsf: avEstimate.avPerGsf,
      methodUsed: avEstimate.methodUsed,
      confidence: avEstimate.confidence,
      reasoning: avEstimate.reasoning,
      borough: avEstimate.borough,
      proposedGSF: avEstimate.proposedGSF,
      assessmentRatio: avEstimate.assessmentRatio,
    },
    assessmentGrowthRate: growthRate,
    baseline,
    baselineWithGrowth,
    noExemptionTotalTax,
    scenarios,
    disclaimer:
      'Tax projections are illustrative only. Actual assessed values, tax rates, and incentive schedules are determined by NYC DOF and may change annually. Consult a tax professional before making investment decisions.',
  };
}
