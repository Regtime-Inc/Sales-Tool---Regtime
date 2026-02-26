import { describe, it, expect } from 'vitest';
import { selectRecipes, COVER_SHEET_RECIPE, ZONING_SCHEDULE_RECIPE, FLOOR_PLAN_LABEL_RECIPE, OCCUPANT_LOAD_RECIPE, GENERIC_RECIPE } from '../recipes';
import type { SheetIndex, SheetInfo, PositionedTextItem, PageLine, UnitRecord, CoverSheetExtraction } from '../../../types/pdf';

function makeSheet(pageNumber: number, drawingNo?: string, drawingTitle?: string): SheetInfo {
  return {
    pageNumber,
    drawingNo,
    drawingTitle,
    confidence: drawingNo ? 0.9 : drawingTitle ? 0.5 : 0.3,
    method: 'PDF_TEXT' as const,
  };
}

function makeIndex(sheets: SheetInfo[]): SheetIndex {
  return {
    pages: sheets,
    lookup: { byDrawingNo: {}, byTitleKey: {} },
  };
}

describe('ZONING_SCHEDULE_RECIPE.match', () => {
  it('matches sheets with ZONING ANALYSIS title', () => {
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, undefined, 'ZONING ANALYSIS'))).toBe(true);
  });

  it('matches sheets with ZONING COMPLIANCE title', () => {
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, undefined, 'ZONING COMPLIANCE'))).toBe(true);
  });

  it('matches sheets with Z- drawing number', () => {
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, 'Z-001'))).toBe(true);
  });

  it('matches sheets with A-004 drawing number', () => {
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, 'A004'))).toBe(true);
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, 'A-004'))).toBe(true);
  });

  it('rejects unrelated sheets', () => {
    expect(ZONING_SCHEDULE_RECIPE.match(makeSheet(1, 'A-101', 'FLOOR PLAN'))).toBe(false);
  });
});

describe('FLOOR_PLAN_LABEL_RECIPE.match', () => {
  it('matches FLOOR PLAN title', () => {
    expect(FLOOR_PLAN_LABEL_RECIPE.match(makeSheet(1, undefined, 'FLOOR PLAN'))).toBe(true);
  });

  it('matches TYPICAL FLOOR title', () => {
    expect(FLOOR_PLAN_LABEL_RECIPE.match(makeSheet(1, undefined, 'TYPICAL FLOOR'))).toBe(true);
  });

  it('rejects SITE PLAN', () => {
    expect(FLOOR_PLAN_LABEL_RECIPE.match(makeSheet(1, undefined, 'SITE PLAN'))).toBe(false);
  });

  it('rejects FOUNDATION PLAN', () => {
    expect(FLOOR_PLAN_LABEL_RECIPE.match(makeSheet(1, undefined, 'FOUNDATION PLAN'))).toBe(false);
  });
});

