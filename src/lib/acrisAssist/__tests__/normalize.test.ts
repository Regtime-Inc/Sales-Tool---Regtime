import { describe, it, expect } from 'vitest';
import { normalizeName, normalizeDocType, normalizeBorough, toISODate, makeBBL } from '../normalize';

describe('normalizeName', () => {
  it('trims and title-cases', () => {
    expect(normalizeName('  JOHN DOE  ')).toBe('John Doe');
  });
  it('collapses whitespace', () => {
    expect(normalizeName('jane   doe')).toBe('Jane Doe');
  });
  it('returns empty for falsy', () => {
    expect(normalizeName('')).toBe('');
  });
});

describe('normalizeDocType', () => {
  it('maps "deed" to DEED', () => {
    expect(normalizeDocType('deed')).toBe('DEED');
    expect(normalizeDocType('Deed')).toBe('DEED');
  });
  it('maps "mortgage" to MTGE', () => {
    expect(normalizeDocType('mortgage')).toBe('MTGE');
    expect(normalizeDocType('MORTGAGE')).toBe('MTGE');
  });
  it('maps "satisfaction" to SAT', () => {
    expect(normalizeDocType('satisfaction')).toBe('SAT');
  });
  it('passes through already-canonical codes', () => {
    expect(normalizeDocType('DEED')).toBe('DEED');
    expect(normalizeDocType('MTGE')).toBe('MTGE');
  });
  it('uppercases unknown types', () => {
    expect(normalizeDocType('unknown_type')).toBe('UNKNOWN_TYPE');
  });
  it('returns empty for empty', () => {
    expect(normalizeDocType('')).toBe('');
  });
});

describe('normalizeBorough', () => {
  it('maps names to codes', () => {
    expect(normalizeBorough('Manhattan')).toBe('1');
    expect(normalizeBorough('BRONX')).toBe('2');
    expect(normalizeBorough('brooklyn')).toBe('3');
    expect(normalizeBorough('Queens')).toBe('4');
    expect(normalizeBorough('Staten Island')).toBe('5');
  });
  it('passes through digit codes', () => {
    expect(normalizeBorough('1')).toBe('1');
    expect(normalizeBorough('5')).toBe('5');
  });
  it('returns empty for unknown', () => {
    expect(normalizeBorough('Narnia')).toBe('');
  });
  it('returns empty for empty', () => {
    expect(normalizeBorough('')).toBe('');
  });
});

describe('toISODate', () => {
  it('parses MM/DD/YYYY', () => {
    expect(toISODate('01/15/2025')).toBe('2025-01-15');
  });
  it('parses M/D/YYYY', () => {
    expect(toISODate('1/5/2025')).toBe('2025-01-05');
  });
  it('parses YYYY-MM-DD', () => {
    expect(toISODate('2025-01-15')).toBe('2025-01-15');
  });
  it('parses "Jan 15, 2025"', () => {
    expect(toISODate('Jan 15, 2025')).toBe('2025-01-15');
  });
  it('parses "January 15 2025"', () => {
    expect(toISODate('January 15 2025')).toBe('2025-01-15');
  });
  it('parses "15 Jan 2025"', () => {
    expect(toISODate('15 Jan 2025')).toBe('2025-01-15');
  });
  it('parses MM/DD/YYYY with 12-hour timestamp', () => {
    expect(toISODate('2/19/2026 4:33:46 PM')).toBe('2026-02-19');
  });
  it('parses MM/DD/YYYY with 24-hour timestamp', () => {
    expect(toISODate('02/19/2026 16:33:46')).toBe('2026-02-19');
  });
  it('parses date with AM timestamp', () => {
    expect(toISODate('1/5/2025 9:15:00 AM')).toBe('2025-01-05');
  });
  it('returns null for invalid', () => {
    expect(toISODate('not a date')).toBeNull();
  });
  it('returns null for empty', () => {
    expect(toISODate('')).toBeNull();
  });
});

describe('makeBBL', () => {
  it('builds 10-digit BBL', () => {
    expect(makeBBL('1', '100', '50')).toBe('1001000050');
  });
  it('pads block and lot', () => {
    expect(makeBBL('Manhattan', '1', '1')).toBe('1000010001');
  });
  it('returns empty for invalid borough', () => {
    expect(makeBBL('Narnia', '100', '50')).toBe('');
  });
  it('returns empty for missing block', () => {
    expect(makeBBL('1', '', '50')).toBe('');
  });
  it('returns empty for missing lot', () => {
    expect(makeBBL('1', '100', '')).toBe('');
  });
});
