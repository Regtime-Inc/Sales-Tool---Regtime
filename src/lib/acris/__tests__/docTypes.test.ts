import { describe, it, expect } from 'vitest';
import {
  isDeedType,
  isMortgageType,
  isRegulatoryType,
  docTypeCategory,
  socrataDocTypeFilter,
  ALL_TRACKED_DOC_TYPES,
} from '../docTypes';

describe('isDeedType', () => {
  it.each(['DEED', 'DEEDO', 'ADED', 'EXED', 'RDED', 'TORD'])(
    'returns true for %s',
    (dt) => expect(isDeedType(dt)).toBe(true)
  );

  it('returns false for mortgage type', () => {
    expect(isDeedType('MTGE')).toBe(false);
  });

  it('returns false for unknown type', () => {
    expect(isDeedType('XXXX')).toBe(false);
  });
});

describe('isMortgageType', () => {
  it.each(['MTGE', 'AGMT', 'ASPM', 'SMTG'])(
    'returns true for %s',
    (dt) => expect(isMortgageType(dt)).toBe(true)
  );

  it('returns false for deed type', () => {
    expect(isMortgageType('DEED')).toBe(false);
  });
});

describe('isRegulatoryType', () => {
  it.each(['RCOV', 'RSTD', 'RPTT', 'DECL'])(
    'returns true for %s',
    (dt) => expect(isRegulatoryType(dt)).toBe(true)
  );

  it('returns false for deed type', () => {
    expect(isRegulatoryType('DEED')).toBe(false);
  });
});

describe('docTypeCategory', () => {
  it('returns deed for deed types', () => {
    expect(docTypeCategory('DEED')).toBe('deed');
    expect(docTypeCategory('TORD')).toBe('deed');
  });

  it('returns mortgage for mortgage types', () => {
    expect(docTypeCategory('MTGE')).toBe('mortgage');
  });

  it('returns regulatory for regulatory types', () => {
    expect(docTypeCategory('RCOV')).toBe('regulatory');
  });

  it('returns unknown for unrecognized types', () => {
    expect(docTypeCategory('ZZZZ')).toBe('unknown');
    expect(docTypeCategory('')).toBe('unknown');
  });
});

describe('socrataDocTypeFilter', () => {
  it('returns a comma-separated quoted string of all tracked types', () => {
    const filter = socrataDocTypeFilter();
    for (const dt of ALL_TRACKED_DOC_TYPES) {
      expect(filter).toContain(`'${dt}'`);
    }
  });

  it('has correct count of types', () => {
    const filter = socrataDocTypeFilter();
    const count = filter.split(',').length;
    expect(count).toBe(ALL_TRACKED_DOC_TYPES.length);
  });
});
