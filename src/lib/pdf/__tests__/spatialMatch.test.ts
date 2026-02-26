import { describe, it, expect } from 'vitest';
import { findUnitLabelsNearAreas, findAreaLabelsOnPage } from '../spatialMatch';
import type { PositionedTextItem } from '../../../types/pdf';

function makeItem(str: string, x: number, y: number, w = 50, h = 12): PositionedTextItem {
  return { str, x, y, width: w, height: h, page: 1 };
}

describe('findUnitLabelsNearAreas', () => {
  it('pairs adjacent unit and area labels', () => {
    const items: PositionedTextItem[] = [
      makeItem('UNIT 1A', 100, 500),
      makeItem('336 SF', 100, 480),
      makeItem('UNIT 2A', 300, 500),
      makeItem('472 SF', 300, 480),
    ];
    const records = findUnitLabelsNearAreas(items, 1);
    expect(records).toHaveLength(2);
    expect(records[0].unitId).toBe('1A');
    expect(records[0].areaSf).toBe(336);
    expect(records[1].unitId).toBe('2A');
    expect(records[1].areaSf).toBe(472);
  });

  it('respects max distance threshold', () => {
    const items: PositionedTextItem[] = [
      makeItem('UNIT 1A', 100, 500),
      makeItem('336 SF', 100, 300),
    ];
    const records = findUnitLabelsNearAreas(items, 1, 80);
    expect(records).toHaveLength(0);
  });

  it('deduplicates unit IDs', () => {
    const items: PositionedTextItem[] = [
      makeItem('UNIT 1A', 100, 500),
      makeItem('UNIT 1A', 200, 500),
      makeItem('336 SF', 100, 480),
      makeItem('400 SF', 200, 480),
    ];
    const records = findUnitLabelsNearAreas(items, 1);
    expect(records).toHaveLength(1);
    expect(records[0].unitId).toBe('1A');
  });

  it('returns empty for no matching items', () => {
    const items: PositionedTextItem[] = [
      makeItem('Random text', 100, 500),
      makeItem('More text', 200, 500),
    ];
    const records = findUnitLabelsNearAreas(items, 1);
    expect(records).toHaveLength(0);
  });

  it('rejects area values outside 100-5000 range', () => {
    const items: PositionedTextItem[] = [
      makeItem('UNIT 1A', 100, 500),
      makeItem('50 SF', 100, 480),
    ];
    const records = findUnitLabelsNearAreas(items, 1);
    expect(records).toHaveLength(0);
  });
});

describe('findAreaLabelsOnPage', () => {
  it('finds area labels with SF suffix', () => {
    const items: PositionedTextItem[] = [
      makeItem('336 SF', 100, 500),
      makeItem('472 SQ FT', 300, 500),
    ];
    const results = findAreaLabelsOnPage(items, 1);
    expect(results).toHaveLength(2);
    expect(results[0].areaSf).toBe(336);
    expect(results[1].areaSf).toBe(472);
  });

  it('rejects values outside valid range', () => {
    const items: PositionedTextItem[] = [
      makeItem('50 SF', 100, 500),
      makeItem('10000 SF', 300, 500),
    ];
    const results = findAreaLabelsOnPage(items, 1);
    expect(results).toHaveLength(0);
  });
});
