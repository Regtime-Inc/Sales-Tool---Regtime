export interface TraceEntry {
  step: string;
  status: "success" | "warning" | "error" | "info";
  detail: string;
  timestamp: string;
}

export interface AcrisLiveParty {
  name: string;
  role: "OWNER" | "SELLER";
  documentId: string;
  docType: string;
  recordedDate: string;
  source: string;
}

export interface PortalOwnerDetail {
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerBusinessName: string | null;
  ownerType: string | null;
}

export interface RawStakeholder {
  role: string;
  name: string;
  orgName?: string;
  licenseType?: string;
  licenseNumber?: string;
  licenseSource?: string;
  phones: Array<{ raw: string; confidence: number }>;
  emails: Array<{ email: string; confidence: number }>;
  addresses: Array<{ line1?: string; city?: string; state?: string; zip?: string; source: string; confidence: number }>;
  sourceSystem: string;
  datasetId: string;
  recordKey: string;
  fieldsUsed: string[];
}

export function ts() {
  return new Date().toISOString();
}

export function parseBbl(bbl: string) {
  return {
    borough: bbl.substring(0, 1),
    block: bbl.substring(1, 6),
    lot: bbl.substring(6, 10),
  };
}

export const BORO_CODE_TO_NAME: Record<string, string> = {
  "1": "MANHATTAN",
  "2": "BRONX",
  "3": "BROOKLYN",
  "4": "QUEENS",
  "5": "STATEN ISLAND",
};

export function boroName(code: string): string {
  return BORO_CODE_TO_NAME[code] || code;
}
