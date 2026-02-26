import type { BedroomType, UnitRecord } from '../../types/pdf';

export interface AreaThresholds {
  studioMax: number;
  oneBrMax: number;
  twoBrMax: number;
  threeBrMax: number;
}

const DEFAULT_THRESHOLDS: AreaThresholds = {
  studioMax: 450,
  oneBrMax: 650,
  twoBrMax: 950,
  threeBrMax: 1300,
};

const ZONE_THRESHOLDS: Record<string, AreaThresholds> = {
  R6: { studioMax: 400, oneBrMax: 600, twoBrMax: 850, threeBrMax: 1150 },
  R7: { studioMax: 425, oneBrMax: 625, twoBrMax: 900, threeBrMax: 1200 },
  R8: { studioMax: 450, oneBrMax: 650, twoBrMax: 950, threeBrMax: 1300 },
  R9: { studioMax: 475, oneBrMax: 700, twoBrMax: 1000, threeBrMax: 1400 },
  R10: { studioMax: 500, oneBrMax: 750, twoBrMax: 1100, threeBrMax: 1500 },
  C4: { studioMax: 450, oneBrMax: 650, twoBrMax: 950, threeBrMax: 1300 },
  C6: { studioMax: 475, oneBrMax: 700, twoBrMax: 1000, threeBrMax: 1400 },
};

export function getThresholds(zoneDistrict?: string): AreaThresholds {
  if (!zoneDistrict) return DEFAULT_THRESHOLDS;
  const m = zoneDistrict.toUpperCase().match(/^([A-Z]+\d+)/);
  const prefix = m ? m[1] : '';
  for (const [key, thresholds] of Object.entries(ZONE_THRESHOLDS)) {
    if (prefix === key) return thresholds;
  }
  return DEFAULT_THRESHOLDS;
}

export function inferBedroomFromArea(
  areaSf: number,
  thresholds: AreaThresholds
): { type: BedroomType; count: number; confidence: number } {
  if (areaSf <= thresholds.studioMax) {
    return { type: 'STUDIO', count: 0, confidence: 0.65 };
  }
  if (areaSf <= thresholds.oneBrMax) {
    return { type: '1BR', count: 1, confidence: 0.6 };
  }
  if (areaSf <= thresholds.twoBrMax) {
    return { type: '2BR', count: 2, confidence: 0.55 };
  }
  if (areaSf <= thresholds.threeBrMax) {
    return { type: '3BR', count: 3, confidence: 0.5 };
  }
  return { type: '4BR_PLUS', count: 4, confidence: 0.45 };
}

export function inferFloorFromUnitId(unitId: string): string | undefined {
  if (/^PH/i.test(unitId)) return 'PH';
  const m = unitId.match(/^(\d{1,2})/);
  if (m) return m[1];
  return undefined;
}

export function applyBedroomInference(
  records: UnitRecord[],
  zoneDistrict?: string
): { records: UnitRecord[]; inferredCount: number } {
  const thresholds = getThresholds(zoneDistrict);
  let inferredCount = 0;

  const updated = records.map((r) => {
    const copy = { ...r };

    if (!copy.floor && copy.unitId) {
      copy.floor = inferFloorFromUnitId(copy.unitId);
    }

    if (copy.bedroomType === 'UNKNOWN' && copy.areaSf && copy.areaSf > 0) {
      const inferred = inferBedroomFromArea(copy.areaSf, thresholds);
      copy.bedroomType = inferred.type;
      copy.bedroomCount = inferred.count;
      copy.notes = (copy.notes ? copy.notes + '; ' : '') +
        `Bedroom type inferred from ${copy.areaSf} SF`;
      inferredCount++;
    }

    return copy;
  });

  return { records: updated, inferredCount };
}
