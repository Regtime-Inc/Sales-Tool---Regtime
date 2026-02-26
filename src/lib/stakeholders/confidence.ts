export const BASE_CONFIDENCE: Record<string, number> = {
  DOB_LICENSE_INFO: 0.95,
  HPD_CONTACTS: 0.90,
  DOF_VALUATION: 0.85,
  ACRIS_GRANTEE: 0.80,
  ACRIS_CONTACT: 0.50,
  DOB_FILING: 0.75,
  DOB_PERMIT_ISSUANCE: 0.80,
  BIS_WEB: 0.70,
  PLUTO: 0.85,
};

const MULTI_SOURCE_BONUS = 0.05;
const MAX_CONFIDENCE = 0.99;

export function computeConfidence(
  provenanceSources: string[]
): { score: number; reasons: string[] } {
  if (provenanceSources.length === 0) {
    return { score: 0, reasons: ['No provenance data'] };
  }

  const reasons: string[] = [];
  let best = 0;

  for (const src of provenanceSources) {
    const base = BASE_CONFIDENCE[src] ?? 0.50;
    if (base > best) best = base;
    reasons.push(`${src}: ${base}`);
  }

  const uniqueSources = new Set(provenanceSources);
  if (uniqueSources.size > 1) {
    const bonus = (uniqueSources.size - 1) * MULTI_SOURCE_BONUS;
    best = Math.min(best + bonus, MAX_CONFIDENCE);
    reasons.push(`Multi-source bonus: +${bonus.toFixed(2)} (${uniqueSources.size} sources)`);
  }

  return { score: Math.round(best * 100) / 100, reasons };
}

export function enrichmentBoost(currentConfidence: number): number {
  return Math.min(currentConfidence + 0.15, 0.95);
}
