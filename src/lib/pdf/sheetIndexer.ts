import type { PositionedTextItem, SheetInfo, SheetIndex } from '../../types/pdf';
import { clusterByY } from './layout';

const DRAWING_NO_RE = /^([A-Z]{1,3}[-.]?\d{1,3}(?:[.-]\d{1,3})?)\b/;
const ADDRESS_RE = /\d+\s+\w+\s+(ST|AVE|BLVD|RD|PL|DR|CT|LN|WAY)\b/i;
const PROJECT_RE = /PROJECT[:\s]/i;

function getPageHeight(items: PositionedTextItem[]): number {
  if (items.length === 0) return 0;
  let maxY = 0;
  let minY = Infinity;
  for (const item of items) {
    const top = item.y + item.height;
    if (top > maxY) maxY = top;
    if (item.y < minY) minY = item.y;
  }
  return maxY - minY;
}

function filterBottomRegion(items: PositionedTextItem[], pct: number = 0.2): PositionedTextItem[] {
  if (items.length === 0) return [];
  let minY = Infinity;
  let maxY = 0;
  for (const item of items) {
    if (item.y < minY) minY = item.y;
    const top = item.y + item.height;
    if (top > maxY) maxY = top;
  }
  const range = maxY - minY;
  if (range <= 0) return [];
  const threshold = minY + range * pct;
  return items.filter((item) => item.y <= threshold);
}

function extractMeaningfulChars(items: PositionedTextItem[]): number {
  let count = 0;
  for (const item of items) {
    count += item.str.replace(/\s/g, '').length;
  }
  return count;
}

function parseDrawingNo(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = DRAWING_NO_RE.exec(line.trim());
    if (m) return m[1];
  }
  return undefined;
}

function parseDrawingTitle(lines: string[], drawingNoLine?: string): string | undefined {
  let longest = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === drawingNoLine) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (trimmed.length > longest.length) longest = trimmed;
  }
  return longest.length >= 3 ? longest : undefined;
}

function parseProjectTitle(lines: string[]): string | undefined {
  for (const line of lines) {
    if (ADDRESS_RE.test(line) || PROJECT_RE.test(line)) {
      return line.trim();
    }
  }
  return undefined;
}

function normalizeTitleKey(title: string): string {
  return title.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
}

export function indexSheets(
  positionedItems: Map<number, PositionedTextItem[]>,
  pageCount: number
): SheetIndex {
  const pages: SheetInfo[] = [];
  const byDrawingNo: Record<string, number> = {};
  const byTitleKey: Record<string, number[]> = {};

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const items = positionedItems.get(pageNum) || [];
    const bottomItems = filterBottomRegion(items, 0.2);
    const charCount = extractMeaningfulChars(bottomItems);

    let method: SheetInfo['method'] = 'PDF_TEXT';
    let drawingNo: string | undefined;
    let drawingTitle: string | undefined;
    let projectTitle: string | undefined;
    let confidence = 0.3;

    if (charCount >= 5) {
      const lines = clusterByY(bottomItems, pageNum);
      const lineTexts = lines.map((l) => l.text);

      drawingNo = parseDrawingNo(lineTexts);
      const drawingNoLine = drawingNo
        ? lineTexts.find((l) => l.includes(drawingNo!))
        : undefined;
      drawingTitle = parseDrawingTitle(lineTexts, drawingNoLine);
      projectTitle = parseProjectTitle(lineTexts);

      if (drawingNo) confidence = 0.9;
      else if (drawingTitle) confidence = 0.5;
    } else {
      method = 'OCR_CROP';
      confidence = 0.3;
    }

    pages.push({
      pageNumber: pageNum,
      drawingNo,
      drawingTitle,
      projectTitle,
      confidence,
      method,
    });

    if (drawingNo) {
      byDrawingNo[drawingNo] = pageNum;
    }

    if (drawingTitle) {
      const key = normalizeTitleKey(drawingTitle);
      const words = key.split(/\s+/).filter((w) => w.length >= 3);
      for (const word of words) {
        if (!byTitleKey[word]) byTitleKey[word] = [];
        if (!byTitleKey[word].includes(pageNum)) {
          byTitleKey[word].push(pageNum);
        }
      }
    }
  }

  return {
    pages,
    lookup: { byDrawingNo, byTitleKey },
  };
}

export function getPageHeight_exported(items: PositionedTextItem[]): number {
  return getPageHeight(items);
}

export { filterBottomRegion };
