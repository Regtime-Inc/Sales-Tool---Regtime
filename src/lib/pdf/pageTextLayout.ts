import type {
  PositionedTextItem,
  PageLine,
  PageTableRow,
} from '../../types/pdf';
import { clusterByY, linesToTableRows as layoutLinesToTableRows } from './layout';
import {
  detectCandidatePages as candidatesDetect,
  isScheduleCandidatePage as candidatesIsSchedule,
} from './candidates';

export function groupItemsIntoLines(
  items: PositionedTextItem[],
  page: number
): PageLine[] {
  return clusterByY(items, page);
}

export function linesToTableRows(lines: PageLine[]): PageTableRow[] {
  return layoutLinesToTableRows(lines);
}

export function isScheduleCandidatePage(lines: PageLine[]): boolean {
  return candidatesIsSchedule(lines);
}

export function detectCandidatePages(
  pageLines: Map<number, PageLine[]>
): number[] {
  const result = candidatesDetect(pageLines);
  return result.map((c) => c.page);
}

export interface DetectedColumns {
  unitId?: number;
  bedroom?: number;
  allocation?: number;
  ami?: number;
  size?: number;
}

const HEADER_PATTERNS: Record<string, RegExp[]> = {
  unitId: [/\bUNIT\b/i, /\bAPT\b/i, /\bAPARTMENT\b/i, /\bELEMENT\s*ID\b/i],
  bedroom: [
    /\bBED\b/i,
    /\bBR\b/i,
    /\bBEDROOM\b/i,
    /\b0\s*BED\b/i,
    /\b1\s*BED\b/i,
    /\b2\s*BED\b/i,
  ],
  allocation: [
    /\bAFFORDABLE\b/i,
    /\bMIH\b/i,
    /\bRESTRICTED\b/i,
    /\bINCLUSIONARY\b/i,
    /\bMARKET\b/i,
  ],
  ami: [/\bAMI\b/i, /\b%\s*AMI\b/i, /\b40%/i, /\b60%/i, /\b80%/i, /\b100%/i],
  size: [/\bSF\b/i, /\bSQ\s*FT\b/i, /\bAREA\b/i, /\bNSA\b/i, /\bGROSS\b/i],
};

export function detectHeaderRow(
  rows: PageTableRow[]
): { headerIndex: number; columns: DetectedColumns } | null {
  for (let ri = 0; ri < Math.min(rows.length, 8); ri++) {
    const row = rows[ri];
    const columns: DetectedColumns = {};
    let matchCount = 0;

    for (let ci = 0; ci < row.cells.length; ci++) {
      const cellText = row.cells[ci].text;
      for (const [role, patterns] of Object.entries(HEADER_PATTERNS)) {
        if (columns[role as keyof DetectedColumns] !== undefined) continue;
        for (const pat of patterns) {
          if (pat.test(cellText)) {
            columns[role as keyof DetectedColumns] = ci;
            matchCount++;
            break;
          }
        }
      }
    }

    if (matchCount >= 2) {
      return { headerIndex: ri, columns };
    }
  }
  return null;
}
