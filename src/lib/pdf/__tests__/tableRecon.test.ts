import { describe, it, expect } from 'vitest';
import { reconstructTables } from '../tableRecon';
import type { PositionedTextItem } from '../../../types/pdf';

function item(str: string, x: number, y: number, page = 1): PositionedTextItem {
  return { str, x, y, width: str.length * 7, height: 12, page };
}

describe('reconstructTables', () => {
  it('detects a 2-column table with header', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BEDROOM', 200, 700),
      item('A-101', 50, 680),
      item('1BR', 200, 680),
      item('A-102', 50, 660),
      item('2BR', 200, 660),
    ];
    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(1);
    expect(tables[0].dataRows.length).toBe(2);
    expect(tables[0].headerRow.cells.length).toBeGreaterThanOrEqual(2);
  });

  it('detects a 4-column table', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BED', 200, 700),
      item('SF', 350, 700),
      item('AFFORDABLE', 500, 700),
      item('A-101', 50, 680),
      item('STUDIO', 200, 680),
      item('450', 350, 680),
      item('MIH', 500, 680),
      item('A-102', 50, 660),
      item('1BR', 200, 660),
      item('650', 350, 660),
      item('MARKET', 500, 660),
      item('A-103', 50, 640),
      item('2BR', 200, 640),
      item('850', 350, 640),
      item('MIH', 500, 640),
    ];
    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(1);
    expect(tables[0].dataRows.length).toBe(3);
    expect(tables[0].headerRow.cells.length).toBeGreaterThanOrEqual(4);
  });

  it('returns empty for items with no header', () => {
    const items: PositionedTextItem[] = [
      item('100', 50, 700),
      item('200', 200, 700),
      item('300', 50, 680),
      item('400', 200, 680),
    ];
    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(0);
  });

  it('returns empty for empty items', () => {
    expect(reconstructTables([], 1)).toEqual([]);
  });

  it('detects table region boundaries on large y-gaps', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BED', 200, 700),
      item('A-101', 50, 680),
      item('1BR', 200, 680),
      item('A-102', 50, 660),
      item('2BR', 200, 660),
      // Large gap
      item('Notes: some text here', 50, 500),
    ];
    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(1);
    expect(tables[0].dataRows.length).toBe(2);
  });

  it('correctly computes bbox for the table region', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BEDROOM', 200, 700),
      item('A-101', 50, 680),
      item('1BR', 200, 680),
    ];
    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(1);
    expect(tables[0].bbox.x0).toBeLessThanOrEqual(50);
    expect(tables[0].bbox.x1).toBeGreaterThan(200);
  });
});
