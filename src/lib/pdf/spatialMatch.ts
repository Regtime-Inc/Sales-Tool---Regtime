import type { PositionedTextItem, UnitRecord } from '../../types/pdf';

interface SpatialCandidate {
  item: PositionedTextItem;
  value: number;
  label: string;
}

const AREA_LABEL_RE = /(\d{2,5})\s*(?:SF|SQ\.?\s*FT)/i;
const UNIT_LABEL_RE = /(?:UNIT|APT)\.?\s*([A-Z0-9][-A-Z0-9]*)/i;

function centerX(item: PositionedTextItem): number {
  return item.x + item.width / 2;
}

function centerY(item: PositionedTextItem): number {
  return item.y + item.height / 2;
}

function distance(a: PositionedTextItem, b: PositionedTextItem): number {
  const dx = centerX(a) - centerX(b);
  const dy = centerY(a) - centerY(b);
  return Math.sqrt(dx * dx + dy * dy);
}

export function findUnitLabelsNearAreas(
  items: PositionedTextItem[],
  page: number,
  maxDistance: number = 80
): UnitRecord[] {
  const areaItems: SpatialCandidate[] = [];
  const unitItems: Array<{ item: PositionedTextItem; unitId: string }> = [];

  for (const item of items) {
    const areaMatch = AREA_LABEL_RE.exec(item.str);
    if (areaMatch) {
      const val = parseInt(areaMatch[1], 10);
      if (val >= 100 && val <= 5000) {
        areaItems.push({ item, value: val, label: areaMatch[0] });
      }
    }

    const unitMatch = UNIT_LABEL_RE.exec(item.str);
    if (unitMatch) {
      unitItems.push({ item, unitId: unitMatch[1] });
    }
  }

  const records: UnitRecord[] = [];
  const usedUnits = new Set<string>();
  const usedAreaIndices = new Set<number>();

  for (const unitCandidate of unitItems) {
    if (usedUnits.has(unitCandidate.unitId)) continue;

    let bestDist = Infinity;
    let bestAreaIdx = -1;

    for (let ai = 0; ai < areaItems.length; ai++) {
      if (usedAreaIndices.has(ai)) continue;
      const d = distance(unitCandidate.item, areaItems[ai].item);
      if (d < bestDist && d <= maxDistance) {
        bestDist = d;
        bestAreaIdx = ai;
      }
    }

    if (bestAreaIdx >= 0) {
      const area = areaItems[bestAreaIdx];
      usedUnits.add(unitCandidate.unitId);
      usedAreaIndices.add(bestAreaIdx);

      records.push({
        unitId: unitCandidate.unitId,
        bedroomType: 'UNKNOWN',
        allocation: 'UNKNOWN',
        areaSf: area.value,
        source: {
          page,
          method: 'TEXT_REGEX',
          evidence: `${unitCandidate.item.str} ~ ${area.label}`,
        },
      });
    }
  }

  return records;
}

export function findAreaLabelsOnPage(
  items: PositionedTextItem[],
  page: number
): Array<{ areaSf: number; x: number; y: number; label: string }> {
  const results: Array<{ areaSf: number; x: number; y: number; label: string }> = [];

  for (const item of items) {
    const m = AREA_LABEL_RE.exec(item.str);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 100 && val <= 5000) {
        results.push({
          areaSf: val,
          x: centerX(item),
          y: centerY(item),
          label: m[0],
        });
      }
    }
  }

  return results;
}
