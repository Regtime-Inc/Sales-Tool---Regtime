export type StakeholderRole =
  | 'OWNER'
  | 'MANAGING_AGENT'
  | 'GC'
  | 'ARCHITECT'
  | 'ENGINEER'
  | 'APPLICANT'
  | 'FILING_REP'
  | 'SELLER'
  | 'OTHER';

export interface ProvenanceEntry {
  sourceSystem: string;
  datasetId: string;
  recordKey: string;
  fieldsUsed: string[];
  url?: string;
  timestamp: string;
}

export interface ContactPhone {
  raw: string;
  e164?: string;
  confidence: number;
}

export interface ContactEmail {
  email: string;
  confidence: number;
}

export interface StakeholderAddress {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  source: string;
  confidence: number;
}

export interface StakeholderLicense {
  type: string;
  number: string;
  status?: string;
  source: 'DOB_LICENSE_INFO' | 'DOB_FILING' | 'DOB_PERMIT_ISSUANCE' | 'BIS_WEB';
}

export interface DosEntityInfo {
  dosId: string;
  entityName: string;
  entityType: string;
  filingDate: string;
  county: string;
  jurisdiction: string;
  processName: string;
  processAddress: string;
}

export interface StakeholderRecord {
  role: StakeholderRole;
  name: string;
  orgName?: string;
  license?: StakeholderLicense;
  contacts?: {
    phones: ContactPhone[];
    emails: ContactEmail[];
  };
  addresses?: StakeholderAddress[];
  dosEntity?: DosEntityInfo;
  provenance: ProvenanceEntry[];
  confidence: number;
  notes?: string;
}
