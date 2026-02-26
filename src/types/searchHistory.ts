export interface AnalysisHistoryEntry {
  type: 'analysis';
  id: string;
  sessionId: string;
  input: string;
  bbl: string;
  address: string;
  borough: string;
  devScore: number;
  zoneDist: string;
  slackSf: number;
  underbuiltRatio: number;
  lastSaleDate: string | null;
  searchedAt: string;
}

export interface DiscoveryHistoryEntry {
  type: 'discovery';
  id: string;
  sessionId: string;
  borough: string;
  boroughName: string;
  zonePrefix: string;
  minSlackSf: number;
  minUnderbuiltRatio: number;
  excludeCondos: boolean;
  maxSaleRecencyYears: number;
  resultCount: number;
  topScore: number;
  searchedAt: string;
}

export interface OwnerSearchHistoryEntry {
  type: 'owner';
  id: string;
  sessionId: string;
  query: string;
  resultCount: number;
  topEntityName: string | null;
  topEntityType: string | null;
  searchedAt: string;
}

export interface AcrisSearchHistoryEntry {
  type: 'acris';
  id: string;
  sessionId: string;
  borough: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  docCategories: string | null;
  resultCount: number;
  searchedAt: string;
}

export type SearchHistoryEntry =
  | AnalysisHistoryEntry
  | DiscoveryHistoryEntry
  | OwnerSearchHistoryEntry
  | AcrisSearchHistoryEntry;
