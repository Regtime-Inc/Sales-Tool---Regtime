import type {
  BedroomType,
  AllocationKind,
  ExtractionMethod,
  UnitRecord,
  PageTableRow,
  FarExtraction,
  UnitMixTotals,
  PageLine,
} from '../../types/pdf';

const HEADER_SYNONYMS: Record<string, string[]> = {
  unitId: ['UNIT', 'APT', 'APARTMENT', 'ROOM', 'ELEMENT', 'NO', 'NUMBER'],
  bedCount: ['BR', 'BED', 'BEDROOMS', 'BEDROOM', 'TYPE'],
  area: ['NSF', 'NET', 'GROSS', 'GSF', 'SQFT', 'SF', 'AREA', 'NSA', 'SQ FT', 'SQUARE FEET'],
  allocation: ['AFFORDABLE', 'MIH', 'INCLUSIONARY', 'RESTRICTED', 'ALLOCATION', 'TENURE', 'STATUS'],
  amiBand: ['AMI', '%AMI', 'INCOME', 'BAND'],
};

export interface ColumnMapping {
  unitId?: number;
  bedCount?: number;
  area?: number;
  allocation?: number;
  amiBand?: number;
}

export function inferColumnMapping(headerCells: Array<{ text: string }>): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (let ci = 0; ci < headerCells.length; ci++) {
    const normalized = headerCells[ci].text.toUpperCase().replace(/[^\w\s%]/g, '').trim();
    const tokens = normalized.split(/\s+/);

    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (mapping[field as keyof ColumnMapping] !== undefined) continue;

      for (const syn of synonyms) {
        if (tokens.includes(syn) || normalized.includes(syn)) {
          mapping[field as keyof ColumnMapping] = ci;
          break;
        }
      }
    }
  }

  return mapping;
}

