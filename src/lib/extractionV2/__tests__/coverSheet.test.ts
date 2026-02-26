import { describe, it, expect } from 'vitest';
import { extractCoverSheetSignals } from '../signals/coverSheet';
import type { PageText } from '../types';

function page(pageIndex: number, text: string): PageText {
  return { pageIndex, text, charCount: text.length, isLikelyScanned: false };
}

describe('extractCoverSheetSignals', () => {
  it('extracts total units from cover sheet text', () => {
    const pages = [
      page(1, 'COVER SHEET\nPROPOSED 14 UNIT RESIDENTIAL BUILDING\nBLOCK 123 LOT 45'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.totalUnits).not.toBeNull();
    expect(result.totalUnits!.value).toBe(14);
    expect(result.totalUnits!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('extracts total units with "TOTAL DWELLING UNITS" pattern', () => {
    const pages = [
      page(1, 'PROJECT DATA\nTOTAL DWELLING UNITS: 28\nFLOORS: 8'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.totalUnits?.value).toBe(28);
  });

  it('extracts floor count', () => {
    const pages = [
      page(1, 'COVER SHEET\n8 STORIES ABOVE GRADE\nPROPOSED 14 UNIT'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.floors?.value).toBe(8);
  });

  it('extracts zoning district', () => {
    const pages = [
      page(1, 'COVER SHEET\nZONING DISTRICT: R7A\n14 UNIT RESIDENTIAL'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.zone?.value).toBe('R7A');
  });

  it('prioritizes cover sheet pages', () => {
    const pages = [
      page(1, 'PROPOSED 99 UNIT BUILDING'),
      page(2, 'COVER SHEET\nPROPOSED 14 UNIT RESIDENTIAL BUILDING'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.totalUnits?.value).toBe(14);
    expect(result.totalUnits!.evidence[0].page).toBe(2);
  });

  it('returns null when no patterns match', () => {
    const pages = [page(1, 'This is some random text with no unit data')];
    const result = extractCoverSheetSignals(pages);
    expect(result.totalUnits).toBeNull();
    expect(result.floors).toBeNull();
    expect(result.zone).toBeNull();
  });

  it('rejects unreasonable unit counts', () => {
    const pages = [page(1, 'PROPOSED 999 UNIT BUILDING')];
    const result = extractCoverSheetSignals(pages);
    expect(result.totalUnits).toBeNull();
  });

  it('extracts lot area', () => {
    const pages = [
      page(1, 'COVER SHEET\nLOT AREA: 5,000 SF\n14 UNIT'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.lotArea?.value).toBe(5000);
  });

  it('extracts FAR with validation', () => {
    const pages = [
      page(1, 'COVER SHEET\nFAR: 4.6\nLOT AREA: 5,000 SF'),
    ];
    const result = extractCoverSheetSignals(pages);
    expect(result.far?.value).toBe(4.6);
  });
});
