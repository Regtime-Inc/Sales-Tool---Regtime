import { describe, it, expect } from 'vitest';
import {
  inferColumnMapping,
  parseUnitRow,
  parseUnitRowPositional,
  extractTotalsRow,
  deduplicateRecords,
  computeTotalsFromRecords,
  extractFarFromLines,
} from '../unitRowParser';
import type { PageTableRow, UnitRecord, PageLine } from '../../../types/pdf';

describe('inferColumnMapping', () => {
  it('maps UNIT header to unitId column', () => {
    const cells = [
      { text: 'UNIT' },
      { text: 'BEDROOM' },
      { text: 'SF' },
      { text: 'ALLOCATION' },
    ];
    const mapping = inferColumnMapping(cells);
    expect(mapping.unitId).toBe(0);
    expect(mapping.bedCount).toBe(1);
    expect(mapping.area).toBe(2);
    expect(mapping.allocation).toBe(3);
  });

  it('handles APT synonym', () => {
    const cells = [{ text: 'APT' }, { text: 'BED' }, { text: 'AMI' }];
    const mapping = inferColumnMapping(cells);
    expect(mapping.unitId).toBe(0);
    expect(mapping.bedCount).toBe(1);
    expect(mapping.amiBand).toBe(2);
  });

  it('returns empty mapping for unrecognized headers', () => {
    const cells = [{ text: 'FOO' }, { text: 'BAR' }];
    const mapping = inferColumnMapping(cells);
    expect(mapping.unitId).toBeUndefined();
    expect(mapping.bedCount).toBeUndefined();
  });
});

describe('parseUnitRow', () => {
  it('parses a studio row', () => {
    const cells = [{ text: 'A-101' }, { text: 'STUDIO' }, { text: 'AFFORDABLE' }];
    const mapping = { unitId: 0, bedCount: 1, allocation: 2 };
    const record = parseUnitRow(cells, mapping, 5, 'TEXT_TABLE');
    expect(record).not.toBeNull();
    expect(record!.bedroomType).toBe('STUDIO');
    expect(record!.bedroomCount).toBe(0);
    expect(record!.allocation).toBe('MIH_RESTRICTED');
    expect(record!.source.page).toBe(5);
    expect(record!.source.method).toBe('TEXT_TABLE');
  });

  it('parses a 1BR row with AMI band', () => {
    const cells = [{ text: '2A' }, { text: '1 BR' }, { text: '60% AMI' }, { text: 'MIH' }];
    const mapping = { unitId: 0, bedCount: 1, amiBand: 2, allocation: 3 };
    const record = parseUnitRow(cells, mapping, 12, 'TEXT_TABLE');
    expect(record).not.toBeNull();
    expect(record!.bedroomType).toBe('1BR');
    expect(record!.amiBand).toBe(60);
  });

  it('detects market allocation', () => {
    const cells = [{ text: 'B-201' }, { text: '2BR' }, { text: 'MARKET' }];
    const mapping = { unitId: 0, bedCount: 1, allocation: 2 };
    const record = parseUnitRow(cells, mapping, 3, 'TEXT_TABLE');
    expect(record!.allocation).toBe('MARKET');
  });

  it('skips TOTAL rows', () => {
    const cells = [{ text: 'TOTAL' }, { text: '75' }];
    const record = parseUnitRow(cells, {}, 1, 'TEXT_TABLE');
    expect(record).toBeNull();
  });

  it('skips empty rows', () => {
    const cells = [{ text: '' }];
    const record = parseUnitRow(cells, {}, 1, 'TEXT_TABLE');
    expect(record).toBeNull();
  });

  it('stores areaSf when area column is mapped', () => {
    const cells = [{ text: 'A-101' }, { text: '1BR' }, { text: '650 SF' }, { text: 'MARKET' }];
    const mapping = { unitId: 0, bedCount: 1, area: 2, allocation: 3 };
    const record = parseUnitRow(cells, mapping, 3, 'TEXT_TABLE');
    expect(record).not.toBeNull();
    expect(record!.areaSf).toBe(650);
  });

  it('detects area from fullText when no area column mapped', () => {
    const cells = [{ text: 'A-101' }, { text: 'STUDIO' }, { text: '450 SF' }];
    const record = parseUnitRow(cells, { unitId: 0, bedCount: 1 }, 3, 'TEXT_TABLE');
    expect(record).not.toBeNull();
    expect(record!.areaSf).toBe(450);
  });
});

describe('parseUnitRowPositional', () => {
  it('parses a line with unit id, bedroom, and allocation', () => {
    const record = parseUnitRowPositional('A-101 STUDIO AFFORDABLE', 5, 'TEXT_REGEX');
    expect(record).not.toBeNull();
    expect(record!.bedroomType).toBe('STUDIO');
  });

  it('parses a line with numeric bed count', () => {
    const record = parseUnitRowPositional('302 2BR MIH 60% AMI', 8, 'TEXT_REGEX');
    expect(record).not.toBeNull();
    expect(record!.bedroomType).toBe('2BR');
    expect(record!.amiBand).toBe(60);
  });

  it('returns null for unstructured text', () => {
    expect(parseUnitRowPositional('Random note', 1, 'TEXT_REGEX')).toBeNull();
  });

  it('skips TOTAL lines', () => {
    expect(parseUnitRowPositional('TOTAL 75 UNITS', 1, 'TEXT_REGEX')).toBeNull();
  });

  it('stores areaSf from positional parse', () => {
    const record = parseUnitRowPositional('5A STUDIO 450', 3, 'TEXT_REGEX');
    expect(record).not.toBeNull();
    expect(record!.areaSf).toBe(450);
  });

  it('stores areaSf for larger area values', () => {
    const record = parseUnitRowPositional('12B 2BR 850', 5, 'TEXT_REGEX');
    expect(record).not.toBeNull();
    expect(record!.areaSf).toBe(850);
  });
});

