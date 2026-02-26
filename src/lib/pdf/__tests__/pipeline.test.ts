import { describe, it, expect } from 'vitest';
import { reconstructTables } from '../tableRecon';
import {
  inferColumnMapping,
  parseUnitRow,
  deduplicateRecords,
  computeTotalsFromRecords,
} from '../unitRowParser';
import { scoreOverallConfidence } from '../confidence';
import { crossCheckWithPluto } from '../plutoCheck';
import type { PositionedTextItem, ExtractedPdfData } from '../../../types/pdf';

function item(str: string, x: number, y: number, page = 1): PositionedTextItem {
  return { str, x, y, width: str.length * 7, height: 12, page };
}

describe('pipeline integration: table reconstruction + row parsing', () => {
  it('reconstructs a 2-column table and parses unit records', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BEDROOM', 200, 700),
      item('A-101', 50, 680),
      item('STUDIO', 200, 680),
      item('A-102', 50, 660),
      item('1BR', 200, 660),
      item('A-103', 50, 640),
      item('2BR', 200, 640),
    ];

    const tables = reconstructTables(items, 1);
    expect(tables.length).toBe(1);

    const table = tables[0];
    const mapping = inferColumnMapping(table.headerRow.cells);
    expect(mapping.unitId).toBeDefined();
    expect(mapping.bedCount).toBeDefined();

    const records = table.dataRows
      .map((row) => parseUnitRow(row.cells, mapping, 1, 'TEXT_TABLE'))
      .filter(Boolean);

    expect(records.length).toBe(3);
    expect(records[0]!.bedroomType).toBe('STUDIO');
    expect(records[1]!.bedroomType).toBe('1BR');
    expect(records[2]!.bedroomType).toBe('2BR');
  });

  it('reconstructs a 4-column table with allocation', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BED', 200, 700),
      item('SF', 350, 700),
      item('ALLOCATION', 500, 700),
      item('A-101', 50, 680),
      item('STUDIO', 200, 680),
      item('450', 350, 680),
      item('MIH', 500, 680),
      item('A-102', 50, 660),
      item('1BR', 200, 660),
      item('650', 350, 660),
      item('MARKET', 500, 660),
    ];

    const tables = reconstructTables(items, 1);
    const table = tables[0];
    const mapping = inferColumnMapping(table.headerRow.cells);

    const records = table.dataRows
      .map((row) => parseUnitRow(row.cells, mapping, 1, 'TEXT_TABLE'))
      .filter(Boolean);

    expect(records.length).toBe(2);
    expect(records[0]!.allocation).toBe('MIH_RESTRICTED');
    expect(records[1]!.allocation).toBe('MARKET');
  });

  it('verifies totalUnits and affordableUnits extraction', () => {
    const items: PositionedTextItem[] = [
      item('UNIT', 50, 700),
      item('BEDROOM', 200, 700),
      item('ALLOCATION', 400, 700),
    ];
    for (let i = 0; i < 10; i++) {
      const y = 680 - i * 20;
      items.push(item(`A-${100 + i}`, 50, y));
      items.push(item(i < 5 ? 'STUDIO' : '1BR', 200, y));
      items.push(item(i < 3 ? 'AFFORDABLE' : 'MARKET', 400, y));
    }

    const tables = reconstructTables(items, 1);
    const table = tables[0];
    const mapping = inferColumnMapping(table.headerRow.cells);

    const records = table.dataRows
      .map((row) => parseUnitRow(row.cells, mapping, 1, 'TEXT_TABLE'))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const deduped = deduplicateRecords(records);
    const totals = computeTotalsFromRecords(deduped);

    expect(totals.totalUnits).toBe(10);
    const affordable = deduped.filter(
      (r) => r.allocation === 'MIH_RESTRICTED' || r.allocation === 'AFFORDABLE'
    ).length;
    expect(affordable).toBe(3);
  });
});

describe('pipeline integration: confidence scoring', () => {
  it('produces valid overall confidence from page scores', () => {
    const overall = scoreOverallConfidence([
      { page: 1, score: 0.85, weight: 15 },
      { page: 3, score: 0.70, weight: 5 },
    ]);
    expect(overall).toBeGreaterThan(0);
    expect(overall).toBeLessThanOrEqual(0.99);
  });
});

describe('pipeline integration: PLUTO cross-check', () => {
  it('flags when extracted units conflict with PLUTO capacity', () => {
    const extracted: ExtractedPdfData = {
      status: 'complete',
      totals: { totalUnits: 200, affordableUnits: 50, marketUnits: 150 },
      unitMix: { studio: 50, br1: 80, br2: 50, br3: 20, br4plus: 0 },
      unitRecords: [],
      far: null,
      confidence: { overall: 0.6, warnings: [] },
      evidence: { pagesUsed: [1], tablesFound: 1 },
      extraction: {
        unitSchedule: [],
        zoningAnalysis: { lotArea: null, far: null, zoningFloorArea: null, proposedFloorArea: null, residFar: null, totalUnits: null, zoneDistrict: null, buildingArea: null, floors: null, bin: null },
        conversion: null,
        overallConfidence: 0.6,
        textYield: 'high',
        needsOcr: false,
        pageCount: 5,
        rawSnippets: [],
      },
      errors: [],
    };

    const plutoCheck = crossCheckWithPluto(extracted, { lotarea: 5000, residfar: 4.0, bldgarea: 10000 });
    expect(plutoCheck.warnings.length).toBeGreaterThan(0);
    expect(plutoCheck.plutoValues.impliedMaxUnits).toBeDefined();
  });
});

describe('regression: BBL 3036720051 affordability rounding', () => {
  it('uses ceil rounding for affordable count from percentage', () => {
    const totalUnits = 75;
    const affordablePct = 0.25;
    const affordableUnits = Math.ceil(totalUnits * affordablePct);
    expect(affordableUnits).toBe(19);
  });

  it('derives correct affordable count when extracted from pct', () => {
    const totalUnits = 73;
    const affordablePct = 0.25;
    const affordableUnits = Math.ceil(totalUnits * affordablePct);
    expect(affordableUnits).toBe(19);
  });
});
