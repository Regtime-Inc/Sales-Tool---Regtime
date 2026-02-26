export const COMMERCIAL_TO_RES_EQUIV: Record<string, string> = {
  "C1-6": "R7",
  "C1-6A": "R7A",
  "C1-7": "R8",
  "C1-7A": "R8A",
  "C1-8": "R9",
  "C1-8A": "R9A",
  "C1-8X": "R9X",
  "C1-9": "R10",
  "C1-9A": "R10A",
  "C2-6": "R7",
  "C2-6A": "R7A",
  "C2-7": "R9",
  "C2-7A": "R9A",
  "C2-7X": "R9X",
  "C2-8": "R10",
  "C2-8A": "R10A",
  "C3": "R3-2",
  "C3A": "R3A",
  "C4-1": "R5",
  "C4-2": "R6",
  "C4-2A": "R6A",
  "C4-3": "R6",
  "C4-3A": "R6A",
  "C4-4": "R7",
  "C4-4A": "R7A",
  "C4-4D": "R8A",
  "C4-4L": "R7A",
  "C4-5": "R7",
  "C4-5A": "R7A",
  "C4-5D": "R7D",
  "C4-5X": "R7X",
  "C4-6": "R10",
  "C4-6A": "R10A",
  "C4-7": "R10",
  "C4-7A": "R10A",
  "C5-1": "R10",
  "C5-1A": "R10A",
  "C5-2": "R10",
  "C5-2A": "R10A",
  "C5-3": "R10",
  "C5-4": "R10",
  "C5-5": "R10",
  "C6-1": "R7",
  "C6-1A": "R6",
  "C6-2": "R8",
  "C6-2A": "R8A",
  "C6-3": "R9",
  "C6-3A": "R9A",
  "C6-3D": "R9D",
  "C6-3X": "R9X",
  "C6-4": "R10",
  "C6-4A": "R10A",
  "C6-4X": "R10X",
  "C6-5": "R10",
  "C6-6": "R10",
  "C6-7": "R10",
  "C6-8": "R10",
  "C6-9": "R10",
};

export const RES_UAP_EQUIV: string[] = ['R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'];

export function normalizeDistrict(d: string): string {
  return (d || '').toUpperCase().replace(/\s+/g, '').trim();
}

export function getResidentialEquivalent(district: string): string | null {
  const norm = normalizeDistrict(district);
  if (norm.startsWith('R')) return norm;
  if (norm.startsWith('C') || norm.startsWith('M')) {
    const exact = COMMERCIAL_TO_RES_EQUIV[norm];
    if (exact) return exact;
  }
  return null;
}

export function isUapEligibleDistrict(district: string): boolean {
  const res = getResidentialEquivalent(district) ?? normalizeDistrict(district);
  return RES_UAP_EQUIV.some((prefix) => res === prefix || res.startsWith(prefix));
}
