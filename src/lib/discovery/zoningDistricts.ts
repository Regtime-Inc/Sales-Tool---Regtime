import { COMMERCIAL_TO_RES_EQUIV, RES_UAP_EQUIV } from '../zoning/equivalences';

export interface ZoneSubDistrict {
  code: string;
  name: string;
  resEquiv?: string;
}

export interface ZoneGroup {
  prefix: string;
  label: string;
  subDistricts: ZoneSubDistrict[];
}

export const ZONE_GROUPS: ZoneGroup[] = [
  {
    prefix: 'R1',
    label: 'Single-Family Detached (Lowest)',
    subDistricts: [
      { code: 'R1-1', name: 'Detached, Large Lots' },
      { code: 'R1-2', name: 'Detached' },
      { code: 'R1-2A', name: 'Detached, Infill' },
    ],
  },
  {
    prefix: 'R2',
    label: 'Single-Family Detached (Low)',
    subDistricts: [
      { code: 'R2', name: 'Detached, Low Density' },
      { code: 'R2A', name: 'Infill' },
      { code: 'R2X', name: 'Detached, Large Lots' },
    ],
  },
  {
    prefix: 'R3',
    label: 'Low Density General Residence',
    subDistricts: [
      { code: 'R3-1', name: 'Low Density, Detached/Semi' },
      { code: 'R3-2', name: 'Low Density, General' },
      { code: 'R3A', name: 'Detached / Semi-Detached' },
      { code: 'R3X', name: 'Detached, Large Lots' },
    ],
  },
  {
    prefix: 'R4',
    label: 'Low-Medium Density Residence',
    subDistricts: [
      { code: 'R4', name: 'General Residence' },
      { code: 'R4-1', name: 'Low-Medium Density' },
      { code: 'R4A', name: 'Contextual Detached/Semi' },
      { code: 'R4B', name: 'Contextual Rowhouse' },
    ],
  },
  {
    prefix: 'R5',
    label: 'Medium Density Residence',
    subDistricts: [
      { code: 'R5', name: 'General Residence' },
      { code: 'R5A', name: 'Contextual' },
      { code: 'R5B', name: 'Contextual Rowhouse' },
      { code: 'R5D', name: 'Contextual Medium Density' },
    ],
  },
  {
    prefix: 'R6',
    label: 'Medium Density (UAP Eligible)',
    subDistricts: [
      { code: 'R6', name: 'General Residence, 2.2 FAR' },
      { code: 'R6A', name: 'Contextual, 3.0 FAR' },
      { code: 'R6B', name: 'Contextual Low-Rise, 2.0 FAR' },
      { code: 'R6-1', name: 'Height-Limited, 3.0 FAR' },
      { code: 'R6D', name: 'Contextual, 2.5 FAR' },
      { code: 'R6-2', name: 'Alt Medium Density, 2.5 FAR' },
    ],
  },
  {
    prefix: 'R7',
    label: 'Medium-High Density (UAP Eligible)',
    subDistricts: [
      { code: 'R7', name: 'General Residence, 3.44 FAR' },
      { code: 'R7A', name: 'Contextual, 4.0 FAR' },
      { code: 'R7-1', name: 'Medium-High Density, 3.44 FAR' },
      { code: 'R7-2', name: 'Medium-High Density Alt, 3.44 FAR' },
      { code: 'R7D', name: 'Contextual, 4.66 FAR' },
      { code: 'R7X', name: 'Wide Street Contextual, 5.0 FAR' },
      { code: 'R7-3', name: 'Medium-High Density Alt, 5.0 FAR' },
    ],
  },
  {
    prefix: 'R8',
    label: 'High Density (UAP Eligible)',
    subDistricts: [
      { code: 'R8', name: 'General Residence, 6.02 FAR' },
      { code: 'R8A', name: 'Contextual, 6.02 FAR' },
      { code: 'R8B', name: 'Narrow Street Contextual, 4.0 FAR' },
      { code: 'R8X', name: 'Wide Street Contextual, 6.02 FAR' },
    ],
  },
  {
    prefix: 'R9',
    label: 'Very High Density (UAP Eligible)',
    subDistricts: [
      { code: 'R9', name: 'General Residence, 7.52 FAR' },
      { code: 'R9A', name: 'Contextual, 7.52 FAR' },
      { code: 'R9D', name: 'Contextual, 9.0 FAR' },
      { code: 'R9X', name: 'Wide Street Contextual, 9.0 FAR' },
      { code: 'R9-1', name: 'Very High Density Alt, 9.0 FAR' },
    ],
  },
  {
    prefix: 'R10',
    label: 'Highest Density (UAP Eligible)',
    subDistricts: [
      { code: 'R10', name: 'General Residence, 10.0 FAR' },
      { code: 'R10A', name: 'Contextual, 10.0 FAR' },
      { code: 'R10X', name: 'Wide Street Contextual, 10.0 FAR' },
    ],
  },
  {
    prefix: 'R11-R12',
    label: 'Special High Density (UAP Eligible)',
    subDistricts: [
      { code: 'R11', name: 'Special High Density, 12.0 FAR' },
      { code: 'R12', name: 'Special Very High Density, 15.0 FAR' },
    ],
  },
  {
    prefix: 'C1',
    label: 'Local Retail (Residential Overlay)',
    subDistricts: [
      { code: 'C1-1', name: 'Local Retail, Low Density' },
      { code: 'C1-2', name: 'Local Retail, Low Density' },
      { code: 'C1-3', name: 'Local Retail, Low-Medium Density' },
      { code: 'C1-4', name: 'Local Retail, Medium Density' },
      { code: 'C1-5', name: 'Local Retail, Medium Density' },
      { code: 'C1-6', name: 'Local Retail, Medium-High Density', resEquiv: 'R7' },
      { code: 'C1-6A', name: 'Local Retail, Contextual', resEquiv: 'R7A' },
      { code: 'C1-7', name: 'Local Retail, High Density', resEquiv: 'R8' },
      { code: 'C1-7A', name: 'Local Retail, High Density Contextual', resEquiv: 'R8A' },
      { code: 'C1-8', name: 'Local Retail, Very High Density', resEquiv: 'R9' },
      { code: 'C1-8A', name: 'Local Retail, Very High Density Contextual', resEquiv: 'R9A' },
      { code: 'C1-8X', name: 'Local Retail, Very High Density Wide St', resEquiv: 'R9X' },
      { code: 'C1-9', name: 'Local Retail, Highest Density', resEquiv: 'R10' },
      { code: 'C1-9A', name: 'Local Retail, Highest Density Contextual', resEquiv: 'R10A' },
    ],
  },
  {
    prefix: 'C2',
    label: 'Local Service (Residential Overlay)',
    subDistricts: [
      { code: 'C2-1', name: 'Local Service, Low Density' },
      { code: 'C2-2', name: 'Local Service, Low Density' },
      { code: 'C2-3', name: 'Local Service, Low-Medium Density' },
      { code: 'C2-4', name: 'Local Service, Medium Density' },
      { code: 'C2-5', name: 'Local Service, Medium Density' },
      { code: 'C2-6', name: 'Local Service, Medium-High Density', resEquiv: 'R7' },
      { code: 'C2-6A', name: 'Local Service, Contextual', resEquiv: 'R7A' },
      { code: 'C2-7', name: 'Local Service, Very High Density', resEquiv: 'R9' },
      { code: 'C2-7A', name: 'Local Service, Very High Density Contextual', resEquiv: 'R9A' },
      { code: 'C2-7X', name: 'Local Service, Very High Density Wide St', resEquiv: 'R9X' },
      { code: 'C2-8', name: 'Local Service, Highest Density', resEquiv: 'R10' },
      { code: 'C2-8A', name: 'Local Service, Highest Density Contextual', resEquiv: 'R10A' },
    ],
  },
  {
    prefix: 'C3',
    label: 'Waterfront Recreation',
    subDistricts: [
      { code: 'C3', name: 'Waterfront Recreation', resEquiv: 'R3-2' },
      { code: 'C3A', name: 'Waterfront Recreation, Contextual', resEquiv: 'R3A' },
    ],
  },
  {
    prefix: 'C4',
    label: 'General Commercial',
    subDistricts: [
      { code: 'C4-1', name: 'General Commercial, Low Density', resEquiv: 'R5' },
      { code: 'C4-2', name: 'General Commercial, Medium Density', resEquiv: 'R6' },
      { code: 'C4-2A', name: 'General Commercial, Contextual', resEquiv: 'R6A' },
      { code: 'C4-3', name: 'General Commercial, Medium Density', resEquiv: 'R6' },
      { code: 'C4-3A', name: 'General Commercial, Contextual', resEquiv: 'R6A' },
      { code: 'C4-4', name: 'General Commercial, Medium-High Density', resEquiv: 'R7' },
      { code: 'C4-4A', name: 'General Commercial, Contextual', resEquiv: 'R7A' },
      { code: 'C4-4D', name: 'General Commercial, Contextual', resEquiv: 'R8A' },
      { code: 'C4-4L', name: 'General Commercial, Limited Height', resEquiv: 'R7A' },
      { code: 'C4-5', name: 'General Commercial, Medium-High Density', resEquiv: 'R7' },
      { code: 'C4-5A', name: 'General Commercial, Contextual', resEquiv: 'R7A' },
      { code: 'C4-5D', name: 'General Commercial, Contextual', resEquiv: 'R7D' },
      { code: 'C4-5X', name: 'General Commercial, Wide Street', resEquiv: 'R7X' },
      { code: 'C4-6', name: 'General Commercial, Highest Density', resEquiv: 'R10' },
      { code: 'C4-6A', name: 'General Commercial, Highest Contextual', resEquiv: 'R10A' },
      { code: 'C4-7', name: 'General Commercial, Highest Density', resEquiv: 'R10' },
      { code: 'C4-7A', name: 'General Commercial, Highest Contextual', resEquiv: 'R10A' },
    ],
  },
  {
    prefix: 'C5',
    label: 'Central Commercial',
    subDistricts: [
      { code: 'C5-1', name: 'Central Commercial', resEquiv: 'R10' },
      { code: 'C5-1A', name: 'Central Commercial, Contextual', resEquiv: 'R10A' },
      { code: 'C5-2', name: 'Central Commercial', resEquiv: 'R10' },
      { code: 'C5-2A', name: 'Central Commercial, Contextual', resEquiv: 'R10A' },
      { code: 'C5-3', name: 'Central Commercial', resEquiv: 'R10' },
      { code: 'C5-4', name: 'Central Commercial', resEquiv: 'R10' },
      { code: 'C5-5', name: 'Central Commercial', resEquiv: 'R10' },
    ],
  },
  {
    prefix: 'C6',
    label: 'General Central Commercial',
    subDistricts: [
      { code: 'C6-1', name: 'Central Commercial, Medium-High', resEquiv: 'R7' },
      { code: 'C6-1A', name: 'Central Commercial, Medium', resEquiv: 'R6' },
      { code: 'C6-2', name: 'Central Commercial, High Density', resEquiv: 'R8' },
      { code: 'C6-2A', name: 'Central Commercial, High Contextual', resEquiv: 'R8A' },
      { code: 'C6-3', name: 'Central Commercial, Very High', resEquiv: 'R9' },
      { code: 'C6-3A', name: 'Central Commercial, Very High Contextual', resEquiv: 'R9A' },
      { code: 'C6-3D', name: 'Central Commercial, Very High Contextual', resEquiv: 'R9D' },
      { code: 'C6-3X', name: 'Central Commercial, Very High Wide St', resEquiv: 'R9X' },
      { code: 'C6-4', name: 'Central Commercial, Highest', resEquiv: 'R10' },
      { code: 'C6-4A', name: 'Central Commercial, Highest Contextual', resEquiv: 'R10A' },
      { code: 'C6-4X', name: 'Central Commercial, Highest Wide St', resEquiv: 'R10X' },
      { code: 'C6-5', name: 'Central Commercial, Highest', resEquiv: 'R10' },
      { code: 'C6-6', name: 'Central Commercial, Highest', resEquiv: 'R10' },
      { code: 'C6-7', name: 'Central Commercial, Highest', resEquiv: 'R10' },
      { code: 'C6-8', name: 'Central Commercial, Highest', resEquiv: 'R10' },
      { code: 'C6-9', name: 'Central Commercial, Highest', resEquiv: 'R10' },
    ],
  },
  {
    prefix: 'C7',
    label: 'Waterfront Commercial',
    subDistricts: [
      { code: 'C7', name: 'Waterfront Commercial' },
    ],
  },
  {
    prefix: 'C8',
    label: 'Heavy Commercial Service',
    subDistricts: [
      { code: 'C8-1', name: 'Heavy Commercial, General' },
      { code: 'C8-2', name: 'Heavy Commercial, Auto Related' },
      { code: 'C8-3', name: 'Heavy Commercial, High Performance' },
      { code: 'C8-4', name: 'Heavy Commercial, High Bulk' },
    ],
  },
  {
    prefix: 'M1',
    label: 'Light Manufacturing',
    subDistricts: [
      { code: 'M1-1', name: 'Light Mfg, Low Density (1.0 FAR)' },
      { code: 'M1-2', name: 'Light Mfg, Medium Density (2.0 FAR)' },
      { code: 'M1-3', name: 'Light Mfg, Medium Density (2.0 FAR)' },
      { code: 'M1-4', name: 'Light Mfg, Medium-High (2.0 FAR)' },
      { code: 'M1-5', name: 'Light Mfg, High Density (5.0 FAR)' },
      { code: 'M1-6', name: 'Light Mfg, High Density (10.0 FAR)' },
    ],
  },
  {
    prefix: 'M2',
    label: 'Medium Manufacturing',
    subDistricts: [
      { code: 'M2-1', name: 'Medium Mfg, Low Density (2.0 FAR)' },
      { code: 'M2-2', name: 'Medium Mfg, Medium Density (2.0 FAR)' },
      { code: 'M2-3', name: 'Medium Mfg, Medium-High (5.0 FAR)' },
      { code: 'M2-4', name: 'Medium Mfg, High Density (10.0 FAR)' },
    ],
  },
  {
    prefix: 'M3',
    label: 'Heavy Manufacturing',
    subDistricts: [
      { code: 'M3-1', name: 'Heavy Mfg, Low Density (2.0 FAR)' },
      { code: 'M3-2', name: 'Heavy Mfg, Medium Density (2.0 FAR)' },
    ],
  },
];

const UAP_RES_PREFIXES = new Set(RES_UAP_EQUIV);

function isUapResidential(code: string): boolean {
  return UAP_RES_PREFIXES.has(code) ||
    [...UAP_RES_PREFIXES].some((p) => code.startsWith(p));
}

export function getDefaultZoneCodes(): string[] {
  const codes: string[] = [];
  for (const group of ZONE_GROUPS) {
    for (const sd of group.subDistricts) {
      if (sd.code.startsWith('R') && isUapResidential(sd.code)) {
        codes.push(sd.code);
      } else if (sd.resEquiv && isUapResidential(sd.resEquiv)) {
        codes.push(sd.code);
      }
    }
  }
  return codes;
}

export function getAllZoneCodes(): string[] {
  return ZONE_GROUPS.flatMap((g) => g.subDistricts.map((sd) => sd.code));
}
