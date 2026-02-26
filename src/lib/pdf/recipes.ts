import type {
  SheetInfo,
  SheetIndex,
  RecipeType,
  RecipeResult,
  RecipeEvidence,
  PositionedTextItem,
  PageLine,
  UnitRecord,
  CoverSheetExtraction,
} from '../../types/pdf';
import type { OcrEngine } from './ocrProvider';
import { reconstructTables } from './tableRecon';
import {
  inferColumnMapping,
  parseUnitRow,
  extractFarFromLines,
} from './unitRowParser';
import { clusterByY } from './layout';
import { findUnitLabelsNearAreas } from './spatialMatch';

export interface RecipeParams {
  pages: number[];
  positionedItems: Map<number, PositionedTextItem[]>;
  pageTexts: string[];
  pageLines: Map<number, PageLine[]>;
  ocrEngine?: OcrEngine;
}

export interface Recipe {
  type: RecipeType;
  match: (sheet: SheetInfo) => boolean;
  extract: (params: RecipeParams) => Promise<RecipeResult>;
}

const COVER_SHEET_TITLE_RE = /COVER\s+SHEET|TITLE\s+SHEET/i;
const COVER_SHEET_DRAWING_RE = /^T[-.]?\d{1,3}/i;

function extractKeyValue(lines: PageLine[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = pattern.exec(line.text);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractNumericKeyValue(lines: PageLine[], pattern: RegExp): number | null {
  const raw = extractKeyValue(lines, pattern);
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

const COVER_SHEET_RECIPE: Recipe = {
  type: 'COVER_SHEET',

  match(sheet: SheetInfo): boolean {
    if (sheet.drawingTitle && COVER_SHEET_TITLE_RE.test(sheet.drawingTitle)) return true;
    if (sheet.drawingNo && COVER_SHEET_DRAWING_RE.test(sheet.drawingNo)) return true;
    return false;
  },

  async extract(params: RecipeParams): Promise<RecipeResult> {
    const evidence: RecipeEvidence[] = [];
    const coverSheet: CoverSheetExtraction = {
      lotAreaSf: null,
      far: null,
      totalUnits: null,
      floors: null,
      buildingAreaSf: null,
      zone: null,
      zoningMap: null,
      occupancyGroup: null,
      constructionClass: null,
      scopeOfWork: null,
      block: null,
      lot: null,
      bin: null,
    };

    for (const pageNum of params.pages) {
      const items = params.positionedItems.get(pageNum) || [];
      const lines = params.pageLines.get(pageNum) || clusterByY(items, pageNum);
      const pageText = params.pageTexts[pageNum - 1] || '';

      const lotArea = extractNumericKeyValue(lines, /LOT\s*AREA[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:SF|SQ)/i);
      if (lotArea && !coverSheet.lotAreaSf) {
        coverSheet.lotAreaSf = lotArea;
        evidence.push({ field: 'lotAreaSf', page: pageNum, method: 'TEXT_REGEX', snippet: `LOT AREA: ${lotArea}` });
      }

      const far = extractNumericKeyValue(lines, /\bFAR[:\s]*([0-9]+(?:\.\d+)?)/i);
      if (far && far >= 0.1 && far <= 15 && !coverSheet.far) {
        coverSheet.far = far;
        evidence.push({ field: 'far', page: pageNum, method: 'TEXT_REGEX', snippet: `FAR: ${far}` });
      }

      const units = extractNumericKeyValue(lines, /#?\s*(?:OF\s+)?UNITS[:\s]*(\d{1,4})/i);
      if (units && units > 0 && units < 2000 && !coverSheet.totalUnits) {
        coverSheet.totalUnits = units;
        evidence.push({ field: 'totalUnits', page: pageNum, method: 'TEXT_REGEX', snippet: `# OF UNITS: ${units}` });
      }

      const floors = extractNumericKeyValue(lines, /#?\s*(?:OF\s+)?FLOORS[:\s]*(\d{1,3})/i);
      if (floors && !coverSheet.floors) {
        coverSheet.floors = floors;
        evidence.push({ field: 'floors', page: pageNum, method: 'TEXT_REGEX', snippet: `# OF FLOORS: ${floors}` });
      }

      const bldgArea = extractNumericKeyValue(lines, /(?:BLDG|BUILDING)\s*AREA[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:SF|SQ)/i);
      if (bldgArea && !coverSheet.buildingAreaSf) {
        coverSheet.buildingAreaSf = bldgArea;
        evidence.push({ field: 'buildingAreaSf', page: pageNum, method: 'TEXT_REGEX', snippet: `BLDG AREA: ${bldgArea}` });
      }

      const zone = extractKeyValue(lines, /\bZONE[:\s]*([A-Z0-9][-A-Z0-9/]*)/i);
      if (zone && !coverSheet.zone) {
        coverSheet.zone = zone;
        evidence.push({ field: 'zone', page: pageNum, method: 'TEXT_REGEX', snippet: `ZONE: ${zone}` });
      }

      const zoningMap = extractKeyValue(lines, /ZONING\s*MAP[:\s]*([A-Z0-9]+)/i);
      if (zoningMap && !coverSheet.zoningMap) coverSheet.zoningMap = zoningMap;

      const occGroup = extractKeyValue(lines, /OCCUPANCY\s*GROUP[:\s]*([A-Z][-A-Z0-9]*)/i);
      if (occGroup && !coverSheet.occupancyGroup) coverSheet.occupancyGroup = occGroup;

      const constClass = extractKeyValue(lines, /CONSTRUCTION\s*CLASS[:\s]*([A-Z][-A-Z0-9]*)/i);
      if (constClass && !coverSheet.constructionClass) coverSheet.constructionClass = constClass;

      const scopeMatch = /SCOPE\s+OF\s+WORK[:\s]*(.*?)(?:\n|$)/i.exec(pageText);
      if (scopeMatch && !coverSheet.scopeOfWork) coverSheet.scopeOfWork = scopeMatch[1].trim().substring(0, 200);

      const block = extractKeyValue(lines, /BLOCK[:\s]*#?(\d{1,5})/i);
      if (block && !coverSheet.block) coverSheet.block = block;

      const lot = extractKeyValue(lines, /\bLOT[:\s]*#?(\d{1,5})/i);
      if (lot && !coverSheet.lot) coverSheet.lot = lot;

      const bin = extractKeyValue(lines, /\bBIN[:\s]*#?(\d{5,8})/i);
      if (bin && !coverSheet.bin) coverSheet.bin = bin;
    }

    let confidence = 0.3;
    let fieldsFound = 0;
    if (coverSheet.lotAreaSf) fieldsFound++;
    if (coverSheet.far) fieldsFound++;
    if (coverSheet.totalUnits) fieldsFound++;
    if (coverSheet.floors) fieldsFound++;
    if (coverSheet.buildingAreaSf) fieldsFound++;
    if (coverSheet.zone) fieldsFound++;
    if (coverSheet.block) fieldsFound++;
    confidence = Math.min(0.95, 0.3 + fieldsFound * 0.09);

    return {
      recipe: 'COVER_SHEET',
      pages: params.pages,
      fields: { coverSheet },
      evidence,
      confidence,
    };
  },
};

const ZONING_TITLE_RE = /ZONING\s*(COMPLIANCE|ANALYSIS|SCHEDULE|DATA|INFORMATION)/i;
const ZONING_DRAWING_RE = /^Z-/i;
const ZONING_A004_RE = /^A[-.]?004/i;

const ZONING_SCHEDULE_RECIPE: Recipe = {
  type: 'ZONING_SCHEDULE',

  match(sheet: SheetInfo): boolean {
    if (sheet.drawingTitle && ZONING_TITLE_RE.test(sheet.drawingTitle)) return true;
    if (sheet.drawingNo && ZONING_DRAWING_RE.test(sheet.drawingNo)) return true;
    if (sheet.drawingNo && ZONING_A004_RE.test(sheet.drawingNo)) return true;
    return false;
  },

  async extract(params: RecipeParams): Promise<RecipeResult> {
    const evidence: RecipeEvidence[] = [];
    let lotAreaSf: number | null = null;
    let zoningFloorAreaSf: number | null = null;
    let far: number | null = null;
    let totalUnits: number | null = null;
    const unitMix: Record<string, number> = {};
    let tablesFound = 0;

    for (const pageNum of params.pages) {
      const items = params.positionedItems.get(pageNum) || [];
      const lines = params.pageLines.get(pageNum) || clusterByY(items, pageNum);

      const farResult = extractFarFromLines(lines, pageNum);
      if (farResult) {
        if (farResult.lotAreaSf && !lotAreaSf) {
          lotAreaSf = farResult.lotAreaSf;
          evidence.push({ field: 'lotAreaSf', page: pageNum, method: 'TEXT_TABLE', snippet: farResult.source.evidence });
        }
        if (farResult.zoningFloorAreaSf && !zoningFloorAreaSf) {
          zoningFloorAreaSf = farResult.zoningFloorAreaSf;
          evidence.push({ field: 'zoningFloorAreaSf', page: pageNum, method: 'TEXT_TABLE', snippet: farResult.source.evidence });
        }
        if (farResult.proposedFAR && !far) {
          far = farResult.proposedFAR;
          evidence.push({ field: 'far', page: pageNum, method: 'TEXT_TABLE', snippet: farResult.source.evidence });
        }
      }

      const tables = reconstructTables(items, pageNum);
      tablesFound += tables.length;

      for (const table of tables) {
        const mapping = inferColumnMapping(table.headerRow.cells);
        for (const row of table.dataRows) {
          const record = parseUnitRow(row.cells, mapping, pageNum, 'TEXT_TABLE');
          if (record && record.bedroomType !== 'UNKNOWN') {
            unitMix[record.bedroomType] = (unitMix[record.bedroomType] || 0) + 1;
          }
        }
      }

      const dwellingUnitsMatch = lines.find((l) =>
        /(?:PROPOSED|TOTAL)\s+\d{1,4}\s+(?:DWELLING\s+)?UNITS/i.test(l.text) ||
        /(?:DWELLING|DU)\s+(?:UNIT\s+)?(?:FACTOR|COUNT).*\b(\d{1,4})\s+(?:DWELLING\s+)?UNITS/i.test(l.text)
      );
      if (dwellingUnitsMatch && !totalUnits) {
        const m = dwellingUnitsMatch.text.match(/\b(\d{1,4})\s+(?:DWELLING\s+)?UNITS/i);
        if (m) {
          const val = parseInt(m[1], 10);
          if (val > 0 && val < 2000) {
            totalUnits = val;
            evidence.push({ field: 'totalUnits', page: pageNum, method: 'TEXT_TABLE', snippet: dwellingUnitsMatch.text.substring(0, 120) });
          }
        }
      }

      if (!totalUnits) {
        const totalMatch = lines.find((l) => /\bTOTAL\b.*\b(\d{1,4})\b/i.test(l.text));
        if (totalMatch) {
          const m = totalMatch.text.match(/\bTOTAL\b.*?\b(\d{1,4})\b/i);
          if (m) {
            const val = parseInt(m[1], 10);
            if (val > 0 && val < 2000) {
              totalUnits = val;
              evidence.push({ field: 'totalUnits', page: pageNum, method: 'TEXT_TABLE', snippet: totalMatch.text.substring(0, 120) });
            }
          }
        }
      }
    }

    if (!far && lotAreaSf && zoningFloorAreaSf && lotAreaSf > 0) {
      far = Math.round((zoningFloorAreaSf / lotAreaSf) * 100) / 100;
    }

    let confidence = 0.4;
    if (lotAreaSf) confidence += 0.15;
    if (zoningFloorAreaSf) confidence += 0.15;
    if (far) confidence += 0.1;
    if (tablesFound > 0) confidence += 0.1;
    confidence = Math.min(0.95, confidence);

    return {
      recipe: 'ZONING_SCHEDULE',
      pages: params.pages,
      fields: { lotAreaSf, zoningFloorAreaSf, far, totalUnits, unitMix },
      evidence,
      confidence,
    };
  },
};

const FLOOR_PLAN_TITLE_RE = /(FLOOR\s+PLAN|TYPICAL\s+FLOOR|UNIT\s+PLAN)/i;
const FLOOR_PLAN_EXCLUDE_RE = /(SITE\s+PLAN|FOUNDATION\s+PLAN|SUSTAINABLE\s+ROOF)/i;

const UNIT_SIZE_LABEL_RE =
  /(STUDIO|ONE[- ]?BEDROOM|TWO[- ]?BEDROOM|THREE[- ]?BEDROOM|1[- ]?BR|2[- ]?BR|3[- ]?BR)\s+(?:APT\.?\s+)?(\d{2,4})\s*(?:SF|SQ\.?\s*FT)/gi;

const AREA_UNIT_LABEL_RE =
  /(\d{2,4})\s*(?:SF|SQ\.?\s*FT)\s+(?:UNIT|APT)\.?\s*([A-Z0-9][-A-Z0-9]*)/gi;

const UNIT_AREA_LABEL_RE =
  /(?:UNIT|APT)\.?\s*([A-Z0-9][-A-Z0-9]*)\s+(\d{2,4})\s*(?:SF|SQ\.?\s*FT)/gi;

const UNIT_NEWLINE_AREA_RE =
  /(?:UNIT|APT)\.?\s*([A-Z0-9][-A-Z0-9]*)[\s\S]{0,30}?(\d{2,4})\s*(?:SF|SQ\.?\s*FT)/gi;

function normalizeBrType(raw: string): string {
  const u = raw.toUpperCase().replace(/[- ]/g, '');
  if (u.includes('STUDIO')) return 'Studio';
  if (u.includes('ONEBEDROOM') || u === '1BR') return '1BR';
  if (u.includes('TWOBEDROOM') || u === '2BR') return '2BR';
  if (u.includes('THREEBEDROOM') || u === '3BR') return '3BR';
  return raw;
}

const FLOOR_PLAN_LABEL_RECIPE: Recipe = {
  type: 'FLOOR_PLAN_LABEL',

  match(sheet: SheetInfo): boolean {
    if (!sheet.drawingTitle) return false;
    if (FLOOR_PLAN_EXCLUDE_RE.test(sheet.drawingTitle)) return false;
    return FLOOR_PLAN_TITLE_RE.test(sheet.drawingTitle);
  },

  async extract(params: RecipeParams): Promise<RecipeResult> {
    const evidence: RecipeEvidence[] = [];
    const unitSizesByType: Record<string, number[]> = {};
    const unitCountsByType: Record<string, number> = {};
    const unitRecords: UnitRecord[] = [];
    const seenUnits = new Set<string>();

    for (const pageNum of params.pages) {
      const text = params.pageTexts[pageNum - 1] || '';
      const items = params.positionedItems.get(pageNum) || [];

      let match: RegExpExecArray | null;
      const re = new RegExp(UNIT_SIZE_LABEL_RE.source, 'gi');
      while ((match = re.exec(text)) !== null) {
        const brType = normalizeBrType(match[1]);
        const sf = parseInt(match[2], 10);
        if (!unitSizesByType[brType]) unitSizesByType[brType] = [];
        unitSizesByType[brType].push(sf);
        unitCountsByType[brType] = (unitCountsByType[brType] || 0) + 1;
        evidence.push({ field: `unitSize_${brType}`, page: pageNum, method: 'TEXT_REGEX', snippet: match[0] });
      }

      const areaUnitRe = new RegExp(AREA_UNIT_LABEL_RE.source, 'gi');
      while ((match = areaUnitRe.exec(text)) !== null) {
        const sf = parseInt(match[1], 10);
        const unitId = match[2];
        if (sf < 100 || sf > 5000 || seenUnits.has(unitId)) continue;
        seenUnits.add(unitId);
        unitRecords.push({
          unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: sf,
          source: { page: pageNum, method: 'TEXT_REGEX', evidence: match[0] },
        });
        evidence.push({ field: `unitLabel_${unitId}`, page: pageNum, method: 'TEXT_REGEX', snippet: match[0] });
      }

      const unitAreaRe = new RegExp(UNIT_AREA_LABEL_RE.source, 'gi');
      while ((match = unitAreaRe.exec(text)) !== null) {
        const unitId = match[1];
        const sf = parseInt(match[2], 10);
        if (sf < 100 || sf > 5000 || seenUnits.has(unitId)) continue;
        seenUnits.add(unitId);
        unitRecords.push({
          unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: sf,
          source: { page: pageNum, method: 'TEXT_REGEX', evidence: match[0] },
        });
        evidence.push({ field: `unitLabel_${unitId}`, page: pageNum, method: 'TEXT_REGEX', snippet: match[0] });
      }

      const nlRe = new RegExp(UNIT_NEWLINE_AREA_RE.source, 'gi');
      while ((match = nlRe.exec(text)) !== null) {
        const unitId = match[1];
        const sf = parseInt(match[2], 10);
        if (sf < 100 || sf > 5000 || seenUnits.has(unitId)) continue;
        seenUnits.add(unitId);
        unitRecords.push({
          unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: sf,
          source: { page: pageNum, method: 'TEXT_REGEX', evidence: match[0].replace(/\n/g, ' ').substring(0, 80) },
        });
        evidence.push({ field: `unitLabel_${unitId}`, page: pageNum, method: 'TEXT_REGEX', snippet: match[0].replace(/\n/g, ' ').substring(0, 80) });
      }

      if (items.length > 0) {
        const spatialRecords = findUnitLabelsNearAreas(items, pageNum);
        for (const rec of spatialRecords) {
          if (rec.unitId && !seenUnits.has(rec.unitId)) {
            seenUnits.add(rec.unitId);
            unitRecords.push(rec);
            evidence.push({
              field: `unitLabel_${rec.unitId}`,
              page: pageNum,
              method: 'TEXT_REGEX',
              snippet: rec.source.evidence,
            });
          }
        }
      }

      const tables = reconstructTables(items, pageNum);
      for (const table of tables) {
        const headerText = table.headerRow.cells.map((c) => c.text.toUpperCase()).join(' ');
        if (!/UNIT|ROOM|AREA|LIGHT|AIR/i.test(headerText)) continue;

        const mapping = inferColumnMapping(table.headerRow.cells);
        for (const row of table.dataRows) {
          const fullText = row.cells.map((c) => c.text).join(' ');
          const unitIdMatch = /\bUNIT\s+([A-Z0-9][-A-Z0-9]*)/i.exec(fullText);
          const areaMatch = /\b(\d{3,5})\s*SF\b/i.exec(fullText);
          if (unitIdMatch && areaMatch) {
            const unitId = unitIdMatch[1];
            const sf = parseInt(areaMatch[1], 10);
            if (sf >= 100 && sf <= 5000 && !seenUnits.has(unitId)) {
              seenUnits.add(unitId);
              unitRecords.push({
                unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: sf,
                source: { page: pageNum, method: 'TEXT_TABLE', evidence: fullText.substring(0, 120) },
              });
              evidence.push({ field: `unitTable_${unitId}`, page: pageNum, method: 'TEXT_TABLE', snippet: fullText.substring(0, 120) });
            }
          }
        }
      }
    }

    const totalLabels = Object.values(unitCountsByType).reduce((s, v) => s + v, 0) + unitRecords.length;
    let confidence = totalLabels > 0 ? Math.min(0.9, 0.5 + totalLabels * 0.05) : 0.2;
    confidence = Math.min(0.95, confidence);

    return {
      recipe: 'FLOOR_PLAN_LABEL',
      pages: params.pages,
      fields: { unitSizesByType, unitCountsByType, unitRecords },
      evidence,
      confidence,
    };
  },
};

const CODE_NOTES_TITLE_RE = /(CODE\s+NOTES|GENERAL\s+CODE|OCCUPANT\s+LOAD)/i;
const CODE_NOTES_DRAWING_RE = /^G-/i;
const OCCUPANT_LOAD_HEADER_RE = /\bOCCUPANT\s+LOAD\b|(?:NAME|UNIT).*AREA.*(?:OCCUPANT|NO\b)/i;
const OCCUPANT_AREA_PER_OCCUPANT_RE = /200\s*SF/;
const UNIT_ROW_RE = /\bUNIT\s+([A-Z0-9][-A-Z0-9]*)\s+(\d{2,5})\s*(?:SF)?\s+(?:200\s*(?:SF)?\s+)?(\d{1,3})\b/i;
const SIMPLE_UNIT_ROW_RE = /\bUNIT\s+([A-Z0-9][-A-Z0-9]*)\b.*?\b(\d{3,5})\s*SF\b/i;

const OCCUPANT_LOAD_RECIPE: Recipe = {
  type: 'OCCUPANT_LOAD',

  match(sheet: SheetInfo): boolean {
    if (sheet.drawingTitle && OCCUPANT_LOAD_HEADER_RE.test(sheet.drawingTitle)) return true;
    if (sheet.drawingTitle && CODE_NOTES_TITLE_RE.test(sheet.drawingTitle)) return true;
    if (sheet.drawingNo && CODE_NOTES_DRAWING_RE.test(sheet.drawingNo)) return true;
    return false;
  },

  async extract(params: RecipeParams): Promise<RecipeResult> {
    const evidence: RecipeEvidence[] = [];
    const unitRecords: UnitRecord[] = [];
    const seenUnits = new Set<string>();
    let totalOccupancy: number | null = null;

    for (const pageNum of params.pages) {
      const text = params.pageTexts[pageNum - 1] || '';
      const items = params.positionedItems.get(pageNum) || [];

      const hasOccupantTable = OCCUPANT_LOAD_HEADER_RE.test(text) || OCCUPANT_AREA_PER_OCCUPANT_RE.test(text);
      if (!hasOccupantTable) continue;

      const tables = reconstructTables(items, pageNum);
      for (const table of tables) {
        const headerText = table.headerRow.cells.map((c) => c.text.toUpperCase()).join(' ');
        if (!/NAME|UNIT|AREA|OCCUPANT/i.test(headerText)) continue;

        let nameCol = -1;
        let areaCol = -1;
        for (let ci = 0; ci < table.headerRow.cells.length; ci++) {
          const cellText = table.headerRow.cells[ci].text.toUpperCase();
          if (nameCol < 0 && /\bNAME\b|\bUNIT\b/.test(cellText)) nameCol = ci;
          if (areaCol < 0 && /\bAREA\b|\bSF\b/.test(cellText)) areaCol = ci;
        }
        if (areaCol < 0) {
          for (let ci = 0; ci < table.headerRow.cells.length; ci++) {
            const cellText = table.headerRow.cells[ci].text.toUpperCase();
            if (/AREA\s*PER/.test(cellText)) continue;
            if (/\bAREA\b/.test(cellText)) { areaCol = ci; break; }
          }
        }

        for (const row of table.dataRows) {
          const fullText = row.cells.map((c) => c.text).join(' ');
          const unitMatch = /\bUNIT\s+([A-Z0-9][-A-Z0-9]*)/i.exec(fullText);
          if (!unitMatch) continue;

          const unitId = unitMatch[1];
          if (seenUnits.has(unitId)) continue;

          let areaSf: number | null = null;
          if (areaCol >= 0 && row.cells[areaCol]) {
            const areaText = row.cells[areaCol].text;
            const areaMatch = /(\d{2,5})/i.exec(areaText);
            if (areaMatch) areaSf = parseInt(areaMatch[1], 10);
          }
          if (!areaSf) {
            const fallback = /\b(\d{3,5})\s*(?:SF)?\b/i.exec(fullText);
            if (fallback) areaSf = parseInt(fallback[1], 10);
          }

          if (areaSf && areaSf >= 100 && areaSf <= 5000) {
            seenUnits.add(unitId);
            unitRecords.push({
              unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf,
              source: { page: pageNum, method: 'TEXT_TABLE', evidence: fullText.substring(0, 200) },
            });
            evidence.push({ field: `occupantUnit_${unitId}`, page: pageNum, method: 'TEXT_TABLE', snippet: fullText.substring(0, 120) });
          }
        }
      }

      if (unitRecords.length === 0) {
        const lines = params.pageLines.get(pageNum) || clusterByY(items, pageNum);
        for (const line of lines) {
          let unitMatch = UNIT_ROW_RE.exec(line.text);
          if (unitMatch) {
            const unitId = unitMatch[1];
            const areaSf = parseInt(unitMatch[2], 10);
            if (areaSf >= 100 && areaSf <= 5000 && !seenUnits.has(unitId)) {
              seenUnits.add(unitId);
              unitRecords.push({
                unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf,
                source: { page: pageNum, method: 'TEXT_TABLE', evidence: line.text.substring(0, 200) },
              });
              evidence.push({ field: `occupantUnit_${unitId}`, page: pageNum, method: 'TEXT_TABLE', snippet: line.text.substring(0, 120) });
            }
            continue;
          }

          unitMatch = SIMPLE_UNIT_ROW_RE.exec(line.text);
          if (unitMatch) {
            const unitId = unitMatch[1];
            const areaSf = parseInt(unitMatch[2], 10);
            if (areaSf >= 100 && areaSf <= 5000 && !seenUnits.has(unitId)) {
              seenUnits.add(unitId);
              unitRecords.push({
                unitId, bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf,
                source: { page: pageNum, method: 'TEXT_TABLE', evidence: line.text.substring(0, 200) },
              });
              evidence.push({ field: `occupantUnit_${unitId}`, page: pageNum, method: 'TEXT_TABLE', snippet: line.text.substring(0, 120) });
            }
          }

          const occMatch = /TOTAL\s+OCCUPANCY[:\s]*(\d{1,4})/i.exec(line.text);
          if (occMatch && !totalOccupancy) {
            totalOccupancy = parseInt(occMatch[1], 10);
          }
        }
      } else {
        const lines = params.pageLines.get(pageNum) || clusterByY(items, pageNum);
        for (const line of lines) {
          const occMatch = /TOTAL\s+OCCUPANCY[:\s]*(\d{1,4})/i.exec(line.text);
          if (occMatch && !totalOccupancy) {
            totalOccupancy = parseInt(occMatch[1], 10);
          }
        }
      }
    }

    let confidence = unitRecords.length > 0
      ? Math.min(0.90, 0.5 + unitRecords.length * 0.025)
      : 0.1;
    confidence = Math.min(0.95, confidence);

    return {
      recipe: 'OCCUPANT_LOAD',
      pages: params.pages,
      fields: { unitRecords, totalOccupancy, totalUnits: unitRecords.length },
      evidence,
      confidence,
    };
  },
};

const GENERIC_RECIPE: Recipe = {
  type: 'GENERIC',
  match: () => true,

  async extract(params: RecipeParams): Promise<RecipeResult> {
    const evidence: RecipeEvidence[] = [];
    let totalUnits = 0;
    const unitMix: Record<string, number> = {};

    for (const pageNum of params.pages) {
      const items = params.positionedItems.get(pageNum) || [];
      const tables = reconstructTables(items, pageNum);

      for (const table of tables) {
        const mapping = inferColumnMapping(table.headerRow.cells);
        for (const row of table.dataRows) {
          const record = parseUnitRow(row.cells, mapping, pageNum, 'TEXT_TABLE');
          if (record && record.bedroomType !== 'UNKNOWN') {
            unitMix[record.bedroomType] = (unitMix[record.bedroomType] || 0) + 1;
            totalUnits++;
            evidence.push({ field: 'unitRecord', page: pageNum, method: 'TEXT_TABLE', snippet: row.rowText.substring(0, 120) });
          }
        }
      }
    }

    const confidence = totalUnits > 0
      ? Math.min(0.85, 0.3 + totalUnits * 0.02)
      : 0.1;

    return {
      recipe: 'GENERIC',
      pages: params.pages,
      fields: { totalUnits, unitMix },
      evidence,
      confidence,
    };
  },
};

const ALL_RECIPES: Recipe[] = [
  COVER_SHEET_RECIPE,
  ZONING_SCHEDULE_RECIPE,
  FLOOR_PLAN_LABEL_RECIPE,
  OCCUPANT_LOAD_RECIPE,
  GENERIC_RECIPE,
];

export function selectRecipes(
  sheetIndex: SheetIndex,
  overrides?: Record<number, RecipeType | 'skip'>
): Array<{ recipe: Recipe; pages: number[] }> {
  const recipePageMap = new Map<RecipeType, number[]>();
  const matchedPages = new Set<number>();

  for (const sheet of sheetIndex.pages) {
    const pageNum = sheet.pageNumber;

    if (overrides?.[pageNum]) {
      const override = overrides[pageNum];
      if (override === 'skip') continue;
      if (!recipePageMap.has(override)) recipePageMap.set(override, []);
      recipePageMap.get(override)!.push(pageNum);
      matchedPages.add(pageNum);
      continue;
    }

    for (const recipe of ALL_RECIPES) {
      if (recipe.type === 'GENERIC') continue;
      if (recipe.match(sheet)) {
        if (!recipePageMap.has(recipe.type)) recipePageMap.set(recipe.type, []);
        recipePageMap.get(recipe.type)!.push(pageNum);
        matchedPages.add(pageNum);
        break;
      }
    }
  }

  const unmatchedPages = sheetIndex.pages
    .map((s) => s.pageNumber)
    .filter((p) => !matchedPages.has(p) && overrides?.[p] !== 'skip');

  if (unmatchedPages.length > 0) {
    recipePageMap.set('GENERIC', unmatchedPages);
  }

  const result: Array<{ recipe: Recipe; pages: number[] }> = [];
  for (const [type, pages] of recipePageMap) {
    const recipe = ALL_RECIPES.find((r) => r.type === type);
    if (recipe && pages.length > 0) {
      result.push({ recipe, pages: pages.sort((a, b) => a - b) });
    }
  }

  return result;
}

export { COVER_SHEET_RECIPE, ZONING_SCHEDULE_RECIPE, FLOOR_PLAN_LABEL_RECIPE, OCCUPANT_LOAD_RECIPE, GENERIC_RECIPE, ALL_RECIPES };
