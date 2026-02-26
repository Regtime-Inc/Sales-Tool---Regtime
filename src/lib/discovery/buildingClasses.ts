export interface BldgSubClass {
  code: string;
  name: string;
}

export interface BldgClassGroup {
  prefix: string;
  label: string;
  subClasses: BldgSubClass[];
}

export const BLDG_CLASS_GROUPS: BldgClassGroup[] = [
  {
    prefix: 'A',
    label: 'One Family Dwellings',
    subClasses: [
      { code: 'A0', name: 'Cape Cod' },
      { code: 'A1', name: 'Two Stories, Detached' },
      { code: 'A2', name: 'One Story, Permanent Living Quarter' },
      { code: 'A3', name: 'Large Suburban Residence' },
      { code: 'A4', name: 'City Residence, One Family' },
      { code: 'A5', name: 'Attached or Semi-Detached' },
      { code: 'A6', name: 'Summer Cottage' },
      { code: 'A7', name: 'Mansion Type or Town House' },
      { code: 'A8', name: 'Bungalow Colony / Land Coop' },
      { code: 'A9', name: 'Miscellaneous One Family' },
    ],
  },
  {
    prefix: 'B',
    label: 'Two Family Dwellings',
    subClasses: [
      { code: 'B1', name: 'Two Family, Detached' },
      { code: 'B2', name: 'Two Family, Semi-Attached' },
      { code: 'B3', name: 'Two Family, Brick' },
      { code: 'B9', name: 'Miscellaneous Two Family' },
    ],
  },
  {
    prefix: 'C',
    label: 'Walk-Up Apartments',
    subClasses: [
      { code: 'C0', name: 'Three Families' },
      { code: 'C1', name: 'Over Six Families Without Stores' },
      { code: 'C2', name: 'Five to Six Families' },
      { code: 'C3', name: 'Six to Ten Families' },
      { code: 'C4', name: 'Over Ten Families' },
      { code: 'C5', name: 'Five to Six Family, Converted' },
      { code: 'C6', name: 'Cooperative Walk-Up' },
      { code: 'C7', name: 'Over Six Families, Fireproof' },
      { code: 'C8', name: 'Co-op, Over Six Families' },
      { code: 'C9', name: 'Garden Apartments, Walk-Up' },
      { code: 'CM', name: 'Mobile Homes / Trailer Parks' },
    ],
  },
  {
    prefix: 'D',
    label: 'Elevator Apartments',
    subClasses: [
      { code: 'D0', name: 'Co-op, Conversion' },
      { code: 'D1', name: 'Semi-Fireproof with Stores' },
      { code: 'D2', name: 'Fireproof with Stores (Loft Type)' },
      { code: 'D3', name: 'Fireproof without Stores' },
      { code: 'D4', name: 'Cooperative' },
      { code: 'D5', name: 'Converted' },
      { code: 'D6', name: 'Fireproof with Stores & Offices' },
      { code: 'D7', name: 'Semi-Fireproof without Stores' },
      { code: 'D8', name: 'Luxury Type' },
      { code: 'D9', name: 'Miscellaneous Elevator' },
    ],
  },
  {
    prefix: 'E',
    label: 'Warehouses',
    subClasses: [
      { code: 'E1', name: 'Fireproof' },
      { code: 'E2', name: "Contractor's Warehouse" },
      { code: 'E3', name: 'Semi-Fireproof' },
      { code: 'E4', name: 'Metal Frame' },
      { code: 'E7', name: 'Self-Storage' },
      { code: 'E9', name: 'Miscellaneous Warehouse' },
    ],
  },
  {
    prefix: 'F',
    label: 'Factory & Industrial',
    subClasses: [
      { code: 'F1', name: 'Fireproof' },
      { code: 'F2', name: 'Recording & Motion Picture' },
      { code: 'F4', name: 'Semi-Fireproof' },
      { code: 'F5', name: 'Loft Type' },
      { code: 'F8', name: 'Tank Farms' },
      { code: 'F9', name: 'Miscellaneous Factory' },
    ],
  },
  {
    prefix: 'G',
    label: 'Garages & Gas Stations',
    subClasses: [
      { code: 'G0', name: 'Residential Tax Class 1 Garage' },
      { code: 'G1', name: 'All Parking Garages' },
      { code: 'G2', name: 'Auto Body / Collision / Repair' },
      { code: 'G3', name: 'Gas Station with Retail' },
      { code: 'G4', name: 'Gas Station with Service/Repair' },
      { code: 'G5', name: 'Parking Lot' },
      { code: 'G6', name: 'Licensed Parking Lot' },
      { code: 'G7', name: 'Unlicensed Parking Lot' },
      { code: 'G8', name: 'Car Sales/Rental with Office' },
      { code: 'G9', name: 'Miscellaneous Garage' },
      { code: 'GU', name: 'Unfinished Garage' },
      { code: 'GW', name: 'Car Wash / Lubritorium' },
    ],
  },
  {
    prefix: 'H',
    label: 'Hotels',
    subClasses: [
      { code: 'H1', name: 'Luxury Type' },
      { code: 'H2', name: 'Full Service' },
      { code: 'H3', name: 'Limited Service, Many Floors' },
      { code: 'H4', name: 'Motel Type' },
      { code: 'H5', name: 'Hotel / Private Club' },
      { code: 'H6', name: 'Apartment Hotel' },
      { code: 'H7', name: 'Apartment Hotel, Co-op' },
      { code: 'H8', name: 'Dormitory' },
      { code: 'H9', name: 'Miscellaneous Hotel' },
      { code: 'HB', name: 'Boutique (10-100 Rooms)' },
      { code: 'HH', name: 'Hostels' },
      { code: 'HR', name: 'SRO' },
      { code: 'HS', name: 'Extended Stay / Suite' },
    ],
  },
  {
    prefix: 'K',
    label: 'Store Buildings',
    subClasses: [
      { code: 'K1', name: 'One Story Retail' },
      { code: 'K2', name: 'Multi-Story Retail with Office' },
      { code: 'K3', name: 'Multi-Story Department Store' },
      { code: 'K4', name: 'Predominately Retail with Office' },
      { code: 'K5', name: 'Stand-Alone Food Establishment' },
      { code: 'K6', name: 'Shopping Center with Anchor' },
      { code: 'K7', name: 'Banking Facilities with Office' },
      { code: 'K8', name: 'Big Box Retail (Not Food)' },
      { code: 'K9', name: 'Miscellaneous Store' },
    ],
  },
  {
    prefix: 'L',
    label: 'Loft Buildings',
    subClasses: [
      { code: 'L1', name: 'Fireproof, Over 8 Stories' },
      { code: 'L2', name: 'Fireproof, Loft Type' },
      { code: 'L3', name: 'Semi-Fireproof' },
      { code: 'L8', name: 'Fireproof with Retail' },
      { code: 'L9', name: 'Miscellaneous Loft' },
    ],
  },
  {
    prefix: 'O',
    label: 'Office Buildings',
    subClasses: [
      { code: 'O1', name: 'Fireproof, Office Use' },
      { code: 'O2', name: 'Fireproof, Loft Type' },
      { code: 'O3', name: 'Office with Retail' },
      { code: 'O4', name: 'Office Tower' },
      { code: 'O5', name: 'Non-Fireproof' },
      { code: 'O6', name: 'Court House' },
      { code: 'O7', name: 'Office with Adjacent Parking' },
      { code: 'O8', name: 'Office in Mixed-Use' },
      { code: 'O9', name: 'Miscellaneous Office' },
    ],
  },
  {
    prefix: 'R',
    label: 'Condominiums',
    subClasses: [
      { code: 'R0', name: 'Condo Billed as Unit' },
      { code: 'R1', name: 'Residential Unit, Elevator' },
      { code: 'R2', name: 'Residential Unit, Walk-Up' },
      { code: 'R3', name: 'Residential Unit, 1-3 Story' },
      { code: 'R4', name: 'Residential Unit, Converted' },
      { code: 'R5', name: 'Miscellaneous Commercial Condo' },
      { code: 'R6', name: 'Condo Office' },
      { code: 'R7', name: 'Condo Commercial Unit' },
      { code: 'R8', name: 'Condo in Non-Condo Bldg' },
      { code: 'R9', name: 'Co-op within Condo' },
      { code: 'RA', name: 'Cultural / Medical / Educational' },
      { code: 'RB', name: 'Office Space' },
      { code: 'RC', name: 'Commercial' },
      { code: 'RD', name: 'Residential' },
      { code: 'RG', name: 'Indoor Parking' },
      { code: 'RH', name: 'Hotel / Boatel' },
      { code: 'RI', name: 'Mixed Commercial / Residential' },
      { code: 'RK', name: 'Retail Space' },
      { code: 'RM', name: 'Multi-Use' },
      { code: 'RP', name: 'Outdoor Parking' },
      { code: 'RR', name: 'Non-Business Storage' },
      { code: 'RS', name: 'Primary / Secondary School' },
      { code: 'RW', name: 'Condo Parking' },
      { code: 'RX', name: 'Multi-Use (Primarily Comm.)' },
    ],
  },
  {
    prefix: 'S',
    label: 'Residence, Multiple Use',
    subClasses: [
      { code: 'S0', name: '1 Family with 2 Stores' },
      { code: 'S1', name: '1 Family with 1 Store' },
      { code: 'S2', name: '2 Family with 1 Store' },
      { code: 'S3', name: '3 Family with 1 Store' },
      { code: 'S4', name: '4+ Family with 1 Store' },
      { code: 'S5', name: '1 Family with Office' },
      { code: 'S9', name: 'Miscellaneous Mixed Res' },
    ],
  },
  {
    prefix: 'I',
    label: 'Hospitals & Health',
    subClasses: [
      { code: 'I1', name: 'Hospital, Sanitarium, Mental' },
      { code: 'I2', name: 'Infirmary' },
      { code: 'I3', name: 'Dispensary' },
      { code: 'I4', name: 'Staff Facility' },
      { code: 'I5', name: 'Health Center, Child Center, Clinic' },
      { code: 'I6', name: 'Nursing Home' },
      { code: 'I7', name: 'Adult Care Facility' },
      { code: 'I9', name: 'Miscellaneous Hospital' },
    ],
  },
  {
    prefix: 'J',
    label: 'Theatres',
    subClasses: [
      { code: 'J1', name: 'Theatre (Art Type, Less Than 400 Seats)' },
      { code: 'J2', name: 'Theatre (Art Type, 400+ Seats)' },
      { code: 'J3', name: 'Motion Picture Theatre' },
      { code: 'J4', name: 'Legitimate Theatre (300+ Seats)' },
      { code: 'J5', name: 'Theatre in Mixed-Use' },
      { code: 'J6', name: 'TV Studio' },
      { code: 'J7', name: 'Off-Broadway Theatre' },
      { code: 'J8', name: 'Multi-Screen Cinema' },
      { code: 'J9', name: 'Miscellaneous Theatre' },
    ],
  },
  {
    prefix: 'M',
    label: 'Religious & Educational',
    subClasses: [
      { code: 'M1', name: 'Church, Synagogue, Chapel' },
      { code: 'M2', name: 'Mission House (Non-Residential)' },
      { code: 'M3', name: 'Parsonage, Rectory' },
      { code: 'M4', name: 'Convent' },
      { code: 'M9', name: 'Miscellaneous Religious' },
    ],
  },
  {
    prefix: 'N',
    label: 'Asylums & Homes',
    subClasses: [
      { code: 'N1', name: 'Asylum' },
      { code: 'N2', name: 'Home for Aged' },
      { code: 'N3', name: 'Orphanage' },
      { code: 'N4', name: 'Detention / Jail' },
      { code: 'N9', name: 'Miscellaneous Asylum' },
    ],
  },
  {
    prefix: 'V',
    label: 'Vacant Land',
    subClasses: [
      { code: 'V0', name: 'Zoned Residential, Not Manhattan' },
      { code: 'V1', name: 'Zoned Comm. or Manhattan Res.' },
      { code: 'V2', name: 'Zoned Comm. Adjacent to Class 1' },
      { code: 'V3', name: 'Zoned Primarily Res., Mixed' },
      { code: 'V4', name: 'Police or Fire' },
      { code: 'V5', name: 'School Site' },
      { code: 'V6', name: 'Library Site' },
      { code: 'V7', name: 'Previously Class 1, Now Vacant' },
      { code: 'V8', name: 'Residential, Over 11 Units' },
      { code: 'V9', name: 'Miscellaneous Vacant' },
    ],
  },
  {
    prefix: 'Z',
    label: 'Miscellaneous',
    subClasses: [
      { code: 'Z0', name: 'Tennis Court' },
      { code: 'Z1', name: 'Public Utility' },
      { code: 'Z2', name: 'Communications Facility' },
      { code: 'Z3', name: 'Gas or Electric Utility' },
      { code: 'Z4', name: 'Telephone Utility' },
      { code: 'Z5', name: 'Water Utility' },
      { code: 'Z7', name: 'Easement' },
      { code: 'Z8', name: 'Cemetery' },
      { code: 'Z9', name: 'Miscellaneous' },
    ],
  },
];

const subClassMap = new Map<string, string>();
for (const g of BLDG_CLASS_GROUPS) {
  for (const sc of g.subClasses) {
    subClassMap.set(sc.code, sc.name);
  }
}

const DEFAULT_EXCLUDED_CODES = new Set(['C6', 'C7', 'C8', 'C9']);

export function getDefaultBldgClassCodes(): string[] {
  return BLDG_CLASS_GROUPS.flatMap((g) =>
    g.subClasses
      .filter((sc) => !DEFAULT_EXCLUDED_CODES.has(sc.code))
      .map((sc) => sc.code)
  );
}

export function getBldgClassName(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase().trim();
  const exact = subClassMap.get(upper);
  if (exact) return `${upper} - ${exact}`;
  const group = BLDG_CLASS_GROUPS.find((g) => g.prefix === upper[0]);
  if (group) return `${upper} - ${group.label}`;
  return upper;
}
