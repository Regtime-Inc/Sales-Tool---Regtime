import { describe, it, expect } from 'vitest';
import { extractDeclaredUnits, sanitizeExtraction, type Extraction } from '../sanitizeLlmExtraction';

function makePage(page: number, type: string, text: string) {
  return { page, type, text };
}

function makeExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    totals: { totalUnits: 10, affordableUnits: 3, marketUnits: 7 },
    unitMix: { studio: 2, br1: 4, br2: 3, br3: 1, br4plus: null },
    unitRecords: [],
    zoning: { lotAreaSf: 5000, zoningFloorAreaSf: 20000, far: 4.0, zone: "R7A", maxFar: 4.6 },
    building: { floors: 7, buildingAreaSf: 20000, block: "123", lot: "45", bin: "1234567", occupancyGroup: "R-2", constructionClass: "1A", scopeOfWork: "NB" },
    confidence: { overall: 0.85, warnings: [] },
    ...overrides,
  };
}

function makeRecord(unitId: string, areaSf: number, bedroomType = "1BR", floor: string | null = null) {
  return { unitId, areaSf, bedroomType, floor };
}

describe('extractDeclaredUnits', () => {
  it('extracts from "# OF UNITS: 14" on a COVER_SHEET page', () => {
    const pages = [makePage(1, 'COVER_SHEET', 'PROJECT INFO\n# OF UNITS: 14\nFLOORS: 7')];
    expect(extractDeclaredUnits(pages)).toBe(14);
  });

  it('extracts from "PROPOSED 20 UNIT" text', () => {
    const pages = [makePage(1, 'GENERAL', 'PROPOSED 20 UNIT RESIDENTIAL BUILDING')];
    expect(extractDeclaredUnits(pages)).toBe(20);
  });

  it('extracts from "14 UNIT APARTMENT BUILDING"', () => {
    const pages = [makePage(1, 'GENERAL', 'NEW 14 UNIT APARTMENT BUILDING')];
    expect(extractDeclaredUnits(pages)).toBe(14);
  });

  it('extracts from "TOTAL DWELLING UNITS: 8"', () => {
    const pages = [makePage(1, 'COVER_SHEET', 'TOTAL DWELLING UNITS: 8')];
    expect(extractDeclaredUnits(pages)).toBe(8);
  });

  it('extracts from "16 DWELLING UNITS"', () => {
    const pages = [makePage(1, 'GENERAL', 'A 16 DWELLING UNITS PROJECT')];
    expect(extractDeclaredUnits(pages)).toBe(16);
  });

  it('returns null when no match exists', () => {
    const pages = [makePage(1, 'GENERAL', 'ZONING COMPLIANCE TABLE FAR: 4.6')];
    expect(extractDeclaredUnits(pages)).toBeNull();
  });

  it('rejects implausible values (0)', () => {
    const pages = [makePage(1, 'COVER_SHEET', '# OF UNITS: 0')];
    expect(extractDeclaredUnits(pages)).toBeNull();
  });

  it('rejects implausible values (600)', () => {
    const pages = [makePage(1, 'COVER_SHEET', '# OF UNITS: 600')];
    expect(extractDeclaredUnits(pages)).toBeNull();
  });

  it('prefers COVER_SHEET pages over GENERAL pages', () => {
    const pages = [
      makePage(1, 'GENERAL', '# OF UNITS: 99'),
      makePage(2, 'COVER_SHEET', '# OF UNITS: 14'),
    ];
    expect(extractDeclaredUnits(pages)).toBe(14);
  });

  it('falls back to all pages when no COVER_SHEET exists', () => {
    const pages = [
      makePage(1, 'ZONING', '# OF UNITS: 12'),
      makePage(2, 'GENERAL', 'SOME OTHER TEXT'),
    ];
    expect(extractDeclaredUnits(pages)).toBe(12);
  });
});

