import { describe, it, expect } from 'vitest';
import { extractUnitMix } from '../unitMixExtractor';
import type { PositionedTextItem, OcrPageResult } from '../../../types/pdf';

function makeItem(str: string, x: number, y: number, page: number): PositionedTextItem {
  return { str, x, y, width: str.length * 7, height: 12, page };
}

function buildSchedulePage(page: number): PositionedTextItem[] {
  return [
    makeItem('APARTMENT UNIT SCHEDULE', 50, 700, page),
    makeItem('UNIT', 50, 660, page),
    makeItem('BEDROOM', 150, 660, page),
    makeItem('ALLOCATION', 300, 660, page),
    makeItem('A-101', 50, 640, page),
    makeItem('STUDIO', 150, 640, page),
    makeItem('AFFORDABLE', 300, 640, page),
    makeItem('A-102', 50, 620, page),
    makeItem('1BR', 150, 620, page),
    makeItem('MIH', 300, 620, page),
    makeItem('A-103', 50, 600, page),
    makeItem('2BR', 150, 600, page),
    makeItem('MARKET', 300, 600, page),
  ];
}

describe('extractUnitMix', () => {
  it('extracts records from a structured table', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, buildSchedulePage(1));

    const result = extractUnitMix(items, ['']);
    expect(result.unitRecords.length).toBeGreaterThanOrEqual(3);
    expect(result.totals.totalUnits).toBeGreaterThanOrEqual(3);
  });

  it('detects bedroom types correctly', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, buildSchedulePage(1));

    const result = extractUnitMix(items, ['']);
    const types = result.unitRecords.map((r) => r.bedroomType);
    expect(types).toContain('STUDIO');
    expect(types).toContain('1BR');
    expect(types).toContain('2BR');
  });

  it('detects allocation types correctly', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, buildSchedulePage(1));

    const result = extractUnitMix(items, ['']);
    const allocs = result.unitRecords.map((r) => r.allocation);
    expect(allocs.some((a) => a === 'AFFORDABLE' || a === 'MIH_RESTRICTED')).toBe(true);
    expect(allocs).toContain('MARKET');
  });

  it('detects AMI bands from text', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, [
      makeItem('UNIT MIX', 50, 700, 1),
      makeItem('UNIT', 50, 660, 1),
      makeItem('BED', 150, 660, 1),
      makeItem('AMI', 300, 660, 1),
      makeItem('201', 50, 640, 1),
      makeItem('1BR', 150, 640, 1),
      makeItem('60% AMI', 300, 640, 1),
    ]);

    const result = extractUnitMix(items, ['']);
    const withAmi = result.unitRecords.filter((r) => r.amiBand !== undefined);
    expect(withAmi.length).toBeGreaterThanOrEqual(1);
    expect(withAmi[0].amiBand).toBe(60);
  });

  it('falls back to text regex when no table detected', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, []);

    const pageTexts = ['10 Studio Affordable\n5 1BR Market\n3 2BR MIH'];
    const result = extractUnitMix(items, pageTexts);
    expect(result.unitRecords.length).toBeGreaterThanOrEqual(3);
  });

  it('computes confidence scores', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, buildSchedulePage(1));

    const result = extractUnitMix(items, ['']);
    expect(result.confidence.overall).toBeGreaterThan(0);
    expect(result.confidence.overall).toBeLessThanOrEqual(1);
  });

  it('handles OCR fallback results', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, []);

    const ocrResults: OcrPageResult[] = [
      {
        page: 1,
        text: 'UNIT SCHEDULE\nA-101 Studio Affordable\nA-102 1BR Market',
        confidence: 0.75,
        lines: ['UNIT SCHEDULE', 'A-101 Studio Affordable', 'A-102 1BR Market'],
      },
    ];

    const result = extractUnitMix(items, [''], ocrResults);
    expect(result.unitRecords.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty extraction for empty input', () => {
    const items = new Map<number, PositionedTextItem[]>();
    const result = extractUnitMix(items, []);
    expect(result.unitRecords).toEqual([]);
    expect(result.totals.totalUnits).toBe(0);
    expect(result.confidence.overall).toBe(0);
  });

  it('computes totals by bedroom type and allocation', () => {
    const items = new Map<number, PositionedTextItem[]>();
    items.set(1, buildSchedulePage(1));

    const result = extractUnitMix(items, ['']);
    expect(Object.keys(result.totals.byBedroomType).length).toBeGreaterThan(0);
    expect(Object.keys(result.totals.byAllocation).length).toBeGreaterThan(0);
  });
});