describe('extractTotalsRow', () => {
  it('extracts total from a TOTAL row', () => {
    const rows: PageTableRow[] = [
      { cells: [{ text: 'A-101', x0: 0, x1: 50 }, { text: '1BR', x0: 60, x1: 100 }], rowText: 'A-101 1BR', y: 500, page: 1 },
      { cells: [{ text: 'TOTAL', x0: 0, x1: 50 }, { text: '75', x0: 60, x1: 100 }], rowText: 'TOTAL 75', y: 400, page: 1 },
    ];
    const result = extractTotalsRow(rows);
    expect(result).not.toBeNull();
    expect(result!.totalUnits).toBe(75);
  });

  it('returns null when no total row', () => {
    const rows: PageTableRow[] = [
      { cells: [{ text: 'A-101', x0: 0, x1: 50 }], rowText: 'A-101', y: 500, page: 1 },
    ];
    expect(extractTotalsRow(rows)).toBeNull();
  });
});

describe('deduplicateRecords', () => {
  it('removes duplicate unit IDs keeping richer record', () => {
    const records: UnitRecord[] = [
      { unitId: 'A-101', bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
      { unitId: 'A-101', bedroomType: '1BR', bedroomCount: 1, allocation: 'MARKET', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
    ];
    const deduped = deduplicateRecords(records);
    expect(deduped.length).toBe(1);
    expect(deduped[0].bedroomType).toBe('1BR');
  });

  it('keeps records without unit IDs', () => {
    const records: UnitRecord[] = [
      { bedroomType: '1BR', allocation: 'MARKET', source: { page: 1, method: 'TEXT_REGEX', evidence: '' } },
      { bedroomType: '2BR', allocation: 'MARKET', source: { page: 1, method: 'TEXT_REGEX', evidence: '' } },
    ];
    expect(deduplicateRecords(records).length).toBe(2);
  });
});

describe('computeTotalsFromRecords', () => {
  it('computes correct totals', () => {
    const records: UnitRecord[] = [
      { bedroomType: 'STUDIO', allocation: 'MIH_RESTRICTED', amiBand: 60, source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
      { bedroomType: '1BR', allocation: 'MARKET', source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
      { bedroomType: '1BR', allocation: 'MIH_RESTRICTED', amiBand: 80, source: { page: 1, method: 'TEXT_TABLE', evidence: '' } },
    ];
    const totals = computeTotalsFromRecords(records);
    expect(totals.totalUnits).toBe(3);
    expect(totals.byBedroomType['STUDIO']).toBe(1);
    expect(totals.byBedroomType['1BR']).toBe(2);
    expect(totals.byAllocation['MIH_RESTRICTED']).toBe(2);
    expect(totals.byAllocation['MARKET']).toBe(1);
    expect(totals.byAmiBand?.['60%']).toBe(1);
    expect(totals.byAmiBand?.['80%']).toBe(1);
  });
});

describe('extractFarFromLines', () => {
  it('extracts FAR from zoning analysis lines', () => {
    const lines: PageLine[] = [
      { y: 700, items: [], text: 'LOT AREA: 12,000 SF', page: 3 },
      { y: 680, items: [], text: 'ZONING FLOOR AREA: 95,000 SF', page: 3 },
      { y: 660, items: [], text: 'FAR: 7.92', page: 3 },
    ];
    const result = extractFarFromLines(lines, 3);
    expect(result).not.toBeNull();
    expect(result!.lotAreaSf).toBe(12000);
    expect(result!.zoningFloorAreaSf).toBe(95000);
    expect(result!.proposedFAR).toBe(7.92);
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('computes FAR when only lot area and proposed area given', () => {
    const lines: PageLine[] = [
      { y: 700, items: [], text: 'LOT AREA: 10,000 SF', page: 3 },
      { y: 680, items: [], text: 'PROPOSED FLOOR AREA: 60,000 SF', page: 3 },
    ];
    const result = extractFarFromLines(lines, 3);
    expect(result).not.toBeNull();
    expect(result!.proposedFAR).toBe(6);
  });

  it('returns null when no FAR data found', () => {
    const lines: PageLine[] = [
      { y: 700, items: [], text: 'General Notes', page: 1 },
    ];
    expect(extractFarFromLines(lines, 1)).toBeNull();
  });

  it('rejects out-of-range FAR values', () => {
    const lines: PageLine[] = [
      { y: 700, items: [], text: 'FAR: 25', page: 1 },
    ];
    const result = extractFarFromLines(lines, 1);
    expect(result).toBeNull();
  });
});
