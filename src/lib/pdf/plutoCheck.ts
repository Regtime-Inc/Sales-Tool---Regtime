import type { PlutoCheckResult, ExtractedPdfData } from '../../types/pdf';

interface PlutoInput {
  lotarea: number;
  residfar: number;
  bldgarea: number;
}

export function crossCheckWithPluto(
  extracted: ExtractedPdfData,
  pluto: PlutoInput | null | undefined
): PlutoCheckResult {
  const warnings: string[] = [];
  const plutoValues: PlutoCheckResult['plutoValues'] = {};

  if (!pluto) {
    return { warnings: [], plutoValues: {} };
  }

  const lotArea = pluto.lotarea || 0;
  const residFar = pluto.residfar || 0;
  const bldgArea = pluto.bldgarea || 0;

  plutoValues.lotArea = lotArea;
  plutoValues.residFar = residFar;
  plutoValues.bldgArea = bldgArea;

  if (lotArea > 0 && residFar > 0) {
    const maxResGSF = lotArea * residFar;
    const netResSF = maxResGSF * 0.80;
    const impliedUnitsEst = Math.round(netResSF / 800);
    plutoValues.impliedMaxUnits = impliedUnitsEst;

    const extractedTotal = extracted.totals.totalUnits;
    if (extractedTotal > 0 && impliedUnitsEst > 0) {
      const diff = Math.abs(extractedTotal - impliedUnitsEst) / impliedUnitsEst;
      if (diff > 0.4 && extracted.confidence.overall < 0.8) {
        warnings.push(
          `Plan total (${extractedTotal} units) differs from PLUTO screening estimate (${impliedUnitsEst} units) by ${Math.round(diff * 100)}%; verify plan data.`
        );
      }
    }
  }

  if (extracted.far?.lotAreaSf && lotArea > 0) {
    const diff = Math.abs(extracted.far.lotAreaSf - lotArea) / lotArea;
    if (diff > 0.1) {
      warnings.push(
        `PDF lot area (${extracted.far.lotAreaSf.toLocaleString()} SF) differs from PLUTO (${lotArea.toLocaleString()} SF) by ${Math.round(diff * 100)}%.`
      );
    }
  }

  if (extracted.far?.proposedFAR && residFar > 0) {
    if (extracted.far.proposedFAR > residFar * 1.05) {
      warnings.push(
        `PDF proposed FAR (${extracted.far.proposedFAR}) exceeds PLUTO residential FAR (${residFar}); may require zoning override or bonus.`
      );
    }
  }

  return { warnings, plutoValues };
}
