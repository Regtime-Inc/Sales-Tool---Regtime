import { describe, it, expect } from 'vitest';
import { computeBaselineTax, computeBaselineRow, computeScenarioRow, computeTaxProjections, computeGrowthBaselineRow, DEFAULT_ASSESSMENT_GROWTH_RATE } from '../projections';
import { getTaxRate, inferTaxClass, estimateAssessedValue } from '../rates';

describe('getTaxRate', () => {
  it('returns class 2 rate for multi-family', () => {
    const r = getTaxRate(2);
    expect(r.taxClass).toBe(2);
    expect(r.ratePerDollar).toBe(0.12439);
  });

  it('returns class 1 rate for small residential', () => {
    const r = getTaxRate(1);
    expect(r.ratePerDollar).toBe(0.19963);
  });

  it('defaults to class 2 for unknown class', () => {
    const r = getTaxRate(99);
    expect(r.taxClass).toBe(2);
  });
});

describe('inferTaxClass', () => {
  it('class 1 for A-prefix building codes', () => {
    expect(inferTaxClass('A5', 2)).toBe(1);
  });

  it('class 2 for 4+ residential units', () => {
    expect(inferTaxClass('', 10)).toBe(2);
  });

  it('class 4 for O-prefix (office)', () => {
    expect(inferTaxClass('O4', 0)).toBe(4);
  });

  it('class 3 for utility', () => {
    expect(inferTaxClass('U0', 0)).toBe(3);
  });
});

describe('estimateAssessedValue', () => {
  it('computes at $15/SF for total area', () => {
    expect(estimateAssessedValue(10000, 5000, 55000)).toBe(900000);
  });

  it('returns 0 for zero area', () => {
    expect(estimateAssessedValue(0, 0, 0)).toBe(0);
  });
});

describe('computeBaselineTax', () => {
  it('is assessedValue * taxRate', () => {
    const av = 900000;
    const rate = 0.12267;
    const expected = Math.round(av * rate * 100) / 100;
    expect(computeBaselineTax(av, rate)).toBe(expected);
  });

  it('returns 0 for zero assessed value', () => {
    expect(computeBaselineTax(0, 0.12267)).toBe(0);
  });
});

describe('computeBaselineRow', () => {
  it('has no exemptions or abatements', () => {
    const row = computeBaselineRow(1, 900000, 0.12267);
    expect(row.exemptionAmount).toBe(0);
    expect(row.abatementCredit).toBe(0);
    expect(row.taxableValue).toBe(900000);
    expect(row.netTax).toBe(row.grossTax);
  });
});

describe('computeScenarioRow', () => {
  it('applies exemption to reduce taxable value', () => {
    const row = computeScenarioRow(1, 900000, 0.12267, 100, 0);
    expect(row.exemptionAmount).toBe(900000);
    expect(row.taxableValue).toBe(0);
    expect(row.grossTax).toBe(0);
    expect(row.netTax).toBe(0);
  });

  it('partial exemption reduces proportionally', () => {
    const row = computeScenarioRow(1, 900000, 0.12267, 50, 0);
    expect(row.exemptionAmount).toBe(450000);
    expect(row.taxableValue).toBe(450000);
    expect(row.grossTax).toBeGreaterThan(0);
    expect(row.netTax).toBe(row.grossTax);
  });

  it('abatement reduces net tax but cannot go below zero', () => {
    const row = computeScenarioRow(1, 900000, 0.12267, 0, 100);
    expect(row.grossTax).toBeGreaterThan(0);
    expect(row.abatementCredit).toBe(row.grossTax);
    expect(row.netTax).toBe(0);
  });

  it('abatement cannot make net tax negative', () => {
    const row = computeScenarioRow(1, 100, 0.12267, 0, 150);
    expect(row.netTax).toBeGreaterThanOrEqual(0);
  });

  it('exemption cannot make taxable value negative', () => {
    const row = computeScenarioRow(1, 100, 0.12267, 200, 0);
    expect(row.taxableValue).toBeGreaterThanOrEqual(0);
    expect(row.netTax).toBeGreaterThanOrEqual(0);
  });

  it('combined exemption + abatement still floors at zero', () => {
    const row = computeScenarioRow(1, 900000, 0.12267, 80, 50);
    expect(row.netTax).toBeGreaterThanOrEqual(0);
    const expectedTv = Math.max(900000 - 900000 * 0.8, 0);
    expect(row.taxableValue).toBe(expectedTv);
  });
});

