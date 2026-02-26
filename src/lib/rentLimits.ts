export interface HpdRentScheduleEntry {
  year: number;
  ami: number;
  unitType: string;
  maxMonthlyRent: number;
}

export const HPD_2025_RENTS: HpdRentScheduleEntry[] = [
  { year: 2025, ami: 30, unitType: 'Studio', maxMonthlyRent: 850 },
  { year: 2025, ami: 30, unitType: '1BR', maxMonthlyRent: 911 },
  { year: 2025, ami: 30, unitType: '2BR', maxMonthlyRent: 1093 },
  { year: 2025, ami: 30, unitType: '3BR', maxMonthlyRent: 1263 },

  { year: 2025, ami: 40, unitType: 'Studio', maxMonthlyRent: 1134 },
  { year: 2025, ami: 40, unitType: '1BR', maxMonthlyRent: 1215 },
  { year: 2025, ami: 40, unitType: '2BR', maxMonthlyRent: 1458 },
  { year: 2025, ami: 40, unitType: '3BR', maxMonthlyRent: 1685 },

  { year: 2025, ami: 50, unitType: 'Studio', maxMonthlyRent: 1417 },
  { year: 2025, ami: 50, unitType: '1BR', maxMonthlyRent: 1518 },
  { year: 2025, ami: 50, unitType: '2BR', maxMonthlyRent: 1822 },
  { year: 2025, ami: 50, unitType: '3BR', maxMonthlyRent: 2106 },

  { year: 2025, ami: 60, unitType: 'Studio', maxMonthlyRent: 1701 },
  { year: 2025, ami: 60, unitType: '1BR', maxMonthlyRent: 1822 },
  { year: 2025, ami: 60, unitType: '2BR', maxMonthlyRent: 2187 },
  { year: 2025, ami: 60, unitType: '3BR', maxMonthlyRent: 2527 },

  { year: 2025, ami: 70, unitType: 'Studio', maxMonthlyRent: 1984 },
  { year: 2025, ami: 70, unitType: '1BR', maxMonthlyRent: 2126 },
  { year: 2025, ami: 70, unitType: '2BR', maxMonthlyRent: 2551 },
  { year: 2025, ami: 70, unitType: '3BR', maxMonthlyRent: 2948 },

  { year: 2025, ami: 80, unitType: 'Studio', maxMonthlyRent: 2268 },
  { year: 2025, ami: 80, unitType: '1BR', maxMonthlyRent: 2430 },
  { year: 2025, ami: 80, unitType: '2BR', maxMonthlyRent: 2916 },
  { year: 2025, ami: 80, unitType: '3BR', maxMonthlyRent: 3370 },

  { year: 2025, ami: 90, unitType: 'Studio', maxMonthlyRent: 2552 },
  { year: 2025, ami: 90, unitType: '1BR', maxMonthlyRent: 2733 },
  { year: 2025, ami: 90, unitType: '2BR', maxMonthlyRent: 3281 },
  { year: 2025, ami: 90, unitType: '3BR', maxMonthlyRent: 3791 },

  { year: 2025, ami: 100, unitType: 'Studio', maxMonthlyRent: 2835 },
  { year: 2025, ami: 100, unitType: '1BR', maxMonthlyRent: 3037 },
  { year: 2025, ami: 100, unitType: '2BR', maxMonthlyRent: 3645 },
  { year: 2025, ami: 100, unitType: '3BR', maxMonthlyRent: 4212 },

  { year: 2025, ami: 110, unitType: 'Studio', maxMonthlyRent: 3119 },
  { year: 2025, ami: 110, unitType: '1BR', maxMonthlyRent: 3341 },
  { year: 2025, ami: 110, unitType: '2BR', maxMonthlyRent: 4010 },
  { year: 2025, ami: 110, unitType: '3BR', maxMonthlyRent: 4633 },

  { year: 2025, ami: 120, unitType: 'Studio', maxMonthlyRent: 3402 },
  { year: 2025, ami: 120, unitType: '1BR', maxMonthlyRent: 3644 },
  { year: 2025, ami: 120, unitType: '2BR', maxMonthlyRent: 4374 },
  { year: 2025, ami: 120, unitType: '3BR', maxMonthlyRent: 5054 },

  { year: 2025, ami: 130, unitType: 'Studio', maxMonthlyRent: 3685 },
  { year: 2025, ami: 130, unitType: '1BR', maxMonthlyRent: 3948 },
  { year: 2025, ami: 130, unitType: '2BR', maxMonthlyRent: 4738 },
  { year: 2025, ami: 130, unitType: '3BR', maxMonthlyRent: 5476 },

  { year: 2025, ami: 165, unitType: 'Studio', maxMonthlyRent: 4678 },
  { year: 2025, ami: 165, unitType: '1BR', maxMonthlyRent: 5011 },
  { year: 2025, ami: 165, unitType: '2BR', maxMonthlyRent: 6014 },
  { year: 2025, ami: 165, unitType: '3BR', maxMonthlyRent: 6950 },
];

export const HPD_SCHEDULE_YEAR = 2025;
export const NYC_METRO_AMI_100 = 145800;

export function getRentLimit(
  unitType: string,
  amiBand: number,
  year: number = HPD_SCHEDULE_YEAR,
): number | null {
  const exact = HPD_2025_RENTS.find(
    (e) => e.unitType === unitType && e.ami === amiBand && e.year === year,
  );
  if (exact) return exact.maxMonthlyRent;

  const sameType = HPD_2025_RENTS.filter((e) => e.unitType === unitType && e.year === year);
  if (sameType.length === 0) return null;

  const closest = sameType.reduce((best, e) =>
    Math.abs(e.ami - amiBand) < Math.abs(best.ami - amiBand) ? e : best,
  );
  return closest.maxMonthlyRent;
}
