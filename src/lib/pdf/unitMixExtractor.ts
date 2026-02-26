import type {
  BedroomType,
  AllocationKind,
  UnitRecord,
  UnitMixTotals,
  UnitMixConfidence,
  UnitMixExtraction,
  ExtractionMethod,
  PageTableRow,
  PageLine,
  OcrPageResult,
  PositionedTextItem,
} from '../../types/pdf';
import {
  groupItemsIntoLines,
  linesToTableRows,
  detectCandidatePages,
  detectHeaderRow,
  type DetectedColumns,
} from './pageTextLayout';

const BEDROOM_PATTERNS: Array<{ type: BedroomType; count: number; regex: RegExp }> = [
  { type: 'STUDIO', count: 0, regex: /\b(STUDIO|EFF|EFFICIENCY|0\s*BR|0\s*BED)\b/i },
  { type: '1BR', count: 1, regex: /\b1(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '2BR', count: 2, regex: /\b2(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '3BR', count: 3, regex: /\b3(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '4BR_PLUS', count: 4, regex: /\b[4-6](\.\d+)?\s*(BR|BED(ROOM)?)\b/i },
];

const UNIT_ID_REGEX = /\b(?:UNIT|APT)\s*([A-Z0-9][A-Z0-9\-]*)\b/i;
const STANDALONE_UNIT_ID = /\b([A-Z]\d{1,2}[-]\d{2,3}|\d{1,2}[A-Z]|PH\d*)\b/;

const MIH_ALLOCATION_REGEX = /\b(MIH|INCLUSIONARY|RESTRICTED|AFFORDABLE)\b/i;
const MARKET_ALLOCATION_REGEX = /\b(MARKET|FREE\s*MARKET|MR)\b/i;
const AMI_BAND_REGEX = /\b(40|50|60|70|80|90|100)\s*%?\s*AMI\b/i;

function detectBedroomType(text: string): { type: BedroomType; count?: number } {
  for (const bp of BEDROOM_PATTERNS) {
    if (bp.regex.test(text)) return { type: bp.type, count: bp.count };
  }
  return { type: 'UNKNOWN' };
}

function detectAllocation(text: string): AllocationKind {
  if (MIH_ALLOCATION_REGEX.test(text)) return 'MIH_RESTRICTED';
  if (MARKET_ALLOCATION_REGEX.test(text)) return 'MARKET';
  return 'UNKNOWN';
}

function detectAmiBand(text: string): number | undefined {
  const m = AMI_BAND_REGEX.exec(text);
  return m ? parseInt(m[1], 10) : undefined;
}

function detectUnitId(text: string): string | undefined {
  const m = UNIT_ID_REGEX.exec(text);
  if (m) return m[1];
  const s = STANDALONE_UNIT_ID.exec(text);
  return s ? s[1] : undefined;
}

function parseRecordsFromTableRows(
  rows: PageTableRow[],
  columns: DetectedColumns,
  headerIndex: number,
  page: number
): UnitRecord[] {
  const records: UnitRecord[] = [];

  for (let ri = headerIndex + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.cells.length === 0) continue;
    if (row.rowText.trim().length < 3) continue;

    const fullText = row.rowText;
    const bed = columns.bedroom !== undefined && row.cells[columns.bedroom]
      ? detectBedroomType(row.cells[columns.bedroom].text)
      : detectBedroomType(fullText);

    if (bed.type === 'UNKNOWN' && !/\d/.test(fullText)) continue;

    const allocation = columns.allocation !== undefined && row.cells[columns.allocation]
      ? detectAllocation(row.cells[columns.allocation].text)
      : detectAllocation(fullText);

    const ami = columns.ami !== undefined && row.cells[columns.ami]
      ? detectAmiBand(row.cells[columns.ami].text)
      : detectAmiBand(fullText);

    const unitId = columns.unitId !== undefined && row.cells[columns.unitId]
      ? row.cells[columns.unitId].text.trim()
      : detectUnitId(fullText);

    records.push({
      unitId,
      bedroomType: bed.type,
      bedroomCount: bed.count,
      allocation,
      amiBand: ami,
      source: {
        page,
        method: 'TEXT_TABLE' as ExtractionMethod,
        evidence: fullText.substring(0, 200),
      },
    });
  }

  return records;
}

function parseRecordsFromText(
  lines: string[],
  page: number,
  method: ExtractionMethod
): UnitRecord[] {
  const records: UnitRecord[] = [];
  const countPattern = /\b(\d{1,3})\s*(STUDIO|EFF|0\s*BR|1\s*BR|2\s*BR|3\s*BR|4\s*BR|BEDROOM)/i;
  const reversePattern = /(STUDIO|EFF|0\s*BR|1\s*BR|2\s*BR|3\s*BR|4\s*BR)[:\s]*(\d{1,3})\s*(?:UNIT|DU)?/i;

  for (const line of lines) {
    const countMatch = countPattern.exec(line);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      const bed = detectBedroomType(countMatch[2]);
      const allocation = detectAllocation(line);
      const ami = detectAmiBand(line);
      for (let i = 0; i < Math.min(count, 500); i++) {
        records.push({
          bedroomType: bed.type,
          bedroomCount: bed.count,
          allocation,
          amiBand: ami,
          notes: count > 1 ? `${count} units from summary line` : undefined,
          source: { page, method, evidence: line.substring(0, 200) },
        });
      }
      continue;
    }

    const reverseMatch = reversePattern.exec(line);
    if (reverseMatch) {
      const bed = detectBedroomType(reverseMatch[1]);
      const count = parseInt(reverseMatch[2], 10);
      const allocation = detectAllocation(line);
      const ami = detectAmiBand(line);
      for (let i = 0; i < Math.min(count, 500); i++) {
        records.push({
          bedroomType: bed.type,
          bedroomCount: bed.count,
          allocation,
          amiBand: ami,
          notes: count > 1 ? `${count} units from summary line` : undefined,
          source: { page, method, evidence: line.substring(0, 200) },
        });
      }
      continue;
    }

    const bed = detectBedroomType(line);
    if (bed.type !== 'UNKNOWN') {
      const allocation = detectAllocation(line);
      const ami = detectAmiBand(line);
      const unitId = detectUnitId(line);
      records.push({
        unitId,
        bedroomType: bed.type,
        bedroomCount: bed.count,
        allocation,
        amiBand: ami,
        source: { page, method, evidence: line.substring(0, 200) },
      });
    }
  }

  return records;
}

function computeTotals(records: UnitRecord[]): UnitMixTotals {
  const byBedroomType: Record<string, number> = {};
  const byAllocation: Record<string, number> = {};
  const byAllocationAndBedroom: Record<string, Record<string, number>> = {};
  const byAmiBand: Record<string, number> = {};

  for (const r of records) {
    byBedroomType[r.bedroomType] = (byBedroomType[r.bedroomType] || 0) + 1;
    byAllocation[r.allocation] = (byAllocation[r.allocation] || 0) + 1;

    if (!byAllocationAndBedroom[r.allocation]) {
      byAllocationAndBedroom[r.allocation] = {};
    }
    byAllocationAndBedroom[r.allocation][r.bedroomType] =
      (byAllocationAndBedroom[r.allocation][r.bedroomType] || 0) + 1;

    if (r.amiBand !== undefined) {
      const key = `${r.amiBand}%`;
      byAmiBand[key] = (byAmiBand[key] || 0) + 1;
    }
  }

  return {
    totalUnits: records.length,
    byBedroomType,
    byAllocation,
    byAllocationAndBedroom,
    byAmiBand: Object.keys(byAmiBand).length > 0 ? byAmiBand : undefined,
  };
}

function computeConfidence(
  records: UnitRecord[],
  candidatePages: number[],
  hasTableData: boolean,
  isOcr: boolean
): UnitMixConfidence {
  const warnings: string[] = [];
  const byPage: Record<string, number> = {};

  if (records.length === 0) {
    warnings.push('No unit records could be extracted');
    return { overall: 0, byPage: {}, warnings };
  }

  const unknownBed = records.filter((r) => r.bedroomType === 'UNKNOWN').length;
  const unknownAlloc = records.filter((r) => r.allocation === 'UNKNOWN').length;

  if (unknownBed > records.length * 0.3) {
    warnings.push(`${unknownBed} of ${records.length} units have undetected bedroom types`);
  }
  if (unknownAlloc > records.length * 0.5) {
    warnings.push(`${unknownAlloc} of ${records.length} units have undetected allocations`);
  }

  let base = hasTableData ? 0.85 : 0.6;
  if (isOcr) base *= 0.75;

  const bedPenalty = (unknownBed / records.length) * 0.2;
  const allocPenalty = (unknownAlloc / records.length) * 0.15;
  const overall = Math.max(0.1, Math.min(1, base - bedPenalty - allocPenalty));

  for (const page of candidatePages) {
    const pageRecords = records.filter((r) => r.source.page === page);
    if (pageRecords.length > 0) {
      const pageUnknown = pageRecords.filter((r) => r.bedroomType === 'UNKNOWN').length;
      byPage[String(page)] = Math.max(0.1, base - (pageUnknown / pageRecords.length) * 0.3);
    }
  }

  return { overall: Math.round(overall * 100) / 100, byPage, warnings };
}

export function extractUnitMix(
  positionedItems: Map<number, PositionedTextItem[]>,
  pageTexts: string[],
  ocrResults?: OcrPageResult[]
): UnitMixExtraction {
  const pageLines = new Map<number, PageLine[]>();
  for (const [page, items] of positionedItems) {
    if (items.length > 0) {
      pageLines.set(page, groupItemsIntoLines(items, page));
    }
  }

  const candidatePages = detectCandidatePages(pageLines);

  let allRecords: UnitRecord[] = [];
  let hasTableData = false;

  for (const page of candidatePages) {
    const lines = pageLines.get(page);
    if (!lines || lines.length === 0) continue;

    const tableRows = linesToTableRows(lines);
    const header = detectHeaderRow(tableRows);

    if (header) {
      const tableRecords = parseRecordsFromTableRows(
        tableRows,
        header.columns,
        header.headerIndex,
        page
      );
      if (tableRecords.length > 0) {
        allRecords.push(...tableRecords);
        hasTableData = true;
        continue;
      }
    }

    const textLines = lines.map((l) => l.text).filter((t) => t.length > 3);
    const textRecords = parseRecordsFromText(textLines, page, 'TEXT_REGEX');
    allRecords.push(...textRecords);
  }

  if (allRecords.length === 0 && candidatePages.length === 0) {
    for (let pi = 0; pi < pageTexts.length; pi++) {
      const text = pageTexts[pi];
      if (!text || text.trim().length < 20) continue;
      const lines = text.split('\n').filter((l) => l.trim().length > 3);
      const records = parseRecordsFromText(lines, pi + 1, 'TEXT_REGEX');
      allRecords.push(...records);
    }
  }

  let isOcr = false;
  if (ocrResults && ocrResults.length > 0 && allRecords.length === 0) {
    isOcr = true;
    for (const ocr of ocrResults) {
      const ocrLines = ocr.lines.filter((l) => l.trim().length > 3);
      const records = parseRecordsFromText(ocrLines, ocr.page, 'OCR');
      allRecords.push(...records);
    }
  }

  const totals = computeTotals(allRecords);
  const confidence = computeConfidence(
    allRecords,
    candidatePages.length > 0 ? candidatePages : Array.from({ length: pageTexts.length }, (_, i) => i + 1),
    hasTableData,
    isOcr
  );

  return { unitRecords: allRecords, totals, confidence };
}
