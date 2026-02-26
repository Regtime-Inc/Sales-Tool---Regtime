import { describe, it, expect } from 'vitest';
import { buildBbl, parseBbl, resolveBoroughCode } from '../bblBuilder';

describe('buildBbl', () => {
  it('builds a 10-digit BBL from numeric borough, block, and lot', () => {
    expect(buildBbl(1, '00100', '0001')).toBe('1001000001');
  });

  it('zero-pads block to 5 digits and lot to 4 digits', () => {
    expect(buildBbl(3, '42', '7')).toBe('3000420007');
  });

  it('accepts string borough', () => {
    expect(buildBbl('2', '1234', '56')).toBe('2012340056');
  });

  it('handles max-length block and lot without extra padding', () => {
    expect(buildBbl(4, '99999', '9999')).toBe('4999999999');
  });

  it('returns empty string for invalid borough 0', () => {
    expect(buildBbl(0, '100', '1')).toBe('');
  });

  it('returns empty string for invalid borough 6', () => {
    expect(buildBbl(6, '100', '1')).toBe('');
  });

  it('returns empty string for non-numeric block', () => {
    expect(buildBbl(1, 'abc', '1')).toBe('');
  });

  it('returns empty string for non-numeric lot', () => {
    expect(buildBbl(1, '100', 'xyz')).toBe('');
  });
});

describe('parseBbl', () => {
  it('parses a valid 10-digit BBL', () => {
    expect(parseBbl('3000420007')).toEqual({
      borough: '3',
      block: '00042',
      lot: '0007',
    });
  });

  it('returns null for short input that pads to invalid borough 0', () => {
    expect(parseBbl('1234567')).toBeNull();
  });

  it('parses input with leading valid borough digit', () => {
    expect(parseBbl('2012340056')).toEqual({
      borough: '2',
      block: '01234',
      lot: '0056',
    });
  });

  it('returns null for borough 0', () => {
    expect(parseBbl('0001000001')).toBeNull();
  });

  it('returns null for borough > 5', () => {
    expect(parseBbl('6001000001')).toBeNull();
  });

  it('strips non-digit characters', () => {
    expect(parseBbl('1-00100-0001')).toEqual({
      borough: '1',
      block: '00100',
      lot: '0001',
    });
  });
});

describe('resolveBoroughCode', () => {
  it('returns numeric code as-is', () => {
    expect(resolveBoroughCode('3')).toBe('3');
  });

  it('resolves BK to 3', () => {
    expect(resolveBoroughCode('BK')).toBe('3');
  });

  it('resolves case-insensitively', () => {
    expect(resolveBoroughCode('manhattan')).toBe('1');
    expect(resolveBoroughCode('BRONX')).toBe('2');
    expect(resolveBoroughCode('qn')).toBe('4');
    expect(resolveBoroughCode('si')).toBe('5');
  });

  it('returns null for unknown input', () => {
    expect(resolveBoroughCode('NJ')).toBeNull();
    expect(resolveBoroughCode('')).toBeNull();
  });
});