describe('selectRecipes', () => {
  it('assigns zoning and floor plan recipes to matching sheets', () => {
    const index = makeIndex([
      makeSheet(1, 'Z-001', 'ZONING ANALYSIS'),
      makeSheet(2, 'A-200', 'TYPICAL FLOOR'),
    ]);

    const selected = selectRecipes(index);
    expect(selected).toHaveLength(2);

    const zoningEntry = selected.find((s) => s.recipe.type === 'ZONING_SCHEDULE');
    expect(zoningEntry).toBeDefined();
    expect(zoningEntry!.pages).toEqual([1]);

    const floorEntry = selected.find((s) => s.recipe.type === 'FLOOR_PLAN_LABEL');
    expect(floorEntry).toBeDefined();
    expect(floorEntry!.pages).toEqual([2]);
  });

  it('matches COVER SHEET to COVER_SHEET recipe and unmatched to GENERIC', () => {
    const index = makeIndex([
      makeSheet(1, 'A-100', 'COVER SHEET'),
      makeSheet(2, 'S-101', 'STRUCTURAL PLAN'),
    ]);

    const selected = selectRecipes(index);
    const coverEntry = selected.find((s) => s.recipe.type === 'COVER_SHEET');
    const genericEntry = selected.find((s) => s.recipe.type === 'GENERIC');
    expect(coverEntry).toBeDefined();
    expect(coverEntry!.pages).toEqual([1]);
    expect(genericEntry).toBeDefined();
    expect(genericEntry!.pages).toEqual([2]);
  });

  it('respects user overrides', () => {
    const index = makeIndex([
      makeSheet(1, 'A-100', 'COVER SHEET'),
      makeSheet(2, 'A-200', 'TYPICAL FLOOR'),
    ]);

    const overrides = { 1: 'ZONING_SCHEDULE' as const, 2: 'skip' as const };
    const selected = selectRecipes(index, overrides);

    expect(selected).toHaveLength(1);
    expect(selected[0].recipe.type).toBe('ZONING_SCHEDULE');
    expect(selected[0].pages).toEqual([1]);
  });

  it('returns empty when all pages skipped', () => {
    const index = makeIndex([makeSheet(1, 'A-100', 'COVER')]);
    const selected = selectRecipes(index, { 1: 'skip' });
    expect(selected).toHaveLength(0);
  });

  it('assigns GENERIC to unmatched pages even when other recipes matched', () => {
    const index = makeIndex([
      makeSheet(1, 'Z-001', 'ZONING ANALYSIS'),
      makeSheet(2, 'S-100', 'STRUCTURAL FRAMING'),
    ]);

    const selected = selectRecipes(index);
    const zoningEntry = selected.find((s) => s.recipe.type === 'ZONING_SCHEDULE');
    const genericEntry = selected.find((s) => s.recipe.type === 'GENERIC');
    expect(zoningEntry).toBeDefined();
    expect(genericEntry).toBeDefined();
    expect(genericEntry!.pages).toEqual([2]);
  });
});

describe('OCCUPANT_LOAD_RECIPE.match', () => {
  it('matches sheets with OCCUPANT LOAD title', () => {
    expect(OCCUPANT_LOAD_RECIPE.match(makeSheet(1, undefined, 'OCCUPANT LOAD'))).toBe(true);
  });

  it('matches sheets with CODE NOTES title', () => {
    expect(OCCUPANT_LOAD_RECIPE.match(makeSheet(1, undefined, 'CODE NOTES'))).toBe(true);
  });

  it('matches sheets with G- drawing number', () => {
    expect(OCCUPANT_LOAD_RECIPE.match(makeSheet(1, 'G-002'))).toBe(true);
  });

  it('rejects unrelated sheets', () => {
    expect(OCCUPANT_LOAD_RECIPE.match(makeSheet(1, 'A-200', 'FLOOR PLAN'))).toBe(false);
  });
});

