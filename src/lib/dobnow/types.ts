export interface DobNowOwnerContact {
  ownerType: string | null;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  businessName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: 'dobnow_payload' | 'dobnow_manual_import';
  evidence: { jobNumber: string; snippet?: string }[];
}

export interface DobNowJob {
  jobNumber: string;
  bbl: string | null;
  address: string | null;
  ownerContact: DobNowOwnerContact | null;
}