const BEDROOM_PATTERNS: Array<{ type: BedroomType; count: number; regex: RegExp }> = [
  { type: 'STUDIO', count: 0, regex: /\b(STUDIO|EFF|EFFICIENCY|0\s*BR|0\s*BED)\b/i },
  { type: '1BR', count: 1, regex: /\b1(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '2BR', count: 2, regex: /\b2(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '3BR', count: 3, regex: /\b3(\.0)?\s*(BR|BED(ROOM)?)\b/i },
  { type: '4BR_PLUS', count: 4, regex: /\b[4-6](\.\d+)?\s*(BR|BED(ROOM)?)\b/i },
];

const UNIT_ID_REGEX = /\b(?:UNIT|APT|APARTMENT)?\s*([A-Z]?\d{1,4}[A-Z]?(?:-\d{1,4})?|PH\d+|PENTHOUSE\s*\d+)\b/i;
const MIH_ALLOCATION_REGEX = /\b(MIH|INCLUSIONARY|RESTRICTED|AFFORDABLE|UAP)\b/i;
const MARKET_ALLOCATION_REGEX = /\b(MARKET|FREE\s*MARKET|MR)\b/i;
const AMI_BAND_REGEX = /\b(40|50|60|70|80|90|100)\s*%?\s*AMI\b/i;
const AREA_WITH_UNIT_REGEX = /\b(\d{3,5})\s*(SF|SQ\.?\s*FT|SQUARE\s*FEET)\b/i;
const AREA_STANDALONE_REGEX = /\b(\d{3,5})\b/;

function detectBedroom(text: string): { type: BedroomType; count?: number } {
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
  return m ? m[1]?.trim() : undefined;
}

function detectArea(text: string): number | undefined {
  const withUnit = AREA_WITH_UNIT_REGEX.exec(text);
  if (withUnit) return parseInt(withUnit[1], 10);
  const standalone = AREA_STANDALONE_REGEX.exec(text);
  if (standalone) {
    const val = parseInt(standalone[1], 10);
    if (val >= 200 && val <= 5000) return val;
  }
  return undefined;
}

export function parseUnitRow(
  cells: Array<{ text: string }>,
  mapping: ColumnMapping,
  page: number,
  method: ExtractionMethod
): UnitRecord | null {
  const fullText = cells.map((c) => c.text).join(' ');

  if (fullText.trim().length < 2) return null;
  if (/\bTOTAL\b/i.test(fullText)) return null;

  const bedText = mapping.bedCount !== undefined && cells[mapping.bedCount]
    ? cells[mapping.bedCount].text
    : fullText;
  const bed = detectBedroom(bedText);

  if (bed.type === 'UNKNOWN' && !/\d/.test(fullText)) return null;

  const allocText = mapping.allocation !== undefined && cells[mapping.allocation]
    ? cells[mapping.allocation].text
    : fullText;
  const allocation = detectAllocation(allocText);

  const amiText = mapping.amiBand !== undefined && cells[mapping.amiBand]
    ? cells[mapping.amiBand].text
    : fullText;
  const amiBand = detectAmiBand(amiText);

  const unitIdText = mapping.unitId !== undefined && cells[mapping.unitId]
    ? cells[mapping.unitId].text
    : fullText;
  const unitId = detectUnitId(unitIdText);

  const areaText = mapping.area !== undefined && cells[mapping.area]
    ? cells[mapping.area].text
    : fullText;
  const areaSf = detectArea(areaText);

  return {
    unitId,
    bedroomType: bed.type,
    bedroomCount: bed.count,
    allocation,
    amiBand,
    areaSf,
    source: {
      page,
      method,
      evidence: fullText.substring(0, 200),
    },
  };
}

export function parseUnitRowPositional(
  text: string,
  page: number,
  method: ExtractionMethod
): UnitRecord | null {
  if (text.trim().length < 3) return null;
  if (/\bTOTAL\b/i.test(text)) return null;

  const tokens = text.trim().split(/\s+/);
  let unitId: string | undefined;
  let bed: { type: BedroomType; count?: number } = { type: 'UNKNOWN' };
  let _area: number | undefined;

  for (const token of tokens) {
    if (!unitId && /^[A-Z]?\d{1,4}[A-Z]?(?:-\d{1,4})?$/i.test(token)) {
      unitId = token;
      continue;
    }
    if (bed.type === 'UNKNOWN') {
      const result = detectBedroom(token);
      if (result.type !== 'UNKNOWN') {
        bed = result;
        continue;
      }
      const n = parseInt(token, 10);
      if (!isNaN(n) && n >= 0 && n <= 6) {
        const found = BEDROOM_PATTERNS.find((bp) => bp.count === n);
        if (found) {
          bed = { type: found.type, count: found.count };
          continue;
        }
      }
    }
    if (_area === undefined) {
      const n = parseInt(token.replace(/,/g, ''), 10);
      if (!isNaN(n) && n > 200) {
        _area = n;
      }
    }
  }

  if (bed.type === 'UNKNOWN' && !unitId) return null;

  const allocation = detectAllocation(text);
  const amiBand = detectAmiBand(text);

  return {
    unitId,
    bedroomType: bed.type,
    bedroomCount: bed.count,
    allocation,
    amiBand,
    areaSf: _area,
    source: {
      page,
      method,
      evidence: text.substring(0, 200),
    },
  };
}

export function extractTotalsRow(
  rows: PageTableRow[]
): { totalUnits: number; source: string } | null {
  for (const row of rows) {
    if (!/\bTOTAL\b/i.test(row.rowText)) continue;

    const nums = row.rowText.match(/\b\d{1,4}\b/g);
    if (nums && nums.length > 0) {
      const val = parseInt(nums[0], 10);
      if (val > 0 && val < 2000) {
        return { totalUnits: val, source: row.rowText.substring(0, 200) };
      }
    }
  }
  return null;
}

export function deduplicateRecords(records: UnitRecord[]): UnitRecord[] {
  const byId = new Map<string, UnitRecord>();

  for (const r of records) {
    if (!r.unitId) {
      byId.set(`__no_id_${byId.size}`, r);
      continue;
    }

    const existing = byId.get(r.unitId);
    if (!existing) {
      byId.set(r.unitId, r);
      continue;
    }

    const existingFields = countFields(existing);
    const newFields = countFields(r);
    if (newFields > existingFields) {
      byId.set(r.unitId, r);
    }
  }

  return Array.from(byId.values());
}

function countFields(r: UnitRecord): number {
  let count = 0;
  if (r.unitId) count++;
  if (r.bedroomType !== 'UNKNOWN') count++;
  if (r.bedroomCount !== undefined) count++;
  if (r.allocation !== 'UNKNOWN') count++;
  if (r.amiBand !== undefined) count++;
  return count;
}

export function computeTotalsFromRecords(records: UnitRecord[]): UnitMixTotals {
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

const FAR_PATTERNS = {
  lotArea: /LOT\s*AREA[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:SF|SQ\.?\s*FT)?/i,
  zfa: /(?:ZONING\s*FLOOR\s*AREA|ZFA|TOTAL\s*ZFA|RES(?:IDENTIAL)?\s*ZFA)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:SF|SQ\.?\s*FT)?/i,
  proposed: /(?:PROPOSED\s*(?:FLOOR\s*AREA|GFA|TOTAL\s*AREA)|PROPOSED\s*ZFA)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:SF|SQ\.?\s*FT)?/i,
  far: /(?:FAR|F\.?A\.?R\.?)[:\s]*([0-9]+(?:\.\d+)?)/i,
};

function parseNum(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

export function extractFarFromLines(
  lines: PageLine[],
  page: number
): FarExtraction | null {
  let lotAreaSf: number | null = null;
  let zoningFloorAreaSf: number | null = null;
  let proposedFloorAreaSf: number | null = null;
  let proposedFAR: number | null = null;
  const evidenceParts: string[] = [];

  for (const line of lines) {
    const text = line.text;

    const lotMatch = FAR_PATTERNS.lotArea.exec(text);
    if (lotMatch && !lotAreaSf) {
      lotAreaSf = parseNum(lotMatch[1]);
      evidenceParts.push(lotMatch[0]);
    }

    const zfaMatch = FAR_PATTERNS.zfa.exec(text);
    if (zfaMatch && !zoningFloorAreaSf) {
      zoningFloorAreaSf = parseNum(zfaMatch[1]);
      evidenceParts.push(zfaMatch[0]);
    }

    const propMatch = FAR_PATTERNS.proposed.exec(text);
    if (propMatch && !proposedFloorAreaSf) {
      proposedFloorAreaSf = parseNum(propMatch[1]);
      evidenceParts.push(propMatch[0]);
    }

    const farMatch = FAR_PATTERNS.far.exec(text);
    if (farMatch && !proposedFAR) {
      const val = parseFloat(farMatch[1]);
      if (val >= 0.1 && val <= 15) {
        proposedFAR = val;
        evidenceParts.push(farMatch[0]);
      }
    }
  }

  if (!lotAreaSf && !zoningFloorAreaSf && !proposedFloorAreaSf && !proposedFAR) {
    return null;
  }

  if (!proposedFAR && proposedFloorAreaSf && lotAreaSf && lotAreaSf > 0) {
    proposedFAR = Math.round((proposedFloorAreaSf / lotAreaSf) * 100) / 100;
  }

  let confidence = 0.5;
  if (lotAreaSf) confidence += 0.15;
  if (zoningFloorAreaSf || proposedFloorAreaSf) confidence += 0.15;
  if (proposedFAR) confidence += 0.1;
  confidence = Math.min(0.95, confidence);

  return {
    lotAreaSf,
    zoningFloorAreaSf,
    proposedFloorAreaSf,
    proposedFAR,
    source: {
      page,
      method: 'TEXT_TABLE',
      evidence: evidenceParts.join(' / ').substring(0, 200),
    },
    confidence,
  };
}