describe('computeTaxProjections', () => {
  it('returns projections with baseline and scenarios', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x', '421-a', '467-m']);
    expect(result).not.toBeNull();
    expect(result!.baseline.length).toBe(40);
    expect(result!.scenarios.length).toBeGreaterThan(0);
    expect(result!.taxClass).toBe(2);
  });

  it('baseline rows all have same net tax', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    const first = result!.baseline[0].netTax;
    for (const row of result!.baseline) {
      expect(row.netTax).toBe(first);
    }
  });

  it('scenario net taxes are always >= 0', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x', '421-a', '467-m']);
    for (const scenario of result!.scenarios) {
      for (const row of scenario.rows) {
        expect(row.netTax).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('scenario total savings are positive', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    for (const scenario of result!.scenarios) {
      expect(scenario.totalSavings).toBeGreaterThan(0);
    }
  });

  it('filters scenarios by eligible programs', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    for (const s of result!.scenarios) {
      expect(s.program).toBe('485-x');
    }
  });

  it('includes disclaimer', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    expect(result!.disclaimer).toContain('illustrative');
  });

  it('includes growth baseline with compounding', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    expect(result.baselineWithGrowth.length).toBe(40);
    expect(result.baselineWithGrowth[0].assessedValue).toBe(result.estimatedAssessedValue);
    expect(result.baselineWithGrowth[39].assessedValue).toBeGreaterThan(result.estimatedAssessedValue);
  });

  it('noExemptionTotalTax equals sum of growth baseline rows', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    const sum = Math.round(result.baselineWithGrowth.reduce((s, r) => s + r.netTax, 0) * 100) / 100;
    expect(result.noExemptionTotalTax).toBe(sum);
  });

  it('scenarios include realSavings and savingsPct', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    for (const s of result.scenarios) {
      expect(s.realSavings).toBeGreaterThan(0);
      expect(s.savingsPct).toBeGreaterThan(0);
      expect(s.savingsPct).toBeLessThanOrEqual(100);
    }
  });

  it('realSavings >= totalSavings since growth baseline is higher', () => {
    const result = computeTaxProjections('D4', 10, 10000, 5000, 55000, ['485-x']);
    for (const s of result.scenarios) {
      expect(s.realSavings).toBeGreaterThanOrEqual(s.totalSavings);
    }
  });
});

describe('computeGrowthBaselineRow', () => {
  it('year 1 has the initial assessed value', () => {
    const row = computeGrowthBaselineRow(1, 900000, 0.12267, 0.02);
    expect(row.assessedValue).toBe(900000);
  });

  it('compounds correctly over years', () => {
    const row10 = computeGrowthBaselineRow(10, 900000, 0.12267, 0.02);
    const expected = Math.round(900000 * Math.pow(1.02, 9));
    expect(row10.assessedValue).toBe(expected);
  });

  it('grossTax uses compounded assessed value', () => {
    const row = computeGrowthBaselineRow(5, 900000, 0.12267, 0.02);
    const expectedAV = Math.round(900000 * Math.pow(1.02, 4));
    const expectedTax = Math.round(expectedAV * 0.12267 * 100) / 100;
    expect(row.grossTax).toBe(expectedTax);
    expect(row.netTax).toBe(expectedTax);
  });

  it('zero growth rate produces flat baseline', () => {
    const row1 = computeGrowthBaselineRow(1, 900000, 0.12267, 0);
    const row10 = computeGrowthBaselineRow(10, 900000, 0.12267, 0);
    expect(row1.assessedValue).toBe(row10.assessedValue);
  });
});
