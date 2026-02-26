import { supabase, sessionId } from './supabase';
import type { SearchHistoryEntry, AnalysisHistoryEntry, DiscoveryHistoryEntry, OwnerSearchHistoryEntry, AcrisSearchHistoryEntry } from '../types/searchHistory';

function getSessionId(): string {
  return sessionId;
}

export async function fetchSearchHistory(limit = 20): Promise<SearchHistoryEntry[]> {
  const sessionId = getSessionId();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const [analysisRes, discoveryRes, ownerRes, acrisRes] = await Promise.all([
    supabase
      .from('search_history')
      .select('*')
      .eq('session_id', sessionId)
      .gte('searched_at', thirtyDaysAgo)
      .order('searched_at', { ascending: false })
      .limit(limit),
    supabase
      .from('discovery_search_history')
      .select('*')
      .eq('session_id', sessionId)
      .gte('searched_at', thirtyDaysAgo)
      .order('searched_at', { ascending: false })
      .limit(limit),
    supabase
      .from('owner_search_history')
      .select('*')
      .eq('session_id', sessionId)
      .gte('searched_at', thirtyDaysAgo)
      .order('searched_at', { ascending: false })
      .limit(limit),
    supabase
      .from('acris_search_history')
      .select('*')
      .eq('session_id', sessionId)
      .gte('searched_at', thirtyDaysAgo)
      .order('searched_at', { ascending: false })
      .limit(limit),
  ]);

  const analysisEntries: AnalysisHistoryEntry[] = (analysisRes.data || []).map((row: any) => ({
    type: 'analysis' as const,
    id: row.id,
    sessionId: row.session_id,
    input: row.input,
    bbl: row.bbl,
    address: row.address,
    borough: row.borough,
    devScore: Number(row.dev_score) || 0,
    zoneDist: row.zone_dist || '',
    slackSf: Number(row.slack_sf) || 0,
    underbuiltRatio: Number(row.underbuilt_ratio) || 0,
    lastSaleDate: row.last_sale_date || null,
    searchedAt: row.searched_at,
  }));

  const discoveryEntries: DiscoveryHistoryEntry[] = (discoveryRes.data || []).map((row: any) => ({
    type: 'discovery' as const,
    id: row.id,
    sessionId: row.session_id,
    borough: row.borough,
    boroughName: row.borough_name || '',
    zonePrefix: row.zone_prefix || '',
    minSlackSf: Number(row.min_slack_sf) || 0,
    minUnderbuiltRatio: Number(row.min_underbuilt_ratio) || 0,
    excludeCondos: row.exclude_condos ?? true,
    maxSaleRecencyYears: Number(row.max_sale_recency_years) || 0,
    resultCount: Number(row.result_count) || 0,
    topScore: Number(row.top_score) || 0,
    searchedAt: row.searched_at,
  }));

  const ownerEntries: OwnerSearchHistoryEntry[] = (ownerRes.data || []).map((row: any) => ({
    type: 'owner' as const,
    id: row.id,
    sessionId: row.session_id,
    query: row.query,
    resultCount: Number(row.result_count) || 0,
    topEntityName: row.top_entity_name || null,
    topEntityType: row.top_entity_type || null,
    searchedAt: row.searched_at,
  }));

  const acrisEntries: AcrisSearchHistoryEntry[] = (acrisRes.data || []).map((row: any) => ({
    type: 'acris' as const,
    id: row.id,
    sessionId: row.session_id,
    borough: row.borough || null,
    dateFrom: row.date_from || null,
    dateTo: row.date_to || null,
    docCategories: row.doc_categories || null,
    resultCount: Number(row.result_count) || 0,
    searchedAt: row.searched_at,
  }));

  const merged: SearchHistoryEntry[] = [...analysisEntries, ...discoveryEntries, ...ownerEntries, ...acrisEntries];
  merged.sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime());
  return merged.slice(0, limit);
}

export async function recordAnalysisSearch(entry: {
  input: string;
  bbl: string;
  address: string;
  borough: string;
  devScore: number;
  zoneDist: string;
  slackSf: number;
  underbuiltRatio: number;
  lastSaleDate: string | null;
}): Promise<void> {
  const sessionId = getSessionId();

  await supabase
    .from('search_history')
    .upsert(
      {
        session_id: sessionId,
        input: entry.input,
        bbl: entry.bbl,
        address: entry.address || '',
        borough: entry.borough,
        dev_score: entry.devScore,
        zone_dist: entry.zoneDist,
        slack_sf: entry.slackSf,
        underbuilt_ratio: entry.underbuiltRatio,
        last_sale_date: entry.lastSaleDate,
        searched_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,bbl' }
    );
}

export async function recordDiscoverySearch(entry: {
  borough: string;
  boroughName: string;
  zonePrefix: string;
  minSlackSf: number;
  minUnderbuiltRatio: number;
  excludeCondos: boolean;
  maxSaleRecencyYears: number;
  resultCount: number;
  topScore: number;
}): Promise<void> {
  const sessionId = getSessionId();

  await supabase
    .from('discovery_search_history')
    .upsert(
      {
        session_id: sessionId,
        borough: entry.borough,
        borough_name: entry.boroughName,
        zone_prefix: entry.zonePrefix,
        min_slack_sf: entry.minSlackSf,
        min_underbuilt_ratio: entry.minUnderbuiltRatio,
        exclude_condos: entry.excludeCondos,
        max_sale_recency_years: entry.maxSaleRecencyYears,
        result_count: entry.resultCount,
        top_score: entry.topScore,
        searched_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,borough,zone_prefix' }
    );
}

export async function recordOwnerSearch(entry: {
  query: string;
  resultCount: number;
  topEntityName: string | null;
  topEntityType: string | null;
}): Promise<void> {
  const sid = getSessionId();
  await supabase
    .from('owner_search_history')
    .upsert(
      {
        session_id: sid,
        query: entry.query,
        result_count: entry.resultCount,
        top_entity_name: entry.topEntityName,
        top_entity_type: entry.topEntityType,
        searched_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,query' }
    );
}

export async function recordAcrisSearch(entry: {
  borough: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  docCategories: string | null;
  resultCount: number;
}): Promise<void> {
  const sid = getSessionId();
  await supabase
    .from('acris_search_history')
    .upsert(
      {
        session_id: sid,
        borough: entry.borough || '',
        date_from: entry.dateFrom || '',
        date_to: entry.dateTo || '',
        doc_categories: entry.docCategories,
        result_count: entry.resultCount,
        searched_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,borough,date_from' }
    );
}

export async function clearSearchHistory(): Promise<void> {
  const sid = getSessionId();
  await Promise.all([
    supabase.from('search_history').delete().eq('session_id', sid),
    supabase.from('discovery_search_history').delete().eq('session_id', sid),
    supabase.from('owner_search_history').delete().eq('session_id', sid),
    supabase.from('acris_search_history').delete().eq('session_id', sid),
  ]);
}
