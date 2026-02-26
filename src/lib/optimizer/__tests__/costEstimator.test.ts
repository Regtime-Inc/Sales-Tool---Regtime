import { describe, it, expect } from 'vitest';
import { estimateHardCost, estimateLandCost } from '../costEstimator';
import type { CostEstimatorInput } from '../costEstimator';

function makeInput(overrides: Partial<CostEstimatorInput> = {}): CostEstimatorInput {
  return {
    bldgClass: 'C0',
    zoneDist: 'R6',
    numFloors: 4,
    borough: '2',
    yearBuilt: 1980,
    landUse: '02',
    lotArea: 5000,
    ...overrides,
  };
}

describe('estimateHardCost', () => {
  it('Bronx R6 multifamily: ~$350/SF base', () => {
    const result = estimateHardCost(makeInput());
    expect(result.tier).toBe('Multi-family Residential');
    expect(result.estimatedHardCostPerSF).toBeGreaterThanOrEqual(325);
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(425);
  });

  it('Manhattan R10 high-rise luxury: elevated cost', () => {
    const result = estimateHardCost(makeInput({
      zoneDist: 'R10',
      borough: '1',
      numFloors: 20,
      bldgClass: 'R0',
      lotArea: 10000,
    }));
    expect(result.estimatedHardCostPerSF).toBeGreaterThanOrEqual(650);
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(1500);
    expect(result.tier).toBe('Luxury Residential');
  });

  it('Brooklyn mixed-use M1/R8A with 8 floors', () => {
    const result = estimateHardCost(makeInput({
      zoneDist: 'M1-6/R8A',
      numFloors: 8,
      bldgClass: 'D0',
      landUse: '03',
      borough: '3',
    }));
    expect(result.estimatedHardCostPerSF).toBeGreaterThanOrEqual(400);
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(600);
  });

  it('Queens C4-2 commercial 3 floors', () => {
    const result = estimateHardCost(makeInput({
      zoneDist: 'C4-2',
      numFloors: 3,
      bldgClass: 'O4',
      landUse: '05',
      borough: '4',
    }));
    expect(result.estimatedHardCostPerSF).toBeGreaterThanOrEqual(275);
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(400);
  });

  it('pre-war conversion adds adjustment', () => {
    const result = estimateHardCost(makeInput({ yearBuilt: 1920 }));
    expect(result.adjustments.some((a) => a.includes('Pre-war'))).toBe(true);
    expect(result.estimatedHardCostPerSF).toBeGreaterThan(350);
  });

  it('small lot adds logistics penalty', () => {
    const result = estimateHardCost(makeInput({ lotArea: 2000 }));
    expect(result.adjustments.some((a) => a.includes('Small lot'))).toBe(true);
  });

  it('high-rise > 7 floors adds premium', () => {
    const result = estimateHardCost(makeInput({ numFloors: 12 }));
    expect(result.adjustments.some((a) => a.includes('High-rise'))).toBe(true);
  });

  it('supertall > 30 floors adds largest premium', () => {
    const result = estimateHardCost(makeInput({ numFloors: 35 }));
    expect(result.adjustments.some((a) => a.includes('Supertall'))).toBe(true);
  });

  it('caps standard tier at $1000/SF', () => {
    const result = estimateHardCost(makeInput({
      numFloors: 35,
      borough: '1',
      yearBuilt: 1920,
      lotArea: 1500,
    }));
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(1000);
  });

  it('caps luxury tier at $1500/SF', () => {
    const result = estimateHardCost(makeInput({
      bldgClass: 'R0',
      zoneDist: 'R10',
      numFloors: 40,
      borough: '1',
      yearBuilt: 1920,
      lotArea: 1500,
    }));
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(1500);
  });

  it('low-density residential gets standard tier', () => {
    const result = estimateHardCost(makeInput({
      zoneDist: 'R3-2',
      bldgClass: 'A5',
      landUse: '01',
      numFloors: 2,
    }));
    expect(result.tier).toBe('Standard Residential');
    expect(result.estimatedHardCostPerSF).toBeGreaterThanOrEqual(300);
    expect(result.estimatedHardCostPerSF).toBeLessThanOrEqual(400);
  });
});

describe('estimateLandCost', () => {
  it('uses ppbsf when available', () => {
    const result = estimateLandCost(1000000, 50000, 85);
    expect(result.landCostPerSF).toBe(85);
    expect(result.source).toContain('ACRIS');
  });

  it('derives from sale amount / buildable SF as fallback', () => {
    const result = estimateLandCost(1000000, 50000, null);
    expect(result.landCostPerSF).toBe(20);
    expect(result.source).toContain('Derived');
  });

  it('returns default when no sale data', () => {
    const result = estimateLandCost(null, null, null);
    expect(result.landCostPerSF).toBe(150);
    expect(result.source).toContain('Default');
  });

  it('returns default when sale amount is zero', () => {
    const result = estimateLandCost(0, 50000, null);
    expect(result.landCostPerSF).toBe(150);
    expect(result.source).toContain('Default');
  });
});
