import type {
  PositionedTextItem,
  PageTableRow,
  TableRegion,
} from '../../types/pdf';
import {
  clusterByY,
  linesToTableRows,
  computeYTolerance,
  computeXGapTolerance,
} from './layout';

const HEADER_TOKENS = [
  /\bUNIT\b/i,
  /\bAPT\b/i,
  /\bAPARTMENT\b/i,
  /\bBR\b/i,
  /\bBED\b/i,
  /\bBEDROOM\b/i,
  /\bSF\b/i,
  /\bSQ\s*FT\b/i,
  /\bAREA\b/i,
  /\bAFFORDABLE\b/i,
  /\bMIH\b/i,
  /\bAMI\b/i,
  /\bALLOCATION\b/i,
  /\bTYPE\b/i,
];

function isHeaderRow(row: PageTableRow): boolean {
  let matchCount = 0;
  for (const cell of row.cells) {
    for (const pat of HEADER_TOKENS) {
      if (pat.test(cell.text)) {
        matchCount++;
        break;
      }
    }
  }
  return matchCount >= 2;
}

export function reconstructTables(
  items: PositionedTextItem[],
  page: number
): TableRegion[] {
  if (items.length === 0) return [];

  const yTol = computeYTolerance(items);
  const xGapTol = computeXGapTolerance(items);

  const lines = clusterByY(items, page, yTol);
  const rows = linesToTableRows(lines, xGapTol);

  if (rows.length === 0) return [];

  const tables: TableRegion[] = [];
  let i = 0;

  while (i < rows.length) {
    if (!isHeaderRow(rows[i]) || rows[i].cells.length < 2) {
      i++;
      continue;
    }

    const headerRow = rows[i];
    const dataRows: PageTableRow[] = [];
    let j = i + 1;

    const firstGap = j < rows.length ? Math.abs(rows[i].y - rows[j].y) : 0;
    const baseRowSpacing = firstGap > 0 ? firstGap : yTol * 2;
    const gapThreshold = Math.max(baseRowSpacing * 2.5, yTol * 4);

    while (j < rows.length) {
      if (isHeaderRow(rows[j])) break;

      const yGap = Math.abs(rows[j - 1].y - rows[j].y);
      if (yGap > gapThreshold && dataRows.length > 0) break;

      if (rows[j].cells.length >= 1 && rows[j].rowText.trim().length >= 2) {
        dataRows.push(rows[j]);
      }
      j++;
    }

    if (dataRows.length > 0) {
      const allRows = [headerRow, ...dataRows];
      const allX0 = Math.min(...allRows.flatMap((r) => r.cells.map((c) => c.x0)));
      const allX1 = Math.max(...allRows.flatMap((r) => r.cells.map((c) => c.x1)));
      const allY = allRows.map((r) => r.y);

      tables.push({
        headerRow,
        dataRows,
        page,
        bbox: {
          x0: allX0,
          y0: Math.min(...allY),
          x1: allX1,
          y1: Math.max(...allY),
        },
      });
    }

    i = j;
  }

  return tables;
}
