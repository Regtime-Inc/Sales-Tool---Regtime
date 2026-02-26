import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  matchKey,
  stripEntitySuffixes,
  guessEntityType,
  nameVariants,
  dedupeAliases,
} from '../normalize';

describe('normalizeName', () => {
  it('uppercases and strips punctuation', () => {
    expect(normalizeName('Karan S. Zoria')).toBe('KARAN S ZORIA');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('  FOO   BAR  ')).toBe('FOO BAR');
  });
});

describe('stripEntitySuffixes', () => {
  it('strips LLC', () => {
    expect(stripEntitySuffixes('BROADWAY REALTY LLC')).toBe('BROADWAY REALTY');
  });

  it('strips legal suffix but keeps business words', () => {
    expect(stripEntitySuffixes('ACME HOLDINGS INC')).toBe('ACME HOLDINGS');
  });

  it('strips trailing commas', () => {
    expect(stripEntitySuffixes('SMITH, LLC,')).toBe('SMITH');
  });
});

describe('matchKey', () => {
  it('strips legal suffixes and prefixes for matching', () => {
    expect(matchKey('The Broadway Realty LLC')).toBe('BROADWAY REALTY');
  });

  it('produces same key for variants', () => {
    expect(matchKey('Zoria Karan')).toBe(matchKey('ZORIA KARAN'));
  });
});

describe('guessEntityType', () => {
  it('detects org from LLC suffix', () => {
    expect(guessEntityType('Broadway Realty LLC')).toBe('org');
  });

  it('detects org from TRUST', () => {
    expect(guessEntityType('Smith Family Trust')).toBe('org');
  });

  it('detects person from simple name', () => {
    expect(guessEntityType('KARAN ZORIA')).toBe('person');
  });

  it('returns unknown for ambiguous', () => {
    expect(guessEntityType('123 Main')).toBe('unknown');
  });
});

describe('nameVariants', () => {
  it('generates normalized and stripped variants', () => {
    const variants = nameVariants('Broadway Realty LLC');
    expect(variants).toContain('BROADWAY REALTY LLC');
    expect(variants).toContain('BROADWAY REALTY');
  });

  it('flips comma-separated names', () => {
    const variants = nameVariants('ZORIA, KARAN');
    expect(variants).toContain('KARAN ZORIA');
  });

  it('does not produce empty variants', () => {
    const variants = nameVariants('LLC');
    for (const v of variants) {
      expect(v.length).toBeGreaterThan(2);
    }
  });
});

describe('dedupeAliases', () => {
  it('merges without duplicates', () => {
    const result = dedupeAliases(['FOO BAR'], ['foo bar', 'BAZ QUX']);
    expect(result).toEqual(['FOO BAR', 'BAZ QUX']);
  });

  it('filters out very short aliases', () => {
    const result = dedupeAliases([], ['AB', 'GOOD NAME']);
    expect(result).toEqual(['GOOD NAME']);
  });
});
