import { roundUnitsThreeQuarters } from '../zoning/rounding';

export const AVG_UNIT_SF = 700;

export function calcTotalProjectedUnits(newResFa: number, duFactor: number = AVG_UNIT_SF): number {
  if (newResFa <= 0) return 0;
  return roundUnitsThreeQuarters(newResFa / duFactor);
}

export function calcRequiredAffordableUnits(totalUnits: number, pct: number): number {
  if (totalUnits <= 0) return 0;
  if (pct <= 0) return 0;
  let normalizedPct = pct;
  if (pct > 1 && pct <= 100) normalizedPct = pct / 100;
  else if (pct > 100) normalizedPct = 1;
  return Math.ceil(totalUnits * normalizedPct);
}

export function calcMarketRateUnits(totalUnits: number, affordableUnits: number): number {
  return Math.max(totalUnits - affordableUnits, 0);
}

export function formatAffordableExplanation(totalUnits: number, pct: number): string {
  const normalizedPct = pct > 1 && pct <= 100 ? pct : pct * 100;
  const raw = totalUnits * (normalizedPct / 100);
  const result = Math.ceil(raw);
  return `ceil(${totalUnits} × ${normalizedPct}%) = ceil(${raw % 1 === 0 ? raw.toFixed(1) : raw.toFixed(2)}) = ${result}`;
}