describe('OCCUPANT_LOAD_RECIPE.extract', () => {
  function makeParams(pageTexts: string[]) {
    const positionedItems = new Map<number, PositionedTextItem[]>();
    const pageLines = new Map<number, PageLine[]>();
    const pages = pageTexts.map((_, i) => i + 1);
    for (let i = 0; i < pageTexts.length; i++) {
      positionedItems.set(i + 1, []);
      pageLines.set(i + 1, pageTexts[i].split('\n').map((text, y) => ({
        y: 700 - y * 20,
        items: [],
        text,
        page: i + 1,
      })));
    }
    return { pages, positionedItems, pageTexts, pageLines };
  }

  it('extracts unit records from occupant load table', async () => {
    const text = `OCCUPANT LOAD TABLE (BC 1004)
NAME/USE          AREA    AREA PER OCCUPANT    # OCCUPANTS
UNIT 1A           336 SF  200 SF               2
UNIT 1B           472 SF  200 SF               3
UNIT 2A           336 SF  200 SF               2
TOTAL OCCUPANCY: 7`;
    const result = await OCCUPANT_LOAD_RECIPE.extract(makeParams([text]));
    expect(result.recipe).toBe('OCCUPANT_LOAD');
    const records = result.fields.unitRecords as UnitRecord[];
    expect(records.length).toBe(3);
    expect(records[0].unitId).toBe('1A');
    expect(records[0].areaSf).toBe(336);
    expect(records[1].unitId).toBe('1B');
    expect(records[1].areaSf).toBe(472);
  });

  it('skips 200 SF per-occupant column', async () => {
    const text = `OCCUPANT LOAD
UNIT 3A  500 SF  200 SF  3`;
    const result = await OCCUPANT_LOAD_RECIPE.extract(makeParams([text]));
    const records = result.fields.unitRecords as UnitRecord[];
    expect(records.length).toBe(1);
    expect(records[0].areaSf).toBe(500);
  });

  it('extracts total occupancy', async () => {
    const text = `OCCUPANT LOAD
UNIT 1A  336 SF  200 SF  2
TOTAL OCCUPANCY: 2`;
    const result = await OCCUPANT_LOAD_RECIPE.extract(makeParams([text]));
    expect(result.fields.totalOccupancy).toBe(2);
  });

  it('returns low confidence when no units found', async () => {
    const text = 'Some unrelated text about code compliance';
    const result = await OCCUPANT_LOAD_RECIPE.extract(makeParams([text]));
    expect(result.confidence).toBeLessThan(0.5);
    expect((result.fields.unitRecords as UnitRecord[]).length).toBe(0);
  });

  it('deduplicates units across pages', async () => {
    const page1 = `OCCUPANT LOAD
UNIT 1A  336 SF  200 SF  2`;
    const page2 = `OCCUPANT LOAD
UNIT 1A  336 SF  200 SF  2
UNIT 2A  500 SF  200 SF  3`;
    const result = await OCCUPANT_LOAD_RECIPE.extract(makeParams([page1, page2]));
    const records = result.fields.unitRecords as UnitRecord[];
    const unit1As = records.filter((r) => r.unitId === '1A');
    expect(unit1As.length).toBe(1);
  });
});

describe('FLOOR_PLAN_LABEL_RECIPE.extract', () => {
  function makeParams(pageTexts: string[]) {
    const positionedItems = new Map<number, PositionedTextItem[]>();
    const pageLines = new Map<number, PageLine[]>();
    const pages = pageTexts.map((_, i) => i + 1);
    for (let i = 0; i < pageTexts.length; i++) {
      positionedItems.set(i + 1, []);
      pageLines.set(i + 1, []);
    }
    return { pages, positionedItems, pageTexts, pageLines };
  }

  it('extracts "336 SF UNIT 1A" pattern', async () => {
    const text = '336 SF UNIT 1A\n472 SF UNIT 1B';
    const result = await FLOOR_PLAN_LABEL_RECIPE.extract(makeParams([text]));
    const records = result.fields.unitRecords as UnitRecord[];
    expect(records.length).toBe(2);
    expect(records[0].unitId).toBe('1A');
    expect(records[0].areaSf).toBe(336);
    expect(records[1].unitId).toBe('1B');
    expect(records[1].areaSf).toBe(472);
  });

  it('extracts "UNIT 2A 500 SF" pattern', async () => {
    const text = 'UNIT 2A 500 SF\nUNIT 2B 650 SF';
    const result = await FLOOR_PLAN_LABEL_RECIPE.extract(makeParams([text]));
    const records = result.fields.unitRecords as UnitRecord[];
    expect(records.length).toBe(2);
    const ids = records.map((r) => r.unitId).sort();
    expect(ids).toEqual(['2A', '2B']);
    const unitA = records.find((r) => r.unitId === '2A');
    expect(unitA?.areaSf).toBe(500);
  });

  it('extracts standard "STUDIO 450 SF" pattern', async () => {
    const text = 'STUDIO 450 SF\nONE-BEDROOM 650 SF';
    const result = await FLOOR_PLAN_LABEL_RECIPE.extract(makeParams([text]));
    expect(result.fields.unitCountsByType).toBeDefined();
    const counts = result.fields.unitCountsByType as Record<string, number>;
    expect(counts['Studio']).toBe(1);
    expect(counts['1BR']).toBe(1);
  });

  it('deduplicates same unit ID across patterns', async () => {
    const text = '336 SF UNIT 1A\nUNIT 1A 336 SF';
    const result = await FLOOR_PLAN_LABEL_RECIPE.extract(makeParams([text]));
    const records = result.fields.unitRecords as UnitRecord[];
    expect(records.length).toBe(1);
  });
});

