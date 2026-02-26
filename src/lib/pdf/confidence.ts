import type { UnitRecord, TableRegion } from '../../types/pdf';

export interface PageConfidenceInput {
  page: number;
  headerMappedColumns: number;
  totalRowFound: boolean;
  totalRowConsistent: boolean;
  unitRowCount: number;
  ocrUsed: boolean;
  ocrConfidence: number;
  totalsConflict: boolean;
}

export function scorePageConfidence(input: PageConfidenceInput): number {
  let score = 0;

  if (input.headerMappedColumns >= 3) score += 0.30;
  else if (input.headerMappedColumns >= 2) score += 0.15;

  if (input.totalRowFound && input.totalRowConsistent) score += 0.25;
  else if (input.totalRowFound) score += 0.10;

  if (input.unitRowCount >= 10) score += 0.20;
  else if (input.unitRowCount >= 5) score += 0.10;
  else if (input.unitRowCount >= 1) score += 0.05;

  if (input.ocrUsed) {
    score += 0.15 * (input.ocrConfidence / 100);
  }

  if (input.totalsConflict) score -= 0.30;

  return Math.max(0, Math.min(0.99, score));
}

export function scoreOverallConfidence(
  pageScores: Array<{ page: number; score: number; weight: number }>
): number {
  if (pageScores.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const ps of pageScores) {
    weightedSum += ps.score * ps.weight;
    totalWeight += ps.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.min(0.99, Math.round((weightedSum / totalWeight) * 100) / 100);
}

export function generateWarnings(
  records: UnitRecord[],
  tables: TableRegion[],
  totalsConflict: boolean,
  ocrUsed: boolean,
  hasFar: boolean
): string[] {
  const warnings: string[] = [];

  if (totalsConflict) {
    warnings.push('Totals inconsistent across pages; using best candidate page');
  }

  if (ocrUsed) {
    warnings.push('OCR used for some pages; verify schedule data');
  }

  if (!hasFar) {
    warnings.push('Area/FAR values missing; check zoning analysis sheets');
  }

  const unknownBed = records.filter((r) => r.bedroomType === 'UNKNOWN').length;
  if (unknownBed > records.length * 0.3 && records.length > 0) {
    warnings.push(
      `${unknownBed} of ${records.length} units have undetected bedroom types`
    );
  }

  const unknownAlloc = records.filter((r) => r.allocation === 'UNKNOWN').length;
  if (unknownAlloc > records.length * 0.5 && records.length > 0) {
    warnings.push(
      `${unknownAlloc} of ${records.length} units have undetected allocations`
    );
  }

  if (tables.length === 0 && records.length > 0) {
    warnings.push('No structured table detected; records parsed from text patterns');
  }

  return warnings;
}
