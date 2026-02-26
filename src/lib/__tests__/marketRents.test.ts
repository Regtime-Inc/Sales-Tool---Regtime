import { describe, it, expect } from 'vitest';
import {
  getBoroughName,
  estimatesToRents,
  estimatesToUnitTypes,
} from '../marketRents';
import type { MarketEstimate } from '../marketRents';

const BRONX_ESTIMATES: MarketEstimate[] = [
  { unitType: 'Studio', monthlyRent: 1600, avgSf: 400 },
  { unitType: '1BR', monthlyRent: 1900, avgSf: 600 },
  { unitType: '2BR', monthlyRent: 2300, avgSf: 850 },
  { unitType: '3BR', monthlyRent: 2700, avgSf: 1100 },
];

describe('getBoroughName', () => {
  it('returns Manhattan for code 1', () => {
    expect(getBoroughName('1')).toBe('Manhattan');
  });
  it('returns Bronx for code 2', () => {
    expect(getBoroughName('2')).toBe('Bronx');
  });
  it('returns Brooklyn for code 3', () => {
    expect(getBoroughName('3')).toBe('Brooklyn');
  });
  it('returns Queens for code 4', () => {
    expect(getBoroughName('4')).toBe('Queens');
  });
  it('returns Staten Island for code 5', () => {
    expect(getBoroughName('5')).toBe('Staten Island');
  });
  it('returns Unknown for unrecognized code', () => {
    expect(getBoroughName('9')).toBe('Unknown');
  });
});

describe('estimatesToRents', () => {
  it('converts estimates to rent record', () => {
    const rents = estimatesToRents(BRONX_ESTIMATES);
    expect(rents['Studio']).toBe(1600);
    expect(rents['1BR']).toBe(1900);
    expect(rents['2BR']).toBe(2300);
    expect(rents['3BR']).toBe(2700);
  });
});

describe('estimatesToUnitTypes', () => {
  it('creates unit type configs from estimates', () => {
    const types = estimatesToUnitTypes(BRONX_ESTIMATES);
    expect(types).toHaveLength(4);

    const studio = types.find((t) => t.type === 'Studio');
    expect(studio).toBeDefined();
    expect(studio!.minSF).toBeLessThan(studio!.maxSF);
    expect(Math.round((studio!.minSF + studio!.maxSF) / 2)).toBe(400);

    const twoBR = types.find((t) => t.type === '2BR');
    expect(twoBR).toBeDefined();
    expect(Math.round((twoBR!.minSF + twoBR!.maxSF) / 2)).toBe(850);
  });

  it('unit types are ordered Studio, 1BR, 2BR, 3BR', () => {
    const types = estimatesToUnitTypes(BRONX_ESTIMATES);
    expect(types[0].type).toBe('Studio');
    expect(types[1].type).toBe('1BR');
    expect(types[2].type).toBe('2BR');
    expect(types[3].type).toBe('3BR');
  });
});
