import type { CapacityInput, FeasibilityResult } from '../../types/feasibility';
import { computeCapacity } from './capacity';
import { evaluateMih } from './mih';
import { evaluateUap } from './uap';
import { evaluate485x } from './tax485x';
import { evaluate421a } from './tax421a';
import { evaluate467m } from './tax467m';

export { computeCapacity, zoneAllowsRes, extractResDesignation } from './capacity';
export { evaluateMih, applyMihOverlay } from './mih';
export { evaluateUap } from './uap';
export { evaluate485x } from './tax485x';
export { evaluate421a } from './tax421a';
export { evaluate467m } from './tax467m';

export function evaluateFeasibility(
  input: CapacityInput,
  activePrograms: string[] = [],
  uapAffordableUtilizationPct?: number
): FeasibilityResult {
  const capacity = computeCapacity(input);

  const mih = evaluateMih(capacity);
  const uap = evaluateUap(capacity, input.lotArea, input.zoneDist, uapAffordableUtilizationPct);
  const tax485x = evaluate485x(capacity);
  const tax421a = evaluate421a(capacity);
  const tax467m = evaluate467m(capacity, activePrograms);

  const stackingConflicts: string[] = [];
  const has485x = activePrograms.some((p) => p.toLowerCase().includes('485-x'));
  const has421a = activePrograms.some((p) => p.toLowerCase().includes('421-a'));
  const hasJ51 = activePrograms.some((p) => p.toLowerCase().includes('j-51'));

  if (has485x && has421a) {
    stackingConflicts.push('485-x and 421-a are mutually exclusive tax programs');
  }
  if ((has485x || has421a || hasJ51) && tax467m.eligible !== 'no') {
    stackingConflicts.push(
      '467-m cannot stack with 421-a, 485-x, or J-51 exemptions'
    );
  }

  return {
    capacity,
    programs: [mih, uap, tax485x, tax421a, tax467m],
    stackingConflicts,
  };
}
