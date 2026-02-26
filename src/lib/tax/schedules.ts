import type { IncentiveSchedule } from '../../types/tax';

function buildSchedule(
  program: string,
  option: string,
  label: string,
  entries: Array<{ year: number; exemptionPct: number; abatementPct: number }>
): IncentiveSchedule {
  return { program, option, label: `${label} (Illustrative)`, entries };
}

export const SCHEDULE_485X: IncentiveSchedule[] = [
  buildSchedule('485-x', 'Option A (Large)', '485-x Option A (Large) – 35 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 22 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 26, exemptionPct: 80, abatementPct: 0 },
    { year: 27, exemptionPct: 80, abatementPct: 0 },
    { year: 28, exemptionPct: 60, abatementPct: 0 },
    { year: 29, exemptionPct: 60, abatementPct: 0 },
    { year: 30, exemptionPct: 40, abatementPct: 0 },
    { year: 31, exemptionPct: 40, abatementPct: 0 },
    { year: 32, exemptionPct: 20, abatementPct: 0 },
    { year: 33, exemptionPct: 20, abatementPct: 0 },
    { year: 34, exemptionPct: 10, abatementPct: 0 },
    { year: 35, exemptionPct: 10, abatementPct: 0 },
  ]),
  buildSchedule('485-x', 'Option A (Very Large)', '485-x Option A (Very Large) – 40 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 27 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 31, exemptionPct: 80, abatementPct: 0 },
    { year: 32, exemptionPct: 80, abatementPct: 0 },
    { year: 33, exemptionPct: 60, abatementPct: 0 },
    { year: 34, exemptionPct: 60, abatementPct: 0 },
    { year: 35, exemptionPct: 40, abatementPct: 0 },
    { year: 36, exemptionPct: 40, abatementPct: 0 },
    { year: 37, exemptionPct: 20, abatementPct: 0 },
    { year: 38, exemptionPct: 20, abatementPct: 0 },
    { year: 39, exemptionPct: 10, abatementPct: 0 },
    { year: 40, exemptionPct: 10, abatementPct: 0 },
  ]),
  buildSchedule('485-x', 'Option B', '485-x Option B – 35 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 22 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 26, exemptionPct: 80, abatementPct: 0 },
    { year: 27, exemptionPct: 80, abatementPct: 0 },
    { year: 28, exemptionPct: 60, abatementPct: 0 },
    { year: 29, exemptionPct: 60, abatementPct: 0 },
    { year: 30, exemptionPct: 40, abatementPct: 0 },
    { year: 31, exemptionPct: 40, abatementPct: 0 },
    { year: 32, exemptionPct: 20, abatementPct: 0 },
    { year: 33, exemptionPct: 20, abatementPct: 0 },
    { year: 34, exemptionPct: 10, abatementPct: 0 },
    { year: 35, exemptionPct: 10, abatementPct: 0 },
  ]),
];

export const SCHEDULE_421A: IncentiveSchedule[] = [
  buildSchedule('421-a', 'Option A (Homeownership)', '421-a Option A – 28 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 15 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 19, exemptionPct: 80, abatementPct: 0 },
    { year: 20, exemptionPct: 80, abatementPct: 0 },
    { year: 21, exemptionPct: 60, abatementPct: 0 },
    { year: 22, exemptionPct: 60, abatementPct: 0 },
    { year: 23, exemptionPct: 40, abatementPct: 0 },
    { year: 24, exemptionPct: 40, abatementPct: 0 },
    { year: 25, exemptionPct: 20, abatementPct: 0 },
    { year: 26, exemptionPct: 20, abatementPct: 0 },
    { year: 27, exemptionPct: 10, abatementPct: 0 },
    { year: 28, exemptionPct: 10, abatementPct: 0 },
  ]),
  buildSchedule('421-a', 'Option B (Rental)', '421-a Option B – 38 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 25 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 29, exemptionPct: 80, abatementPct: 0 },
    { year: 30, exemptionPct: 80, abatementPct: 0 },
    { year: 31, exemptionPct: 60, abatementPct: 0 },
    { year: 32, exemptionPct: 60, abatementPct: 0 },
    { year: 33, exemptionPct: 40, abatementPct: 0 },
    { year: 34, exemptionPct: 40, abatementPct: 0 },
    { year: 35, exemptionPct: 20, abatementPct: 0 },
    { year: 36, exemptionPct: 20, abatementPct: 0 },
    { year: 37, exemptionPct: 10, abatementPct: 0 },
    { year: 38, exemptionPct: 10, abatementPct: 0 },
  ]),
  buildSchedule('421-a', 'Option C (Enhanced)', '421-a Option C – 38 yr', [
    ...Array.from({ length: 3 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    ...Array.from({ length: 25 }, (_, i) => ({ year: i + 4, exemptionPct: 100, abatementPct: 0 })),
    { year: 29, exemptionPct: 80, abatementPct: 0 },
    { year: 30, exemptionPct: 80, abatementPct: 0 },
    { year: 31, exemptionPct: 60, abatementPct: 0 },
    { year: 32, exemptionPct: 60, abatementPct: 0 },
    { year: 33, exemptionPct: 40, abatementPct: 0 },
    { year: 34, exemptionPct: 40, abatementPct: 0 },
    { year: 35, exemptionPct: 20, abatementPct: 0 },
    { year: 36, exemptionPct: 20, abatementPct: 0 },
    { year: 37, exemptionPct: 10, abatementPct: 0 },
    { year: 38, exemptionPct: 10, abatementPct: 0 },
  ]),
];

export const SCHEDULE_467M: IncentiveSchedule[] = [
  buildSchedule('467-m', '467-m', '467-m Partial Exemption – 35 yr', [
    ...Array.from({ length: 25 }, (_, i) => ({ year: i + 1, exemptionPct: 100, abatementPct: 0 })),
    { year: 26, exemptionPct: 80, abatementPct: 0 },
    { year: 27, exemptionPct: 80, abatementPct: 0 },
    { year: 28, exemptionPct: 60, abatementPct: 0 },
    { year: 29, exemptionPct: 60, abatementPct: 0 },
    { year: 30, exemptionPct: 40, abatementPct: 0 },
    { year: 31, exemptionPct: 40, abatementPct: 0 },
    { year: 32, exemptionPct: 20, abatementPct: 0 },
    { year: 33, exemptionPct: 20, abatementPct: 0 },
    { year: 34, exemptionPct: 10, abatementPct: 0 },
    { year: 35, exemptionPct: 10, abatementPct: 0 },
  ]),
];

export const ALL_SCHEDULES: IncentiveSchedule[] = [
  ...SCHEDULE_485X,
  ...SCHEDULE_421A,
  ...SCHEDULE_467M,
];
