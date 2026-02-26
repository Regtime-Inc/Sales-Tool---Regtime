import { describe, it, expect } from 'vitest';
import { extractZoningSignals } from '../signals/zoningAnalysis';
import type { PageText } from '../types';

function page(pageIndex: number, text: string): PageText {
  return { pageIndex, text, charCount: text.length, isLikelyScanned: false };
}

describe('extractZoningSignals', () => {
  it('returns all null when no zoning pages exist', () => {
    const pages = [page(1, 'This is a page about something else entirely')];
    const result = extractZoningSignals(pages);
    expect(result.totalDwellingUnits).toBeNull();
    expect(result.lotArea).toBeNull();
    expect(result.far).toBeNull();
    expect(result.zoningFloorArea).toBeNull();
    expect(result.zone).toBeNull();
  });

  it('skips pages without 2+ zoning keywords', () => {
    const pages = [page(1, 'FAR is mentioned but nothing else relevant')];
    const result = extractZoningSignals(pages);
    expect(result.far).toBeNull();
  });

  it('extracts from zoning pages with sufficient keywords', () => {
    const pages = [
      page(3, 'ZONING ANALYSIS\nLOT AREA: 10,000 SF\nFAR: 3.44\nZONING FLOOR AREA: 34,400 SF\nTOTAL DWELLING UNITS: 42'),
    ];
    const result = extractZoningSignals(pages);
    expect(result.lotArea?.value).toBe(10000);
    expect(result.far?.value).toBe(3.44);
    expect(result.zoningFloorArea?.value).toBe(34400);
    expect(result.totalDwellingUnits?.value).toBe(42);
  });

  it('extracts zone district', () => {
    const pages = [
      page(3, 'ZONING ANALYSIS\nZONING DISTRICT: R7-2\nFAR: 3.44\nLOT AREA: 5000'),
    ];
    const result = extractZoningSignals(pages);
    expect(result.zone?.value).toBe('R7-2');
  });

  it('rejects unreasonable FAR values', () => {
    const pages = [
      page(3, 'ZONING ANALYSIS\nFAR: 25.0\nLOT AREA: 5000'),
    ];
    const result = extractZoningSignals(pages);
    expect(result.far).toBeNull();
  });

  it('rejects unreasonable unit counts', () => {
    const pages = [
      page(3, 'ZONING ANALYSIS\nTOTAL DWELLING UNITS: 999\nLOT AREA: 5000'),
    ];
    const result = extractZoningSignals(pages);
    expect(result.totalDwellingUnits).toBeNull();
  });
});
