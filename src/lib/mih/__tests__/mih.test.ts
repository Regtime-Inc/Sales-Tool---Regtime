import { describe, it, expect } from 'vitest';
import { applyMihOverlay } from '../../feasibility/mih';
import { evaluateMih } from '../../feasibility/mih';
import { computeCapacity } from '../../feasibility/capacity';
import type { MihEligibilityResult } from '../types';
import type { CapacityInput } from '../../../types/feasibility';

function makeInput(overrides: Partial<CapacityInput> = {}): CapacityInput {
  return {
    lotArea: 10000,
    existingBldgArea: 5000,
    residFar: 6.0,
    commFar: 4.0,
    facilFar: 2.0,
    builtFar: 0.5,
    zoneDist: 'R8',
    landUse: '01',
    unitsRes: 10,
    numFloors: 2,
    yearBuilt: 1940,
    ...overrides,
  };
}

function makeMihResult(overrides: Partial<MihEligibilityResult> = {}): MihEligibilityResult {
  return {
    status: 'eligible',
    eligible: true,
    derived: { option: 'Option 1', areaName: 'East New York' },
    source: { name: 'NYC Open Data - MIH', datasetId: 'bw8v-wzdr', fetchedAtISO: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
}

describe('applyMihOverlay', () => {
  it('upgrades needs_verification to yes when overlay is eligible', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    expect(base.eligible).toBe('needs_verification');

    const result = applyMihOverlay(base, makeMihResult({ status: 'eligible' }));
    expect(result.eligible).toBe('yes');
    expect(result.missingData).toEqual([]);
  });

  it('includes area name and option in notes when eligible', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const overlay = makeMihResult({
      status: 'eligible',
      derived: { areaName: 'East Harlem', option: 'Option 2' },
    });
    const result = applyMihOverlay(base, overlay);
    expect(result.notes.some((n) => n.includes('East Harlem'))).toBe(true);
    expect(result.notes.some((n) => n.includes('Option 2'))).toBe(true);
  });

  it('downgrades to no when overlay is not_eligible', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const result = applyMihOverlay(base, makeMihResult({ status: 'not_eligible', eligible: false }));
    expect(result.eligible).toBe('no');
    expect(result.applicableOption).toBeNull();
    expect(result.gaps.some((g) => g.includes('not within'))).toBe(true);
  });

  it('sets unknown when overlay is unavailable', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const result = applyMihOverlay(base, makeMihResult({ status: 'unavailable', eligible: false }));
    expect(result.eligible).toBe('unknown');
    expect(result.missingData).toEqual(['MIH map layer could not be loaded']);
  });

  it('keeps no when base is no and overlay is unavailable', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'M3-1' }));
    const base = evaluateMih(cap);
    expect(base.eligible).toBe('no');

    const result = applyMihOverlay(base, makeMihResult({ status: 'unavailable', eligible: false }));
    expect(result.eligible).toBe('no');
  });

  it('adds citation for MIH layer when eligible', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const result = applyMihOverlay(base, makeMihResult({ status: 'eligible' }));
    expect(result.citations.some((c) => c.source.includes('MIH Layer'))).toBe(true);
  });

  it('removes zoning overlay note when eligible', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    expect(base.notes.some((n) => n.includes('zoning map overlay'))).toBe(true);

    const result = applyMihOverlay(base, makeMihResult({ status: 'eligible' }));
    expect(result.notes.some((n) => n.includes('zoning map overlay'))).toBe(false);
  });

  it('preserves options from base evaluation', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const result = applyMihOverlay(base, makeMihResult({ status: 'eligible' }));
    expect(result.options.length).toBe(4);
    expect(result.options[0].name).toBe('Option 1');
  });

  it('preserves needs_verification when overlay is needs_verification', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    expect(base.eligible).toBe('needs_verification');

    const result = applyMihOverlay(base, makeMihResult({
      status: 'needs_verification',
      eligible: false,
      notes: ['Zoning district C4-4D has suffix typically associated with MIH rezonings; manual confirmation recommended'],
    }));
    expect(result.eligible).toBe('needs_verification');
    expect(result.notes.some((n) => n.includes('C4-4D'))).toBe(true);
  });

  it('keeps no when base is no and overlay is needs_verification', () => {
    const cap = computeCapacity(makeInput({ zoneDist: 'M3-1' }));
    const base = evaluateMih(cap);
    expect(base.eligible).toBe('no');

    const result = applyMihOverlay(base, makeMihResult({ status: 'needs_verification', eligible: false }));
    expect(result.eligible).toBe('no');
  });

  it('includes buffer match notes when eligible via proximity', () => {
    const cap = computeCapacity(makeInput());
    const base = evaluateMih(cap);
    const result = applyMihOverlay(base, makeMihResult({
      status: 'eligible',
      bufferMatch: true,
      notes: ['Matched via proximity buffer (~30m); confirm with official zoning map'],
    }));
    expect(result.eligible).toBe('yes');
    expect(result.notes.some((n) => n.includes('proximity buffer'))).toBe(true);
  });
});
