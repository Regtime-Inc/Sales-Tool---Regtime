export type AVConfidence = 'HIGH' | 'MED' | 'LOW';
export type AVMethod = 'TIER_1_LOCAL_COMPS' | 'TIER_2_BOROUGH' | 'TIER_3_DEFAULT';

export interface AVEstimate {
  estimatedNewAV: number;
  marketValueEstimate: number;
  avPerGsf: number;
  methodUsed: AVMethod;
  confidence: AVConfidence;
  reasoning: string;
  borough: string;
  proposedGSF: number;
  assessmentRatio: number;
}

const ASSESSMENT_RATIO_CLASS_2 = 0.45;

const BOROUGH_MV_PER_GSF: Record<string, { median: number; low: number; high: number; label: string }> = {
  '1': { median: 400, low: 300, high: 550, label: 'Manhattan' },
  '2': { median: 200, low: 140, high: 280, label: 'Bronx' },
  '3': { median: 300, low: 200, high: 420, label: 'Brooklyn' },
  '4': { median: 250, low: 170, high: 350, label: 'Queens' },
  '5': { median: 200, low: 140, high: 280, label: 'Staten Island' },
};

export function estimateNewBuildAV(
  borough: string,
  proposedGSF: number,
  _lotArea?: number,
  _unitCount?: number
): AVEstimate {
  const boroData = BOROUGH_MV_PER_GSF[borough] || BOROUGH_MV_PER_GSF['3'];
  const boroLabel = boroData.label;

  if (proposedGSF <= 0) {
    return {
      estimatedNewAV: 0,
      marketValueEstimate: 0,
      avPerGsf: 0,
      methodUsed: 'TIER_3_DEFAULT',
      confidence: 'LOW',
      reasoning: 'No proposed GSF available for estimation.',
      borough: boroLabel,
      proposedGSF,
      assessmentRatio: ASSESSMENT_RATIO_CLASS_2,
    };
  }

  const mvPerGsf = boroData.median;
  const marketValue = Math.round(proposedGSF * mvPerGsf);
  const assessedValue = Math.round(marketValue * ASSESSMENT_RATIO_CLASS_2);
  const avPerGsf = Math.round((assessedValue / proposedGSF) * 100) / 100;

  const reasoning = [
    `Estimated market value: ${proposedGSF.toLocaleString()} GSF x $${mvPerGsf}/SF = $${marketValue.toLocaleString()}.`,
    `Assessment ratio: ${(ASSESSMENT_RATIO_CLASS_2 * 100).toFixed(0)}% (Class 2).`,
    `Estimated AV: $${assessedValue.toLocaleString()} ($${avPerGsf.toFixed(0)}/GSF).`,
    `Based on ${boroLabel} new multifamily rental median (range: $${boroData.low}-$${boroData.high}/GSF MV).`,
  ].join(' ');

  return {
    estimatedNewAV: assessedValue,
    marketValueEstimate: marketValue,
    avPerGsf,
    methodUsed: 'TIER_3_DEFAULT',
    confidence: 'MED',
    reasoning,
    borough: boroLabel,
    proposedGSF: proposedGSF,
    assessmentRatio: ASSESSMENT_RATIO_CLASS_2,
  };
}
