export function roundUnitsThreeQuarters(x: number): number {
  const base = Math.floor(x);
  const frac = x - base;
  return base + (frac >= 0.75 ? 1 : 0);
}
