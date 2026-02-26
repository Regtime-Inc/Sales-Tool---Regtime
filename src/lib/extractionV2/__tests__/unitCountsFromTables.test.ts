import { describe, it, expect } from 'vitest';
import { extractUnitCountsFromTables } from '../signals/unitCountsFromTables';
import type { ClassifiedTable } from '../types';

function makeTable(overrides: Partial<ClassifiedTable>): ClassifiedTable {
  return {
    tableType: 'unit_schedule',
    confidence: 0.8,
    pageIndex: 1,
    tableIndex: 0,
    headers: ['UNIT', 'TYPE', 'SF'],
    rows: [],
    ...overrides,
  };
}

describe('extractUnitCountsFromTables', () => {
  it('excludes light_ventilation_schedule tables', () => {
    const tables = [
      makeTable({
        tableType: 'light_ventilation_schedule',
        headers: ['ROOM ID', 'NATURAL LIGHT', 'VENTILATION'],
        rows: [
          ['BEDROOM', '8', '12'],
          ['LIVING ROOM', '15', '20'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits).toBeNull();
    expect(result.unitMix).toBeNull();
  });

  it('counts unique unit IDs from unit_schedule tables', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'TYPE', 'SF'],
        rows: [
          ['1A', 'STUDIO', '450'],
          ['1B', '1BR', '650'],
          ['2A', 'STUDIO', '450'],
          ['2B', '1BR', '650'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits?.value).toBe(4);
  });

  it('deduplicates unit IDs', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'TYPE', 'SF'],
        rows: [
          ['1A', 'STUDIO', '450'],
          ['1A', 'STUDIO', '450'],
          ['1B', '1BR', '650'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits?.value).toBe(2);
  });

  it('skips TOTAL and SUBTOTAL rows', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'TYPE', 'SF'],
        rows: [
          ['1A', 'STUDIO', '450'],
          ['1B', '1BR', '650'],
          ['TOTAL', '', '1100'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits?.value).toBe(2);
  });

  it('returns null unitMix when no bedroom type column', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'SF', 'FLOOR'],
        rows: [
          ['1A', '450', '1'],
          ['1B', '650', '1'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits?.value).toBe(2);
    expect(result.unitMix).toBeNull();
  });

  it('tallies bedroom counts when column exists', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'BEDROOM', 'SF'],
        rows: [
          ['1A', 'STUDIO', '450'],
          ['1B', '1BR', '650'],
          ['2A', '1BR', '650'],
          ['2B', '2BR', '850'],
        ],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.unitMix?.value).toEqual({
      STUDIO: 1,
      '1BR': 2,
      '2BR': 1,
    });
  });

  it('returns both null when no unit_schedule tables', () => {
    const tables = [
      makeTable({
        tableType: 'zoning_table',
        headers: ['FAR', 'LOT AREA'],
        rows: [['3.44', '10000']],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.totalUnits).toBeNull();
    expect(result.unitMix).toBeNull();
    expect(result.unitRecords).toBeNull();
  });

  it('generates unit records with correct structure', () => {
    const tables = [
      makeTable({
        headers: ['UNIT', 'TYPE', 'SF'],
        rows: [['1A', 'STUDIO', '450']],
      }),
    ];
    const result = extractUnitCountsFromTables(tables);
    expect(result.unitRecords?.value).toHaveLength(1);
    const record = result.unitRecords!.value[0];
    expect(record.unitId).toBe('1A');
    expect(record.bedroomType).toBe('STUDIO');
    expect(record.allocation).toBe('UNKNOWN');
  });
});
