export interface AcrisDocument {
  id?: string;
  document_id: string;
  crfn: string | null;
  recorded_date: string;
  doc_type: string;
  borough: string;
  block: string;
  lot: string;
  bbl: string;
  party1: string | null;
  party2: string | null;
  amount: number | null;
  source: AcrisSource;
  ingested_at?: string;
  raw_payload_json: Record<string, unknown>;
}

export type AcrisSource = 'socrata' | 'acris_live' | 'sds' | 'scrape' | 'opendata' | 'manual_paste' | 'screen_capture' | 'html_upload';

export type AcrisIngestMode = 'auto' | 'socrata' | 'acris_live';

export interface AcrisIngestRequest {
  mode?: AcrisIngestMode;
  lookbackDays?: number;
  boroughs?: string[];
  bootstrap?: boolean;
  source?: string;
}

export interface AcrisPhaseResult {
  ingested: number;
  skipped: number;
  dateRange: { from: string; to: string };
  blocked?: boolean;
  pagesScraped?: number;
}

export interface AcrisIngestResult {
  status: 'success' | 'partial' | 'failed';
  mode: AcrisIngestMode;
  ingested: number;
  skipped: number;
  errors: string[];
  durationMs: number;
  socrata: AcrisPhaseResult | null;
  scrape: AcrisPhaseResult | null;
}

export type AcrisDocsSortableColumn =
  | 'recorded_date'
  | 'amount'
  | 'doc_type'
  | 'borough'
  | 'party1'
  | 'party2'
  | 'bbl';

export type AcrisSortDirection = 'asc' | 'desc';

export interface AcrisRecentQuery {
  days?: number;
  borough?: string;
  minAmount?: number;
  maxAmount?: number;
  docTypes?: string[];
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: AcrisDocsSortableColumn;
  sortDir?: AcrisSortDirection;
  bbl?: string;
}

export interface AcrisRecentResponse {
  documents: AcrisDocument[];
  total: number;
  lastSyncAt: string | null;
}

export interface AcrisSyncLogEntry {
  id?: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  source: string;
  docs_ingested: number;
  docs_skipped: number;
  error_message: string | null;
  run_metadata_json: Record<string, unknown>;
}

export interface AcrisDataCoverage {
  source: string;
  borough: string;
  date_from: string | null;
  date_to: string | null;
  doc_count: number;
  last_checked_at: string;
  last_ingested_at: string | null;
  metadata_json: Record<string, unknown>;
}
