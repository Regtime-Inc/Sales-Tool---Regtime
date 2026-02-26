import { describe, it, expect } from 'vitest';
import { buildPageInputs } from '../llmExtractFromPages';
import type { SheetIndex, SheetInfo, RecipeType } from '../../../types/pdf';

function makeSheet(pageNumber: number, drawingNo?: string, drawingTitle?: string): SheetInfo {
  return {
    pageNumber,
    drawingNo,
    drawingTitle,
    confidence: 0.9,
    method: 'PDF_TEXT' as const,
  };
}

function makeIndex(sheets: SheetInfo[]): SheetIndex {
  return {
    pages: sheets,
    lookup: { byDrawingNo: {}, byTitleKey: {} },
  };
}

describe('buildPageInputs', () => {
  it('classifies pages by recipe type map', () => {
    const pageTexts = [
      'LOT AREA: 5000 SF FAR: 4.6',
      'ZONING COMPLIANCE TABLE...',
      'OCCUPANT LOAD TABLE UNIT 1A 336 SF',
    ];
    const recipeTypeMap = new Map<number, RecipeType>([
      [1, 'COVER_SHEET'],
      [2, 'ZONING_SCHEDULE'],
      [3, 'OCCUPANT_LOAD'],
    ]);

    const inputs = buildPageInputs(pageTexts, undefined, recipeTypeMap);
    expect(inputs).toHaveLength(3);
    expect(inputs[0].type).toBe('COVER_SHEET');
    expect(inputs[1].type).toBe('ZONING');
    expect(inputs[2].type).toBe('OCCUPANT_LOAD');
  });

  it('classifies pages by sheet index when no recipe type', () => {
    const pageTexts = ['LOT AREA: 5,000 SF  FAR: 4.6  # OF UNITS: 16'];
    const sheetIndex = makeIndex([makeSheet(1, 'T-001', 'COVER SHEET')]);
    const inputs = buildPageInputs(pageTexts, sheetIndex, new Map());
    expect(inputs).toHaveLength(1);
    expect(inputs[0].type).toBe('COVER_SHEET');
  });

  it('skips pages with less than 20 chars', () => {
    const pageTexts = ['short', 'This page has enough text to be included in the analysis.'];
    const inputs = buildPageInputs(pageTexts, undefined, new Map());
    expect(inputs).toHaveLength(1);
    expect(inputs[0].page).toBe(2);
  });

  it('sorts by priority: COVER_SHEET first, GENERAL last', () => {
    const pageTexts = Array(5).fill('Enough text content for analysis purposes here.');
    const recipeTypeMap = new Map<number, RecipeType>([
      [1, 'GENERIC'],
      [2, 'FLOOR_PLAN_LABEL'],
      [3, 'COVER_SHEET'],
      [4, 'ZONING_SCHEDULE'],
      [5, 'OCCUPANT_LOAD'],
    ]);
    const inputs = buildPageInputs(pageTexts, undefined, recipeTypeMap);
    expect(inputs[0].type).toBe('COVER_SHEET');
    expect(inputs[1].type).toBe('ZONING');
    expect(inputs[2].type).toBe('OCCUPANT_LOAD');
    expect(inputs[3].type).toBe('FLOOR_PLAN');
    expect(inputs[4].type).toBe('GENERAL');
  });

  it('limits to 12 pages max', () => {
    const pageTexts = Array(20).fill('Enough text content for analysis purposes here.');
    const inputs = buildPageInputs(pageTexts, undefined, new Map());
    expect(inputs.length).toBeLessThanOrEqual(12);
  });
});
