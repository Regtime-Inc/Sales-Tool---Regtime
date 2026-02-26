import { describe, it, expect } from 'vitest';
import {
  groupItemsIntoLines,
  linesToTableRows,
  isScheduleCandidatePage,
  detectCandidatePages,
  detectHeaderRow,
} from '../pageTextLayout';
import type { PositionedTextItem, PageLine, PageTableRow } from '../../../types/pdf';

function item(str: string, x: number, y: number, page = 1): PositionedTextItem {
  return { str, x, y, width: str.length * 6, height: 12, page };
}

describe('groupItemsIntoLines', () => {
  it('groups items at the same Y into one line', () => {
    const items = [item('A', 10, 100), item('B', 50, 100), item('C', 90, 100)];
    const lines = groupItemsIntoLines(items, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('A');
    expect(lines[0].text).toContain('B');
    expect(lines[0].text).toContain('C');
  });

  it('groups items within Y tolerance into same line', () => {
    const items = [item('A', 10, 100), item('B', 50, 102), item('C', 90, 99)];
    const lines = groupItemsIntoLines(items, 1);
    expect(lines).toHaveLength(1);
  });

  it('splits items with large Y gaps into separate lines', () => {
    const items = [item('Top', 10, 200), item('Bottom', 10, 100)];
    const lines = groupItemsIntoLines(items, 1);
    expect(lines).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(groupItemsIntoLines([], 1)).toEqual([]);
  });

  it('sorts items left-to-right within a line', () => {
    const items = [item('B', 80, 100), item('A', 10, 100)];
    const lines = groupItemsIntoLines(items, 1);
    expect(lines[0].items[0].str).toBe('A');
    expect(lines[0].items[1].str).toBe('B');
  });
});

describe('linesToTableRows', () => {
  it('splits line items into cells based on X gaps', () => {
    const items = [
      item('Col1', 10, 100),
      item('Col2', 120, 100),
      item('Col3', 250, 100),
    ];
    const lines = groupItemsIntoLines(items, 1);
    const rows = linesToTableRows(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps adjacent items in the same cell', () => {
    const items = [item('Hello', 10, 100), item('World', 46, 100)];
    const lines = groupItemsIntoLines(items, 1);
    const rows = linesToTableRows(lines);
    expect(rows[0].cells).toHaveLength(1);
    expect(rows[0].cells[0].text).toContain('Hello');
  });

  it('produces a rowText matching the line text', () => {
    const items = [item('Test', 10, 100)];
    const lines = groupItemsIntoLines(items, 1);
    const rows = linesToTableRows(lines);
    expect(rows[0].rowText).toBe('Test');
  });
});

describe('isScheduleCandidatePage', () => {
  it('returns true for pages with UNIT SCHEDULE keyword', () => {
    const lines: PageLine[] = [{ y: 100, items: [], text: 'APARTMENT UNIT SCHEDULE', page: 1 }];
    expect(isScheduleCandidatePage(lines)).toBe(true);
  });

  it('returns true for pages with MIH keyword', () => {
    const lines: PageLine[] = [{ y: 100, items: [], text: 'MIH Requirements', page: 1 }];
    expect(isScheduleCandidatePage(lines)).toBe(true);
  });

  it('returns true for pages with AFFORDABLE keyword', () => {
    const lines: PageLine[] = [{ y: 100, items: [], text: 'Affordable Housing Plan', page: 1 }];
    expect(isScheduleCandidatePage(lines)).toBe(true);
  });

  it('returns false for unrelated pages', () => {
    const lines: PageLine[] = [{ y: 100, items: [], text: 'General Notes and Symbols', page: 1 }];
    expect(isScheduleCandidatePage(lines)).toBe(false);
  });
});

describe('detectCandidatePages', () => {
  it('returns pages that contain schedule keywords', () => {
    const pageLines = new Map<number, PageLine[]>();
    pageLines.set(1, [{ y: 100, items: [], text: 'Floor Plan', page: 1 }]);
    pageLines.set(2, [{ y: 100, items: [], text: 'UNIT SCHEDULE', page: 2 }]);
    pageLines.set(3, [{ y: 100, items: [], text: 'Elevations', page: 3 }]);
    const candidates = detectCandidatePages(pageLines);
    expect(candidates).toEqual([2]);
  });

  it('returns empty array when no candidate pages found', () => {
    const pageLines = new Map<number, PageLine[]>();
    pageLines.set(1, [{ y: 100, items: [], text: 'Cover Sheet', page: 1 }]);
    expect(detectCandidatePages(pageLines)).toEqual([]);
  });
});

describe('detectHeaderRow', () => {
  it('detects header when row has UNIT and BED columns', () => {
    const rows: PageTableRow[] = [
      {
        cells: [
          { text: 'UNIT', x0: 10, x1: 50 },
          { text: 'BEDROOM', x0: 70, x1: 130 },
          { text: 'SF', x0: 150, x1: 180 },
        ],
        rowText: 'UNIT  BEDROOM  SF',
        y: 500,
        page: 1,
      },
      {
        cells: [
          { text: 'A-101', x0: 10, x1: 50 },
          { text: '1BR', x0: 70, x1: 130 },
          { text: '750', x0: 150, x1: 180 },
        ],
        rowText: 'A-101  1BR  750',
        y: 480,
        page: 1,
      },
    ];

    const result = detectHeaderRow(rows);
    expect(result).not.toBeNull();
    expect(result!.headerIndex).toBe(0);
    expect(result!.columns.unitId).toBe(0);
    expect(result!.columns.bedroom).toBe(1);
  });

  it('returns null when no header detected', () => {
    const rows: PageTableRow[] = [
      {
        cells: [{ text: '100', x0: 10, x1: 50 }, { text: '200', x0: 70, x1: 130 }],
        rowText: '100  200',
        y: 500,
        page: 1,
      },
    ];
    expect(detectHeaderRow(rows)).toBeNull();
  });
});
