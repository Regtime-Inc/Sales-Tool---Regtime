import type {
  PositionedTextItem,
  PageLine,
  PageTableRow,
} from '../../types/pdf';

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeYTolerance(items: PositionedTextItem[]): number {
  const heights = items.map((i) => i.height).filter((h) => h > 0);
  const median = medianOf(heights);
  return Math.max(2, median * 0.6);
}

export function computeXGapTolerance(items: PositionedTextItem[]): number {
  const charWidths: number[] = [];
  for (const item of items) {
    if (item.str.length > 0 && item.width > 0) {
      charWidths.push(item.width / item.str.length);
    }
  }
  const median = medianOf(charWidths);
  return Math.max(10, median * 2.2);
}

export function clusterByY(
  items: PositionedTextItem[],
  page: number,
  yTol?: number
): PageLine[] {
  if (items.length === 0) return [];

  const tol = yTol ?? computeYTolerance(items);
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PageLine[] = [];
  let currentLine: PositionedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tol) {
      currentLine.push(item);
    } else {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(buildLine(currentLine, currentY, page));
      currentLine = [item];
      currentY = item.y;
    }
  }

  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(buildLine(currentLine, currentY, page));
  }

  return lines;
}

function buildLine(
  items: PositionedTextItem[],
  y: number,
  page: number
): PageLine {
  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      const gap = item.x - (prev.x + prev.width);
      if (gap > 4) parts.push(' ');
    }
    parts.push(item.str);
  }

  return {
    y,
    items,
    text: parts.join('').replace(/\s+/g, ' ').trim(),
    page,
  };
}

export function clusterByX(
  lineItems: PositionedTextItem[],
  xGapTol?: number
): PageTableRow['cells'] {
  if (lineItems.length === 0) return [];

  const tol = xGapTol ?? computeXGapTolerance(lineItems);
  const cells: PageTableRow['cells'] = [];
  let currentCell: PositionedTextItem[] = [lineItems[0]];

  for (let i = 1; i < lineItems.length; i++) {
    const item = lineItems[i];
    const prev = currentCell[currentCell.length - 1];
    const gap = item.x - (prev.x + prev.width);

    if (gap > tol) {
      cells.push(buildCell(currentCell));
      currentCell = [item];
    } else {
      currentCell.push(item);
    }
  }

  if (currentCell.length > 0) {
    cells.push(buildCell(currentCell));
  }

  return cells;
}

function buildCell(
  items: PositionedTextItem[]
): PageTableRow['cells'][number] {
  const text = items
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    text,
    x0: items[0].x,
    x1: items[items.length - 1].x + items[items.length - 1].width,
  };
}

export function linesToTableRows(
  lines: PageLine[],
  xGapTol?: number
): PageTableRow[] {
  return lines.map((line) => {
    const cells = clusterByX(line.items, xGapTol);
    return {
      cells,
      rowText: line.text,
      y: line.y,
      page: line.page,
    };
  });
}
