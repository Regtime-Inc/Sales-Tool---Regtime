import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  stripEntitySuffixes,
  normalizePersonName,
  tokenSetSimilarity,
} from '../normalize';

describe('normalizeName', () => {
  it('uppercases, trims, and collapses whitespace', () => {
    expect(normalizeName('  ABC  OWNER  LLC ')).toBe('ABC OWNER LLC');
  });

  it('strips non-word non-space characters except comma, dot, hyphen', () => {
    expect(normalizeName('Smith & Jones (Prop)')).toBe('SMITH JONES PROP');
  });

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('');
  });
});

describe('stripEntitySuffixes', () => {
  it('removes LLC', () => {
    expect(stripEntitySuffixes('ABC OWNER LLC')).toBe('ABC OWNER');
  });

  it('removes PLLC', () => {
    expect(stripEntitySuffixes('SMITH PLLC')).toBe('SMITH');
  });

  it('removes INC', () => {
    expect(stripEntitySuffixes('MEGA BUILDERS INC')).toBe('MEGA BUILDERS');
  });

  it('removes multiple suffixes', () => {
    expect(stripEntitySuffixes('ABC LP LLC')).toBe('ABC');
  });

  it('leaves names without suffixes unchanged', () => {
    expect(stripEntitySuffixes('JOHN SMITH')).toBe('JOHN SMITH');
  });
});

describe('normalizePersonName', () => {
  it('converts LAST, FIRST format to FIRST LAST', () => {
    expect(normalizePersonName('SMITH, JOHN A')).toBe('JOHN A SMITH');
  });

  it('leaves non-comma format unchanged', () => {
    expect(normalizePersonName('JOHN SMITH')).toBe('JOHN SMITH');
  });

  it('handles single-part names', () => {
    expect(normalizePersonName('MADONNA')).toBe('MADONNA');
  });
});

describe('tokenSetSimilarity', () => {
  it('returns high similarity for matching names with different suffixes', () => {
    expect(tokenSetSimilarity('ABC HOLDINGS LLC', 'ABC HOLDINGS')).toBeGreaterThanOrEqual(0.80);
  });

  it('returns low similarity for completely different names', () => {
    expect(tokenSetSimilarity('ABC HOLDINGS', 'XYZ PARTNERS')).toBeLessThanOrEqual(0.30);
  });

  it('returns 1 for identical names', () => {
    expect(tokenSetSimilarity('JOHN SMITH', 'JOHN SMITH')).toBe(1);
  });

  it('returns 1 for both empty', () => {
    expect(tokenSetSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one side is empty', () => {
    expect(tokenSetSimilarity('ABC', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(tokenSetSimilarity('john smith', 'JOHN SMITH')).toBe(1);
  });
});
