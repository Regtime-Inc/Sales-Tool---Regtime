import { describe, it, expect } from 'vitest';
import {
  extractUnitSchedule,
  extractZoningAnalysis,
  extractConversion,
  assessTextYield,
  buildExtraction,
} from '../parsers';

const SAMPLE_UNIT_TEXT = `
Unit Schedule
Unit Type    Count    NSF      GSF
Studio       20       450      520
1BR          30       650      750
2BR          15       850      980
3BR          5        1100     1250
`;

const SAMPLE_ZONING_TEXT = `
Zoning Analysis Summary
Lot Area: 12,500 SF
Maximum FAR: 6.0
Residential FAR: 4.6
Zoning Floor Area: 75,000 SF
Proposed Floor Area: 68,000 SF
`;

const SAMPLE_CONVERSION_TEXT = `
Conversion Breakdown
Pre-existing floor area: 25,000 SF
New construction area: 30,000 SF
Total floor area: 55,000 SF
`;

const SAMPLE_AFFORDABLE_TEXT = `
Studio  10  Affordable  400
1BR     20  Market      625
2BR     8   Affordable  800
`;

describe('extractUnitSchedule', () => {
  it('extracts unit types from tabular text', () => {
    const { rows } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    expect(rows.length).toBe(4);
    expect(rows[0].unitType.value).toBe('Studio');
    expect(rows[1].unitType.value).toBe('1BR');
    expect(rows[2].unitType.value).toBe('2BR');
    expect(rows[3].unitType.value).toBe('3BR');
  });

  it('extracts counts correctly', () => {
    const { rows } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    expect(rows[0].count.value).toBe(20);
    expect(rows[1].count.value).toBe(30);
    expect(rows[2].count.value).toBe(15);
    expect(rows[3].count.value).toBe(5);
  });

  it('extracts NSF values when present', () => {
    const { rows } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    expect(rows[0].nsf?.value).toBe(450);
    expect(rows[1].nsf?.value).toBe(650);
  });

  it('extracts GSF values when present', () => {
    const { rows } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    expect(rows[0].gsf?.value).toBe(520);
    expect(rows[2].gsf?.value).toBe(980);
  });

  it('assigns confidence scores', () => {
    const { rows } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    for (const row of rows) {
      expect(row.unitType.confidence).toBeGreaterThanOrEqual(0.5);
      expect(row.unitType.confidence).toBeLessThanOrEqual(1.0);
      expect(row.count.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('detects affordable vs market tenure', () => {
    const { rows } = extractUnitSchedule(SAMPLE_AFFORDABLE_TEXT, [SAMPLE_AFFORDABLE_TEXT]);
    expect(rows.length).toBe(3);
    expect(rows[0].affordableOrMarket?.value).toBe('Affordable');
    expect(rows[1].affordableOrMarket?.value).toBe('Market');
    expect(rows[2].affordableOrMarket?.value).toBe('Affordable');
  });

  it('generates evidence snippets', () => {
    const { snippets } = extractUnitSchedule(SAMPLE_UNIT_TEXT, [SAMPLE_UNIT_TEXT]);
    expect(snippets.length).toBe(4);
    expect(snippets[0].target).toBe('unitSchedule');
  });

  it('returns empty for text with no unit data', () => {
    const { rows } = extractUnitSchedule('Some random text about weather', []);
    expect(rows.length).toBe(0);
  });

  it('correctly classifies NSF/GSF when extra columns are present', () => {
    const multiColText = `
Studio  10  60  450  520  1200
1BR     15  80  650  750  1800
`;
    const { rows } = extractUnitSchedule(multiColText, [multiColText]);
    expect(rows.length).toBe(2);
    expect(rows[0].count.value).toBe(10);
    expect(rows[0].nsf?.value).toBe(450);
    expect(rows[0].gsf?.value).toBe(520);
    expect(rows[1].count.value).toBe(15);
    expect(rows[1].nsf?.value).toBe(650);
    expect(rows[1].gsf?.value).toBe(750);
  });

  it('handles lines where NSF > GSF by swapping them', () => {
    const swappedText = `
Studio  10  520  450
`;
    const { rows } = extractUnitSchedule(swappedText, [swappedText]);
    expect(rows.length).toBe(1);
    expect(rows[0].nsf?.value).toBe(450);
    expect(rows[0].gsf?.value).toBe(520);
  });

  it('does not misparse rent values as SF for single-number lines', () => {
    const rentOnlyText = `
Studio  25  3200
`;
    const { rows } = extractUnitSchedule(rentOnlyText, [rentOnlyText]);
    expect(rows.length).toBe(1);
    expect(rows[0].count.value).toBe(25);
  });
});

describe('extractZoningAnalysis', () => {
  it('extracts lot area', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    expect(zoning.lotArea).not.toBeNull();
    expect(zoning.lotArea!.value).toBe(12500);
  });

  it('extracts maximum FAR', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    expect(zoning.far).not.toBeNull();
    expect(zoning.far!.value).toBe(6.0);
  });

  it('extracts residential FAR', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    expect(zoning.residFar).not.toBeNull();
    expect(zoning.residFar!.value).toBe(4.6);
  });

  it('extracts zoning floor area', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    expect(zoning.zoningFloorArea).not.toBeNull();
    expect(zoning.zoningFloorArea!.value).toBe(75000);
  });

  it('extracts proposed floor area', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    expect(zoning.proposedFloorArea).not.toBeNull();
    expect(zoning.proposedFloorArea!.value).toBe(68000);
  });

  it('assigns confidence scores to all fields', () => {
    const { zoning } = extractZoningAnalysis(SAMPLE_ZONING_TEXT, [SAMPLE_ZONING_TEXT]);
    const fields = [zoning.lotArea, zoning.far, zoning.residFar, zoning.zoningFloorArea, zoning.proposedFloorArea];
    for (const f of fields) {
      expect(f).not.toBeNull();
      expect(f!.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('handles numbers with commas', () => {
    const text = 'Lot Area: 1,250,000 SF';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.lotArea!.value).toBe(1250000);
  });

  it('returns null fields for unmatched text', () => {
    const { zoning } = extractZoningAnalysis('No zoning info here', []);
    expect(zoning.lotArea).toBeNull();
    expect(zoning.far).toBeNull();
  });

  it('extracts total units from cover sheet', () => {
    const text = '# OF UNITS: 16';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.totalUnits).not.toBeNull();
    expect(zoning.totalUnits!.value).toBe(16);
  });

  it('extracts number of dwelling units', () => {
    const text = 'Number of dwelling units: 42';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.totalUnits).not.toBeNull();
    expect(zoning.totalUnits!.value).toBe(42);
  });

  it('extracts building area', () => {
    const text = 'Building Area: 28,500 SF';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.buildingArea).not.toBeNull();
    expect(zoning.buildingArea!.value).toBe(28500);
  });

  it('extracts bldg area shorthand', () => {
    const text = 'BLDG AREA: 15,000 SF';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.buildingArea).not.toBeNull();
    expect(zoning.buildingArea!.value).toBe(15000);
  });

  it('extracts number of floors', () => {
    const text = '# of floors: 5';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.floors).not.toBeNull();
    expect(zoning.floors!.value).toBe(5);
  });

  it('extracts stories count', () => {
    const text = 'Stories: 12';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.floors).not.toBeNull();
    expect(zoning.floors!.value).toBe(12);
  });

  it('extracts zone district', () => {
    const text = 'Zone: R7-2';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.zoneDistrict).not.toBeNull();
    expect(zoning.zoneDistrict!.value).toBe('R7-2');
  });

  it('extracts commercial zone district', () => {
    const text = 'Zone: C6-4A';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.zoneDistrict).not.toBeNull();
    expect(zoning.zoneDistrict!.value).toBe('C6-4A');
  });

  it('extracts BIN number', () => {
    const text = 'BIN: 3456789';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.bin).not.toBeNull();
    expect(zoning.bin!.value).toBe('3456789');
  });

  it('does not match BIN with wrong digit count', () => {
    const text = 'BIN: 12345';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.bin).toBeNull();
  });

  it('does not match the English word "far" followed by a number', () => {
    const text = `The site is so far 23 blocks from the subway.
Lot Area: 8,700 SF
Floor Area Ratio: 2.69
Zoning Floor Area: 23,403 SF`;
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.far).not.toBeNull();
    expect(zoning.far!.value).toBe(2.69);
  });

  it('skips out-of-range FAR values and picks valid one', () => {
    const text = `FAR 23,500 square feet maximum
Maximum FAR: 2.69`;
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.far).not.toBeNull();
    expect(zoning.far!.value).toBe(2.69);
  });

  it('rejects FAR when all matches are out of range', () => {
    const text = 'FAR: 23';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.far).toBeNull();
  });

  it('extracts dot-separated F.A.R.', () => {
    const text = 'F.A.R.: 4.0';
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.far).not.toBeNull();
    expect(zoning.far!.value).toBe(4.0);
  });

  it('extracts FAR when lot area and zoning floor area are nearby', () => {
    const text = `Lot Area: 8,700 SF
FAR: 2.69
Zoning Floor Area: 23,403 SF`;
    const { zoning } = extractZoningAnalysis(text, [text]);
    expect(zoning.far!.value).toBe(2.69);
    expect(zoning.lotArea!.value).toBe(8700);
    expect(zoning.zoningFloorArea!.value).toBe(23403);
  });
});