describe('sanitizeExtraction', () => {
  it('deduplicates unitRecords by normalized unitId', () => {
    const ext = makeExtraction({
      unitRecords: [
        makeRecord('1A', 500),
        makeRecord(' 1a ', 500),
        makeRecord('2A', 600),
      ],
    });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords).toHaveLength(2);
    expect(result.unitRecords.map((r) => r.unitId)).toEqual(['1A', '2A']);
  });

  it('filters records with areaSf < 150', () => {
    const ext = makeExtraction({
      unitRecords: [makeRecord('1A', 100), makeRecord('2A', 500)],
    });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords).toHaveLength(1);
    expect(result.unitRecords[0].unitId).toBe('2A');
  });

  it('filters records with areaSf > 5000', () => {
    const ext = makeExtraction({
      unitRecords: [makeRecord('1A', 5500), makeRecord('2A', 500)],
    });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords).toHaveLength(1);
    expect(result.unitRecords[0].unitId).toBe('2A');
  });

  it('filters metadata-token unitIds', () => {
    const ext = makeExtraction({
      unitRecords: [
        makeRecord('BLOCK', 500),
        makeRecord('LOT', 400),
        makeRecord('TOTAL', 600),
        makeRecord('1A', 500),
      ],
    });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords).toHaveLength(1);
    expect(result.unitRecords[0].unitId).toBe('1A');
  });

  it('caps records when exceeding 1.5x declared units', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(`${Math.floor(i / 2 + 1)}${i % 2 === 0 ? 'A' : 'B'}`, 500 + i * 10, '1BR')
    );
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, 10);
    expect(result.unitRecords).toHaveLength(10);
  });

  it('does not cap when within 1.5x of declared units', () => {
    const records = Array.from({ length: 14 }, (_, i) =>
      makeRecord(`${i + 1}A`, 500 + i * 10, '1BR')
    );
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, 10);
    expect(result.unitRecords).toHaveLength(14);
  });

  it('recomputes unitMix after capping', () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) => makeRecord(`${i + 1}A`, 450, 'STUDIO')),
      ...Array.from({ length: 10 }, (_, i) => makeRecord(`${i + 1}B`, 550, '1BR')),
      ...Array.from({ length: 10 }, (_, i) => makeRecord(`${i + 1}C`, 800, '2BR')),
    ];
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, 10);
    expect(result.unitRecords).toHaveLength(10);
    expect(result.totals.totalUnits).toBe(10);
    const mixTotal = (result.unitMix.studio ?? 0) + (result.unitMix.br1 ?? 0) +
      (result.unitMix.br2 ?? 0) + (result.unitMix.br3 ?? 0) + (result.unitMix.br4plus ?? 0);
    expect(mixTotal).toBe(10);
  });

  it('adds warning when capping is applied', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(`${i + 1}A`, 500, '1BR')
    );
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, 10);
    expect(result.confidence.warnings).toContainEqual(
      expect.stringContaining('exceeded cover-sheet units (10)')
    );
  });

  it('reduces confidence when capping is applied', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      makeRecord(`${i + 1}A`, 500, '1BR')
    );
    const ext = makeExtraction({
      unitRecords: records,
      confidence: { overall: 0.9, warnings: [] },
    });
    const result = sanitizeExtraction(ext, 10);
    expect(result.confidence.overall).toBeLessThanOrEqual(0.6);
  });

  it('preserves all required schema keys', () => {
    const ext = makeExtraction({ unitRecords: [] });
    const result = sanitizeExtraction(ext, null);
    expect(result).toHaveProperty('totals');
    expect(result).toHaveProperty('unitMix');
    expect(result).toHaveProperty('unitRecords');
    expect(result).toHaveProperty('zoning');
    expect(result).toHaveProperty('building');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toHaveProperty('overall');
    expect(result.confidence).toHaveProperty('warnings');
  });

  it('normalizes invalid bedroomType to UNKNOWN', () => {
    const ext = makeExtraction({
      unitRecords: [makeRecord('1A', 500, 'INVALID_TYPE')],
    });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords[0].bedroomType).toBe('UNKNOWN');
  });

  it('sorts by floor before capping (lower floors kept first)', () => {
    const records = [
      makeRecord('PH1', 500, '1BR'),
      makeRecord('1A', 500, '1BR'),
      makeRecord('3A', 500, '1BR'),
      makeRecord('2A', 500, '1BR'),
    ];
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, 2);
    expect(result.unitRecords[0].unitId).toBe('1A');
    expect(result.unitRecords[1].unitId).toBe('2A');
  });

  it('does not cap when declaredUnits is null', () => {
    const records = Array.from({ length: 50 }, (_, i) =>
      makeRecord(`${i + 1}A`, 500, '1BR')
    );
    const ext = makeExtraction({ unitRecords: records });
    const result = sanitizeExtraction(ext, null);
    expect(result.unitRecords).toHaveLength(50);
  });
});
