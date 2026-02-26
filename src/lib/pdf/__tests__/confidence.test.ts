import { describe, it, expect } from 'vitest';
import { scorePageConfidence, scoreOverallConfidence, generateWarnings } from '../confidence';
import type { UnitRecord, TableRegion } from '../../../types/pdf';

describe('scorePageConfidence', () => {
  it('gives high score for well-parsed page', () => {
    const score = scorePageConfidence({
      page: 1,
      headerMappedColumns: 4,
      totalRowFound: true,
      totalRowConsistent: true,
      unitRowCount: 20,
      ocrUsed: false,
      ocrConfidence: 0,
      totalsConflict: false,
    });
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThanOrEqual(0.99);
  });

  it('penalizes for totals conflict', () => {
    const good = scorePageConfidence({
      page: 1,
      headerMappedColumns: 3,
      totalRowFound: true,
      totalRowConsistent: true,
      unitRowCount: 15,
      ocrUsed: false,
      ocrConfidence: 0,
      totalsConflict: false,
    });
    const bad = scorePageConfidence({
      page: 1,
      headerMappedColumns: 3,
      totalRowFound: true,
      totalRowConsistent: true,
      unitRowCount: 15,
      ocrUsed: false,
      ocrConfidence: 0,
      totalsConflict: true,
    });
    expect(bad).toBeLessThan(good);
  });

  it('adds OCR confidence when OCR used', () => {
    const withOcr = scorePageConfidence({
      page: 1,
      headerMappedColumns: 2,
      totalRowFound: false,
      totalRowConsistent: false,
      unitRowCount: 5,
      ocrUsed: true,
      ocrConfidence: 85,
      totalsConflict: false,
    });
    const withoutOcr = scorePageConfidence({
      page: 1,
      headerMappedColumns: 2,
      totalRowFound: false,
      totalRowConsistent: false,
      unitRowCount: 5,
      ocrUsed: false,
      ocrConfidence: 0,
      totalsConflict: false,
    });
    expect(withOcr).toBeGreaterThan(withoutOcr);
  });

  it('returns 0 for page with no data at all', () => {
    const score = scorePageConfidence({
      page: 1,
      headerMappedColumns: 0,
      totalRowFound: false,
      totalRowConsistent: false,
      unitRowCount: 0,
      ocrUsed: false,
      ocrConfidence: 0,
      totalsConflict: false,
    });
    expect(score).toBe(0);
  });

  it('caps at 0.99', () => {
    const score = scorePageConfidence({
      page: 1,
      headerMappedColumns: 5,
      totalRowFound: true,
      totalRowConsistent: true,
      unitRowCount: 100,
      ocrUsed: true,
      ocrConfidence: 99,
      totalsConflict: false,
    });
    expect(score).toBeLessThanOrEqual(0.99);
  });
});

describe('scoreOverallConfidence', () => {
  it('computes weighted average', () => {
    const score = scoreOverallConfidence([
      { page: 1, score: 0.8, weight: 10 },
      { page: 2, score: 0.6, weight: 5 },
    ]);
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.8);
  });

  it('returns 0 for empty input', () => {
    expect(scoreOverallConfidence([])).toBe(0);
  });

  it('caps at 0.99', () => {
    const score = scoreOverallConfidence([
      { page: 1, score: 1.0, weight: 100 },
    ]);
    expect(score).toBeLessThanOrEqual(0.99);
  });
});

describe('generateWarnings', () => {
  const makeRecord = (bed: string, alloc: string): UnitRecord => ({
    bedroomType: bed as UnitRecord['bedroomType'],
    allocation: alloc as UnitRecord['allocation'],
    source: { page: 1, method: 'TEXT_TABLE', evidence: '' },
  });

  it('warns about totals conflict', () => {
    const warnings = generateWarnings([], [], true, false, true);
    expect(warnings.some((w) => w.includes('inconsistent'))).toBe(true);
  });

  it('warns about OCR usage', () => {
    const warnings = generateWarnings([], [], false, true, true);
    expect(warnings.some((w) => w.includes('OCR'))).toBe(true);
  });

  it('warns about missing FAR', () => {
    const warnings = generateWarnings([], [], false, false, false);
    expect(warnings.some((w) => w.includes('FAR'))).toBe(true);
  });

  it('warns about high unknown bedroom rate', () => {
    const records = [
      makeRecord('UNKNOWN', 'MARKET'),
      makeRecord('UNKNOWN', 'MARKET'),
      makeRecord('1BR', 'MARKET'),
    ];
    const warnings = generateWarnings(records, [], false, false, true);
    expect(warnings.some((w) => w.includes('undetected bedroom'))).toBe(true);
  });

  it('warns about high unknown allocation rate', () => {
    const records = [
      makeRecord('1BR', 'UNKNOWN'),
      makeRecord('2BR', 'UNKNOWN'),
      makeRecord('3BR', 'UNKNOWN'),
    ];
    const warnings = generateWarnings(records, [], false, false, true);
    expect(warnings.some((w) => w.includes('undetected allocations'))).toBe(true);
  });

  it('warns about no structured table', () => {
    const records = [makeRecord('1BR', 'MARKET')];
    const warnings = generateWarnings(records, [], false, false, true);
    expect(warnings.some((w) => w.includes('No structured table'))).toBe(true);
  });
});