describe('extractConversion', () => {
  it('extracts pre-existing area', () => {
    const { conversion } = extractConversion(SAMPLE_CONVERSION_TEXT, [SAMPLE_CONVERSION_TEXT]);
    expect(conversion).not.toBeNull();
    expect(conversion!.preExistingArea!.value).toBe(25000);
  });

  it('extracts new area', () => {
    const { conversion } = extractConversion(SAMPLE_CONVERSION_TEXT, [SAMPLE_CONVERSION_TEXT]);
    expect(conversion!.newArea!.value).toBe(30000);
  });

  it('extracts total area', () => {
    const { conversion } = extractConversion(SAMPLE_CONVERSION_TEXT, [SAMPLE_CONVERSION_TEXT]);
    expect(conversion!.totalArea!.value).toBe(55000);
  });

  it('validates numeric reconciliation (pre-existing + new = total)', () => {
    const { conversion } = extractConversion(SAMPLE_CONVERSION_TEXT, [SAMPLE_CONVERSION_TEXT]);
    expect(conversion).not.toBeNull();
    const pre = conversion!.preExistingArea!.value;
    const nw = conversion!.newArea!.value;
    const total = conversion!.totalArea!.value;
    expect(pre + nw).toBe(total);
  });

  it('boosts confidence when values reconcile', () => {
    const { conversion } = extractConversion(SAMPLE_CONVERSION_TEXT, [SAMPLE_CONVERSION_TEXT]);
    expect(conversion).not.toBeNull();
    expect(conversion!.preExistingArea!.confidence).toBe(0.85);
    expect(conversion!.newArea!.confidence).toBe(0.85);
    expect(conversion!.totalArea!.confidence).toBe(0.85);
  });

  it('returns null when no conversion data present', () => {
    const { conversion } = extractConversion('No conversion info here', []);
    expect(conversion).toBeNull();
  });

  it('rejects commercial/retail area qualifiers', () => {
    const text = `
Commercial retail area: 8,000 SF
Total retail area: 12,000 SF
`;
    const { conversion } = extractConversion(text, [text]);
    expect(conversion).toBeNull();
  });

  it('requires SF unit suffix for new area regex', () => {
    const text = 'New 123 units proposed for the site';
    const { conversion } = extractConversion(text, [text]);
    expect(conversion).toBeNull();
  });
});

