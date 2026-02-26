import type { OptimizerInputs, SensitivityRow, OptimizerResult } from '../../types/optimizer';
import { solve } from './solver';

const RENT_SHOCKS = [
  { label: '+10% Market Rents', factor: 1.10, band: 0 },
  { label: '-10% Market Rents', factor: 0.90, band: 0 },
  { label: '+10% Affordable Rents', factor: 1.10, band: -1 },
  { label: '-10% Affordable Rents', factor: 0.90, band: -1 },
];

function solveWithRepair(inputs: OptimizerInputs): OptimizerResult {
  const result = solve(inputs);
  if (result.feasible) return result;

  if (inputs.totalUnits && inputs.totalUnits > 1) {
    const relaxed = structuredClone(inputs);
    relaxed.totalUnits = inputs.totalUnits + 1;
    const retried = solve(relaxed);
    if (retried.feasible) return retried;
  }

  const relaxedSF = structuredClone(inputs);
  relaxedSF.netResidentialSF = Math.round(inputs.netResidentialSF * 1.02);
  const retriedSF = solve(relaxedSF);
  if (retriedSF.feasible) return retriedSF;

  return result;
}

export function runSensitivity(baseInputs: OptimizerInputs, baseResult: OptimizerResult): SensitivityRow[] {
  const rows: SensitivityRow[] = [];

  for (const shock of RENT_SHOCKS) {
    const adjusted = structuredClone(baseInputs);
    adjusted.rentAssumptions = adjusted.rentAssumptions.map((r) => {
      const applies = shock.band === -1 ? r.amiBand > 0 : r.amiBand === shock.band;
      return applies ? { ...r, monthlyRent: Math.round(r.monthlyRent * shock.factor) } : r;
    });

    const newResult = solveWithRepair(adjusted);
    rows.push({
      parameter: 'Rent',
      change: shock.label,
      baseROI: baseResult.roiProxy,
      newROI: newResult.roiProxy,
      roiDelta: newResult.roiProxy - baseResult.roiProxy,
      stillFeasible: newResult.feasible,
    });
  }

  const costShocks = [
    { label: '+10% Hard Costs', field: 'hardCostPerSF' as const, factor: 1.10 },
    { label: '-10% Hard Costs', field: 'hardCostPerSF' as const, factor: 0.90 },
    { label: '+10% Land Costs', field: 'landCostPerSF' as const, factor: 1.10 },
    { label: '-10% Land Costs', field: 'landCostPerSF' as const, factor: 0.90 },
  ];

  for (const shock of costShocks) {
    const adjusted = structuredClone(baseInputs);
    (adjusted.costAssumptions as unknown as Record<string, number>)[shock.field] *= shock.factor;
    const newResult = solveWithRepair(adjusted);
    rows.push({
      parameter: 'Cost',
      change: shock.label,
      baseROI: baseResult.roiProxy,
      newROI: newResult.roiProxy,
      roiDelta: newResult.roiProxy - baseResult.roiProxy,
      stillFeasible: newResult.feasible,
    });
  }

  return rows;
}
