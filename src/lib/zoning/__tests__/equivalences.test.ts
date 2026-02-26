import { describe, it, expect } from 'vitest';
import {
  normalizeDistrict,
  getResidentialEquivalent,
  isUapEligibleDistrict,
  COMMERCIAL_TO_RES_EQUIV,
} from '../equivalences';

describe('normalizeDistrict', () => {
  it('uppercases and trims', () => {
    expect(normalizeDistrict(' r6a ')).toBe('R6A');
  });
  it('removes internal spaces', () => {
    expect(normalizeDistrict('C4 - 2')).toBe('C4-2');
  });
  it('handles empty', () => {
    expect(normalizeDistrict('')).toBe('');
  });
});

describe('getResidentialEquivalent', () => {
  it('returns residential districts as-is (normalized)', () => {
    expect(getResidentialEquivalent('r6')).toBe('R6');
    expect(getResidentialEquivalent('R7A')).toBe('R7A');
  });
  it('maps commercial districts via table', () => {
    expect(getResidentialEquivalent('C4-2')).toBe('R6');
    expect(getResidentialEquivalent('C6-3')).toBe('R9');
    expect(getResidentialEquivalent('C5-1A')).toBe('R10A');
  });
  it('returns null for unknown commercial districts', () => {
    expect(getResidentialEquivalent('C9-9')).toBeNull();
  });
  it('returns null for manufacturing districts', () => {
    expect(getResidentialEquivalent('M1-1')).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(getResidentialEquivalent('')).toBeNull();
  });
});

describe('isUapEligibleDistrict', () => {
  it('R6 and R6 suffixed districts are eligible', () => {
    expect(isUapEligibleDistrict('R6')).toBe(true);
    expect(isUapEligibleDistrict('R6A')).toBe(true);
    expect(isUapEligibleDistrict('R6B')).toBe(true);
  });
  it('R7-R12 are eligible', () => {
    expect(isUapEligibleDistrict('R7')).toBe(true);
    expect(isUapEligibleDistrict('R8A')).toBe(true);
    expect(isUapEligibleDistrict('R10')).toBe(true);
    expect(isUapEligibleDistrict('R12')).toBe(true);
  });
  it('R5 and below are not eligible', () => {
    expect(isUapEligibleDistrict('R5')).toBe(false);
    expect(isUapEligibleDistrict('R3')).toBe(false);
  });
  it('commercial districts mapped to R6+ are eligible', () => {
    expect(isUapEligibleDistrict('C4-2')).toBe(true);
    expect(isUapEligibleDistrict('C4-3')).toBe(true);
    expect(isUapEligibleDistrict('C6-1A')).toBe(true);
  });
  it('commercial districts mapped below R6 are not eligible', () => {
    expect(isUapEligibleDistrict('C4-1')).toBe(false);
    expect(isUapEligibleDistrict('C3')).toBe(false);
  });
  it('unknown zones are not eligible', () => {
    expect(isUapEligibleDistrict('M1-1')).toBe(false);
    expect(isUapEligibleDistrict('')).toBe(false);
  });
});

describe('COMMERCIAL_TO_RES_EQUIV completeness', () => {
  it('has all expected entries', () => {
    expect(Object.keys(COMMERCIAL_TO_RES_EQUIV).length).toBeGreaterThanOrEqual(55);
  });
  it('maps C6-9 to R10', () => {
    expect(COMMERCIAL_TO_RES_EQUIV['C6-9']).toBe('R10');
  });
});
