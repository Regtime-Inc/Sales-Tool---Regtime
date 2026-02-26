import type { TableType, ClassifiedTable, DocAiTable } from './types';

interface RawTable {
  pageIndex: number;
  tableIndex: number;
  headers: string[];
  rows: string[][];
}

const LIGHT_VENT_KEYWORDS = [
  'NATURAL LIGHT', 'VENTILATION', 'ROOM ID', "REQ'D", 'PROVIDED',
  'WINDOW', 'AIR SHAFT', 'LIGHT & VENT', 'LIGHT AND VENT',
  'REQUIRED AREA', 'PROVIDED AREA', 'OPENING',
];

const UNIT_SCHEDULE_KEYWORDS = [
  'UNIT', 'APT', 'BEDROOM', 'TYPE', 'STUDIO', '1BR', '2BR',
  'NO. OF UNITS', 'UNIT NO', 'UNIT TYPE', 'NO OF UNITS', 'APARTMENT',
  'APT. NO', 'DWELLING UNIT', 'DU TYPE', 'UNIT SIZE', 'UNIT NO.',
  'INCOME BAND', 'AMI', 'AFFORDABLE', 'MARKET RATE', 'MIH',
  'RENT STABILIZED', 'NET SF', 'GROSS SF',
];

const ZONING_KEYWORDS = [
  'FAR', 'LOT AREA', 'ZONING', 'USE GROUP', 'FLOOR AREA RATIO',
  'ZFA', 'ZONING FLOOR AREA', 'PERMITTED', 'PROPOSED FAR',
];

const OCCUPANCY_KEYWORDS = [
  'OCCUPANT LOAD', 'OCCUPANCY', 'CAPACITY', 'PERSONS',
  'OCCUPANCY GROUP', 'EGRESS',
];

const ROOM_TYPE_VALUES = new Set([
  'BEDROOM', 'LIVING ROOM', 'KITCHEN', 'BATHROOM', 'DINING',
  'CLOSET', 'FOYER', 'HALL', 'ALCOVE', 'LIVING/DINING',
  'BATH', 'W.I.C', 'WIC', 'LIVING', 'DINING ROOM',
]);

function countKeywordMatches(text: string, keywords: string[]): number {
  const upper = text.toUpperCase();
  let count = 0;
  for (const kw of keywords) {
    if (upper.includes(kw)) count++;
  }
  return count;
}

function hasRoomTypeValues(rows: string[][]): boolean {
  const sampleRows = rows.slice(0, 5);
  let roomTypeHits = 0;
  for (const row of sampleRows) {
    for (const cell of row) {
      const upper = cell.trim().toUpperCase();
      if (ROOM_TYPE_VALUES.has(upper)) {
        roomTypeHits++;
        break;
      }
    }
  }
  return roomTypeHits >= 2;
}

export function classifyTable(
  headers: string[],
  sampleRows: string[][],
): { tableType: TableType; confidence: number } {
  const headerText = headers.join(' ');

  const lightVentScore = countKeywordMatches(headerText, LIGHT_VENT_KEYWORDS);
  const unitScheduleScore = countKeywordMatches(headerText, UNIT_SCHEDULE_KEYWORDS);
  const zoningScore = countKeywordMatches(headerText, ZONING_KEYWORDS);
  const occupancyScore = countKeywordMatches(headerText, OCCUPANCY_KEYWORDS);

  if (hasRoomTypeValues(sampleRows)) {
    return { tableType: 'light_ventilation_schedule', confidence: 0.95 };
  }

  if (lightVentScore >= 2) {
    return { tableType: 'light_ventilation_schedule', confidence: Math.min(0.9, 0.5 + lightVentScore * 0.15) };
  }

  const affordabilityKeywords = ['AFFORDABLE', 'AMI', 'MIH', 'MARKET RATE', 'INCOME BAND', 'RENT STABILIZED'];
  const affordabilityScore = countKeywordMatches(headerText, affordabilityKeywords);
  const boostedUnitScore = unitScheduleScore + (affordabilityScore > 0 ? affordabilityScore : 0);

  const scores: Array<{ type: TableType; score: number }> = [
    { type: 'unit_schedule', score: boostedUnitScore },
    { type: 'zoning_table', score: zoningScore },
    { type: 'occupancy_load', score: occupancyScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (best.score >= 2) {
    return { tableType: best.type, confidence: Math.min(0.9, 0.5 + best.score * 0.15) };
  }

  if (best.score === 1) {
    return { tableType: best.type, confidence: 0.4 };
  }

  return { tableType: 'unknown', confidence: 0.2 };
}

export function classifyDocAiTables(tables: DocAiTable[]): ClassifiedTable[] {
  return tables.map((t) => {
    const headers = t.headerRows.length > 0 ? t.headerRows[0] : [];
    const { tableType, confidence } = classifyTable(headers, t.bodyRows.slice(0, 5));
    return {
      tableType,
      confidence,
      pageIndex: t.pageIndex,
      tableIndex: t.tableIndex,
      headers,
      rows: t.bodyRows,
    };
  });
}

export function classifyRawTables(tables: RawTable[]): ClassifiedTable[] {
  return tables.map((t) => {
    const { tableType, confidence } = classifyTable(t.headers, t.rows.slice(0, 5));
    return {
      tableType,
      confidence,
      pageIndex: t.pageIndex,
      tableIndex: t.tableIndex,
      headers: t.headers,
      rows: t.rows,
    };
  });
}