describe('COVER_SHEET_RECIPE.match', () => {
  it('matches sheets with COVER SHEET title', () => {
    expect(COVER_SHEET_RECIPE.match(makeSheet(1, undefined, 'COVER SHEET'))).toBe(true);
  });

  it('matches sheets with TITLE SHEET title', () => {
    expect(COVER_SHEET_RECIPE.match(makeSheet(1, undefined, 'TITLE SHEET'))).toBe(true);
  });

  it('matches sheets with T-xxx drawing number', () => {
    expect(COVER_SHEET_RECIPE.match(makeSheet(1, 'T-001'))).toBe(true);
    expect(COVER_SHEET_RECIPE.match(makeSheet(1, 'T001'))).toBe(true);
  });

  it('rejects unrelated sheets', () => {
    expect(COVER_SHEET_RECIPE.match(makeSheet(1, 'A-101', 'FLOOR PLAN'))).toBe(false);
  });
});

describe('COVER_SHEET_RECIPE.extract', () => {
  function makeParams(pageTexts: string[]) {
    const positionedItems = new Map<number, PositionedTextItem[]>();
    const pageLines = new Map<number, PageLine[]>();
    const pages = pageTexts.map((_, i) => i + 1);
    for (let i = 0; i < pageTexts.length; i++) {
      positionedItems.set(i + 1, []);
      pageLines.set(i + 1, pageTexts[i].split('\n').map((text, y) => ({
        y: 700 - y * 20,
        items: [],
        text,
        page: i + 1,
      })));
    }
    return { pages, positionedItems, pageTexts, pageLines };
  }

  it('extracts lot area, FAR, units, floors from cover sheet text', async () => {
    const text = `PROJECT DATA
LOT AREA: 5,000 SF
FAR: 4.6
# OF UNITS: 16
# OF FLOORS: 5
BUILDING AREA: 23,000 SF
ZONE: R7A
BLOCK: 2508
LOT: 37
BIN: 2108765`;
    const result = await COVER_SHEET_RECIPE.extract(makeParams([text]));
    expect(result.recipe).toBe('COVER_SHEET');
    const cs = result.fields.coverSheet as CoverSheetExtraction;
    expect(cs.lotAreaSf).toBe(5000);
    expect(cs.far).toBe(4.6);
    expect(cs.totalUnits).toBe(16);
    expect(cs.floors).toBe(5);
    expect(cs.buildingAreaSf).toBe(23000);
    expect(cs.zone).toBe('R7A');
    expect(cs.block).toBe('2508');
    expect(cs.lot).toBe('37');
    expect(cs.bin).toBe('2108765');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('returns null fields when no data found', async () => {
    const text = 'Some random text with no project data';
    const result = await COVER_SHEET_RECIPE.extract(makeParams([text]));
    const cs = result.fields.coverSheet as CoverSheetExtraction;
    expect(cs.lotAreaSf).toBeNull();
    expect(cs.totalUnits).toBeNull();
    expect(result.confidence).toBe(0.3);
  });

  it('rejects implausible FAR values', async () => {
    const text = 'FAR: 50';
    const result = await COVER_SHEET_RECIPE.extract(makeParams([text]));
    const cs = result.fields.coverSheet as CoverSheetExtraction;
    expect(cs.far).toBeNull();
  });
});
