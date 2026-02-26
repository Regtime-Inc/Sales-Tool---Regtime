import type { AssemblageLot, AssemblageConfig, FarSelectionMode } from '../../types/pdf';

export function computeAssemblage(
  lots: AssemblageLot[],
  mode: FarSelectionMode,
  manualFar?: { resid?: number; comm?: number; facil?: number }
): AssemblageConfig {
  const totalLotArea = lots.reduce((sum, l) => sum + l.lotArea, 0);
  const totalExistingBldgArea = lots.reduce((sum, l) => sum + l.existingBldgArea, 0);

  const residFars = lots.map((l) => l.residFar).filter((f) => f > 0);
  const commFars = lots.map((l) => l.commFar).filter((f) => f > 0);
  const facilFars = lots.map((l) => l.facilFar).filter((f) => f > 0);

  let effectiveResidFar: number;
  let effectiveCommFar: number;
  let effectiveFacilFar: number;

  if (mode === 'manual') {
    effectiveResidFar = manualFar?.resid ?? selectFar(residFars, 'most_restrictive');
    effectiveCommFar = manualFar?.comm ?? selectFar(commFars, 'most_restrictive');
    effectiveFacilFar = manualFar?.facil ?? selectFar(facilFars, 'most_restrictive');
  } else {
    effectiveResidFar = selectFar(residFars, mode);
    effectiveCommFar = selectFar(commFars, mode);
    effectiveFacilFar = selectFar(facilFars, mode);
  }

  const zoneDists = [...new Set(lots.map((l) => l.zoneDist).filter(Boolean))];
  const primary = lots.find((l) => l.isPrimary);
  const effectiveZoneDist = primary?.zoneDist ?? zoneDists[0] ?? '';

  return {
    lots,
    totalLotArea,
    totalExistingBldgArea,
    effectiveResidFar,
    effectiveCommFar,
    effectiveFacilFar,
    effectiveZoneDist,
    farSelectionMode: mode,
  };
}

export function selectFar(values: number[], mode: FarSelectionMode): number {
  if (values.length === 0) return 0;
  return mode === 'least_restrictive' ? Math.max(...values) : Math.min(...values);
}

export function hasMultipleZoningDistricts(lots: AssemblageLot[]): boolean {
  const zones = new Set(lots.map((l) => l.zoneDist).filter(Boolean));
  return zones.size > 1;
}
