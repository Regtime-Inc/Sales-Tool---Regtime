import type { AnalysisResult, AnalysisError } from '../types/analysis';
import type {
  AcrisIngestRequest,
  AcrisIngestResult,
  AcrisRecentQuery,
  AcrisRecentResponse,
  AcrisDataCoverage,
} from '../types/acris';
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function analyzeProperty(
  input: string
): Promise<AnalysisResult> {
  const url = `${SUPABASE_URL}/functions/v1/analyze`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ input }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as AnalysisError;
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return data as AnalysisResult;
}

export async function triggerAcrisSync(
  options: AcrisIngestRequest = {}
): Promise<AcrisIngestResult> {
  const url = `${SUPABASE_URL}/functions/v1/acris-sync`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(options),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Sync failed (${res.status})`);
  }

  return data as AcrisIngestResult;
}

export async function fetchAcrisRecent(
  query: AcrisRecentQuery = {}
): Promise<AcrisRecentResponse> {
  const params = new URLSearchParams();
  if (query.days) params.set('days', String(query.days));
  if (query.borough) params.set('borough', query.borough);
  if (query.minAmount) params.set('minAmount', String(query.minAmount));
  if (query.maxAmount) params.set('maxAmount', String(query.maxAmount));
  if (query.docTypes?.length) params.set('docTypes', query.docTypes.join(','));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);
  if (query.bbl) params.set('bbl', query.bbl);

  const url = `${SUPABASE_URL}/functions/v1/acris-recent?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data as AcrisRecentResponse;
}

export async function fetchDataCoverage(): Promise<AcrisDataCoverage[]> {
  const { data, error } = await supabase
    .from('acris_data_coverage')
    .select('*')
    .order('source');

  if (error) throw new Error(error.message);
  return (data || []) as AcrisDataCoverage[];
}
