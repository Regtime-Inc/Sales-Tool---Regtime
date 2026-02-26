import type { ClassifiedTable, UnitMixSignal, Evidence } from '../types';
import type { UnitRecord, BedroomType } from '../../../types/pdf';

const UNIT_ID_COLUMN_RE = /\b(UNIT|APT|NO\.?|APARTMENT)\b/i;
const BEDROOM_COLUMN_RE = /\b(TYPE|BEDROOM|BR|BED)\b/i;
const AREA_COLUMN_RE = /\b(SF|SQ\.?\s*FT|AREA|NSF|GSF)\b/i;
const SKIP_ROW_VALUES = new Set([
  'TOTAL', 'SUBTOTAL', 'SUB-TOTAL', 'GRAND TOTAL', '', 'N/A', '-',
]);

function findColumnIndex(headers: string[], pattern: RegExp): number {
  for (let i = 0; i < headers.length; i++) {
    if (pattern.test(headers[i])) return i;
  }
  return -1;
}

function inferBedroomType(raw: string): BedroomType {
  const upper = raw.toUpperCase().replace(/[- ]/g, '').trim();
  if (upper.includes('STUDIO') || upper === 'S' || upper === '0BR') return 'STUDIO';
  if (upper === '1BR' || upper === '1' || upper.includes('ONEBEDROOM') || upper.includes('1BDRM')) return '1BR';
  if (upper === '2BR' || upper === '2' || upper.includes('TWOBEDROOM') || upper.includes('2BDRM')) return '2BR';
  if (upper === '3BR' || upper === '3' || upper.includes('THREEBEDROOM') || upper.includes('3BDRM')) return '3BR';
  if (upper.startsWith('4') || upper.includes('FOURBEDROOM') || upper.includes('4BDRM')) return '4BR_PLUS';
  return 'UNKNOWN';
}

function isValidUnitId(raw: string): boolean {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  if (SKIP_ROW_VALUES.has(trimmed)) return false;
  if (/^[A-Z]{5,}$/.test(trimmed)) return false;
  return true;
}

export function extractUnitCountsFromTables(
  classifiedTables: ClassifiedTable[],
): UnitMixSignal {
  const unitTables = classifiedTables.filter((t) => t.tableType === 'unit_schedule');

  if (unitTables.length === 0) {
    return {
      totalUnits: null,
      unitMix: null,
      unitRecords: null,
    };
  }

  const allUnitIds = new Set<string>();
  const bedroomCounts: Record<string, number> = {};
  const records: UnitRecord[] = [];
  const evidence: Evidence[] = [];
  let hasBedroomColumn = false;

  for (const table of unitTables) {
    const unitIdCol = findColumnIndex(table.headers, UNIT_ID_COLUMN_RE);
    const bedroomCol = findColumnIndex(table.headers, BEDROOM_COLUMN_RE);
    const areaCol = findColumnIndex(table.headers, AREA_COLUMN_RE);

    if (unitIdCol < 0) continue;

    if (bedroomCol >= 0) hasBedroomColumn = true;

    evidence.push({
      page: table.pageIndex,
      snippet: `Unit schedule table: headers=[${table.headers.join(', ')}], ${table.rows.length} rows`,
      sourceType: 'unit_schedule_table',
      tableType: 'unit_schedule',
      tableIndex: table.tableIndex,
      confidence: table.confidence,
    });

    for (const row of table.rows) {
      const rawId = row[unitIdCol]?.trim() ?? '';
      if (!isValidUnitId(rawId)) continue;

      const key = rawId.toUpperCase();
      if (allUnitIds.has(key)) continue;
      allUnitIds.add(key);

      const bedroomRaw = bedroomCol >= 0 ? (row[bedroomCol] ?? '') : '';
      const bedType = bedroomRaw ? inferBedroomType(bedroomRaw) : 'UNKNOWN';
      bedroomCounts[bedType] = (bedroomCounts[bedType] || 0) + 1;

      const areaRaw = areaCol >= 0 ? parseFloat((row[areaCol] ?? '').replace(/,/g, '')) : NaN;

      records.push({
        unitId: rawId,
        bedroomType: bedType,
        allocation: 'UNKNOWN',
        areaSf: isNaN(areaRaw) ? undefined : areaRaw,
        source: {
          page: table.pageIndex,
          method: 'TEXT_TABLE',
          evidence: `Unit ${rawId} from table on p.${table.pageIndex}`,
        },
      });
    }
  }

  if (allUnitIds.size === 0) {
    return { totalUnits: null, unitMix: null, unitRecords: null };
  }

  const totalUnits: UnitMixSignal['totalUnits'] = {
    value: allUnitIds.size,
    confidence: 0.8,
    evidence,
  };

  const unitMix: UnitMixSignal['unitMix'] = hasBedroomColumn
    ? { value: bedroomCounts, confidence: 0.75, evidence }
    : null;

  return {
    totalUnits,
    unitMix,
    unitRecords: {
      value: records,
      confidence: hasBedroomColumn ? 0.75 : 0.6,
      evidence,
    },
  };
}
