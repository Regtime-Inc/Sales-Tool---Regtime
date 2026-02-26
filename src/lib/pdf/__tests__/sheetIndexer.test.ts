import { describe, it, expect } from 'vitest';
import { indexSheets, filterBottomRegion } from '../sheetIndexer';
import type { PositionedTextItem } from '../../../types/pdf';

function makeItem(str: string, x: number, y: number, page: number): PositionedTextItem {
  return { str, x, y, width: str.length * 6, height: 10, page };
}

describe('filterBottomRegion', () => {
  it('returns items in the bottom 20% of the coordinate range', () => {
    const items: PositionedTextItem[] = [
      makeItem('top', 10, 90, 1),
      makeItem('middle', 10, 50, 1),
      makeItem('bottom', 10, 10, 1),
    ];
    const bottom = filterBottomRegion(items, 0.2);
    expect(bottom.length).toBe(1);
    expect(bottom[0].str).toBe('bottom');
  });

  it('returns empty for empty input', () => {
    expect(filterBottomRegion([])).toEqual([]);
  });
});

describe('indexSheets', () => {
  it('extracts drawing number from bottom region text', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, [
      makeItem('Some large text block in the body of the page', 10, 80, 1),
      makeItem('A-101', 10, 5, 1),
      makeItem('ZONING ANALYSIS', 100, 5, 1),
    ]);

    const result = indexSheets(items, 1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].drawingNo).toBe('A-101');
    expect(result.pages[0].confidence).toBe(0.9);
    expect(result.pages[0].method).toBe('PDF_TEXT');
    expect(result.lookup.byDrawingNo['A-101']).toBe(1);
  });

  it('falls back to drawing title when no drawing number', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, [
      makeItem('Body text here', 10, 80, 1),
      makeItem('TYPICAL FLOOR PLAN', 10, 5, 1),
    ]);

    const result = indexSheets(items, 1);
    expect(result.pages[0].drawingTitle).toBe('TYPICAL FLOOR PLAN');
    expect(result.pages[0].confidence).toBe(0.5);
  });

  it('marks OCR_CROP when bottom has insufficient text', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, [
      makeItem('Large amount of text in the body of the document on the page', 10, 500, 1),
      makeItem('  ', 10, 5, 1),
    ]);

    const result = indexSheets(items, 1);
    expect(result.pages[0].method).toBe('OCR_CROP');
    expect(result.pages[0].confidence).toBe(0.3);
  });

  it('handles multiple pages', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, [
      makeItem('Body', 10, 80, 1),
      makeItem('Z-001', 10, 5, 1),
      makeItem('ZONING DATA', 100, 5, 1),
    ]);
    items.set(2, [
      makeItem('Body', 10, 80, 2),
      makeItem('A-200', 10, 5, 2),
      makeItem('FLOOR PLAN', 100, 5, 2),
    ]);

    const result = indexSheets(items, 2);
    expect(result.pages).toHaveLength(2);
    expect(result.lookup.byDrawingNo['Z-001']).toBe(1);
    expect(result.lookup.byDrawingNo['A-200']).toBe(2);
  });

  it('handles empty pages', () => {
    const items = new Map<number, PositionedTextItem[]>();
    const result = indexSheets(items, 2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].method).toBe('OCR_CROP');
    expect(result.pages[1].method).toBe('OCR_CROP');
  });
});
