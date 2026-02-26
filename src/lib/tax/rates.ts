import type { TaxRateSchedule } from '../../types/tax';

export const NYC_TAX_RATES_TY2026: TaxRateSchedule[] = [
  {
    taxClass: 1,
    ratePerDollar: 0.19963,
    description: 'Class 1: 1-3 family residential, small condos',
    taxYear: 2026,
  },
  {
    taxClass: 2,
    ratePerDollar: 0.12439,
    description: 'Class 2: Rental buildings (4+ units), co-ops, condos',
    taxYear: 2026,
  },
  {
    taxClass: 3,
    ratePerDollar: 0.12094,
    description: 'Class 3: Utility real property',
    taxYear: 2026,
  },
  {
    taxClass: 4,
    ratePerDollar: 0.10592,
    description: 'Class 4: Commercial/industrial',
    taxYear: 2026,
  },
];

export function getTaxRate(taxClass: number): TaxRateSchedule {
  const rate = NYC_TAX_RATES_TY2026.find((r) => r.taxClass === taxClass);
  if (!rate) return NYC_TAX_RATES_TY2026[1];
  return rate;
}

export function inferTaxClass(bldgClass: string, unitsRes: number): number {
  const bc = (bldgClass || '').toUpperCase();
  if (bc.startsWith('A') || bc.startsWith('B') || bc.startsWith('S')) return 1;
  if (bc.startsWith('U') || bc.startsWith('T')) return 3;
  if (unitsRes >= 4 || bc.startsWith('C') || bc.startsWith('D') || bc.startsWith('R')) return 2;
  if (bc.startsWith('O') || bc.startsWith('K') || bc.startsWith('L') || bc.startsWith('E') || bc.startsWith('F') || bc.startsWith('G') || bc.startsWith('H') || bc.startsWith('I') || bc.startsWith('J')) return 4;
  return 2;
}

export function estimateAssessedValue(_lotArea: number, bldgArea: number, newResFa: number): number {
  const totalArea = bldgArea + newResFa;
  const perSfAssessment = 15;
  return Math.round(totalArea * perSfAssessment);
}