describe('assessTextYield', () => {
  it('returns high for text-rich pages', () => {
    const pages = ['A'.repeat(500), 'B'.repeat(400)];
    expect(assessTextYield(pages).yield).toBe('high');
  });

  it('returns low for sparse pages', () => {
    const pages = ['Short', 'Also short'];
    expect(assessTextYield(pages).yield).toBe('none');
  });

  it('returns none for empty page list', () => {
    expect(assessTextYield([]).yield).toBe('none');
  });
});

describe('buildExtraction', () => {
  const fullText = SAMPLE_UNIT_TEXT + '\n' + SAMPLE_ZONING_TEXT + '\n' + SAMPLE_CONVERSION_TEXT;

  it('produces complete extraction from combined text', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    expect(result.unitSchedule.length).toBe(4);
    expect(result.zoningAnalysis.lotArea).not.toBeNull();
    expect(result.conversion).not.toBeNull();
    expect(result.pageCount).toBe(3);
  });

  it('computes overall confidence', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    expect(result.overallConfidence).toBeGreaterThan(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
  });

  it('sets needsOcr = false for high-yield text', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    expect(result.needsOcr).toBe(false);
    expect(result.textYield).toBe('high');
  });

  it('sets needsOcr = true for empty text', () => {
    const result = buildExtraction('', [], 5);
    expect(result.needsOcr).toBe(true);
    expect(result.textYield).toBe('none');
  });

  it('collects raw snippets from all extraction types', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    const targets = new Set(result.rawSnippets.map((s) => s.target));
    expect(targets.has('unitSchedule')).toBe(true);
    expect(targets.has('zoningAnalysis')).toBe(true);
    expect(targets.has('conversion')).toBe(true);
  });

  it('numeric reconciliation: unit counts are positive integers', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    for (const row of result.unitSchedule) {
      expect(Number.isInteger(row.count.value)).toBe(true);
      expect(row.count.value).toBeGreaterThan(0);
    }
  });

  it('numeric reconciliation: zoning values are positive', () => {
    const result = buildExtraction(fullText, [fullText], 3);
    const z = result.zoningAnalysis;
    if (z.lotArea) expect(z.lotArea.value).toBeGreaterThan(0);
    if (z.far) expect(z.far.value).toBeGreaterThan(0);
    if (z.zoningFloorArea) expect(z.zoningFloorArea.value).toBeGreaterThan(0);
  });
});
