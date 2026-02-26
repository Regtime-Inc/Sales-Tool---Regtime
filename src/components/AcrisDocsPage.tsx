import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, RefreshCw, AlertCircle, Database, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { AcrisDocument, AcrisRecentQuery, AcrisRecentResponse, AcrisDocsSortableColumn, AcrisSortDirection, AcrisIngestResult, AcrisDataCoverage } from '../types/acris';
import { fetchAcrisRecent, triggerAcrisSync, fetchDataCoverage } from '../lib/api';
import { recordAcrisSearch } from '../lib/searchHistory';
import { defaultDateRange } from '../lib/acris/utils';
import AcrisDocsFilters from './AcrisDocsFilters';
import AcrisDocsTable from './AcrisDocsTable';
import AcrisDocPreview from './AcrisDocPreview';


interface AcrisDocsPageProps {
  onAnalyze: (bbl: string) => void;
  refreshKey?: number;
  onHistoryChange?: () => void;
}

function CoverageBar({ coverage }: { coverage: AcrisDataCoverage[] }) {
  const socrata = coverage.find(c => c.source === 'socrata');
  const live = coverage.find(c => c.source === 'acris_live');
  const assist = coverage.find(c => c.source === 'acris_assist');
  const today = new Date().toISOString().split('T')[0];

  const allDates = [
    socrata?.date_from, live?.date_from, assist?.date_from,
  ].filter(Boolean) as string[];
  const earliestDate = allDates.length > 0 ? allDates.sort()[0] : today;

  const socrataEnd = socrata?.date_to || null;
  const liveEnd = live?.date_to || null;
  const assistEnd = assist?.date_to || null;

  const endDates = [socrataEnd, liveEnd, assistEnd].filter(Boolean) as string[];
  const latestCovered = endDates.length > 0 ? endDates.sort().reverse()[0] : null;

  const totalDays = Math.max(
    1,
    Math.floor((new Date(today).getTime() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  const socrataWidth = socrataEnd
    ? Math.min(100, Math.floor(((new Date(socrataEnd).getTime() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100))
    : 0;

  const liveStart = socrataEnd || earliestDate;
  const liveWidth = liveEnd && liveEnd > liveStart
    ? Math.min(100 - socrataWidth, Math.floor(((new Date(liveEnd).getTime() - new Date(liveStart).getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100))
    : 0;

  const assistStart = liveEnd || socrataEnd || earliestDate;
  const assistWidth = assistEnd && assistEnd > assistStart
    ? Math.min(100 - socrataWidth - liveWidth, Math.floor(((new Date(assistEnd).getTime() - new Date(assistStart).getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100))
    : 0;

  const gapDays = latestCovered
    ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(latestCovered).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const lastChecked = assist?.last_checked_at || live?.last_checked_at || socrata?.last_checked_at;
  const lastCheckedStr = lastChecked
    ? new Date(lastChecked).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Data Coverage</span>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          {lastCheckedStr && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Checked {lastCheckedStr}
            </span>
          )}
          {gapDays > 0 && (
            <span className="flex items-center gap-1 text-amber-500 font-medium">
              <AlertTriangle className="h-3 w-3" />
              {gapDays}d gap
            </span>
          )}
        </div>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
        {socrataWidth > 0 && (
          <div
            className="bg-sky-400 h-full transition-all duration-500"
            style={{ width: `${socrataWidth}%` }}
            title={`NYC Open Data: ${earliestDate} to ${socrataEnd}`}
          />
        )}
        {liveWidth > 0 && (
          <div
            className="bg-teal-400 h-full transition-all duration-500"
            style={{ width: `${liveWidth}%` }}
            title={`ACRIS Live: ${liveStart} to ${liveEnd}`}
          />
        )}
        {assistWidth > 0 && (
          <div
            className="bg-emerald-400 h-full transition-all duration-500"
            style={{ width: `${assistWidth}%` }}
            title={`ACRIS Assist: ${assistStart} to ${assistEnd}`}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
        <span>{earliestDate}</span>
        <div className="flex items-center gap-4">
          {socrataWidth > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
              Open Data thru {socrataEnd}
            </span>
          )}
          {liveWidth > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
              ACRIS Live thru {liveEnd}
            </span>
          )}
          {assistEnd && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Assist thru {assistEnd}
            </span>
          )}
        </div>
        <span>{today}</span>
      </div>
    </div>
  );
}

function SyncProgress({ result, phase }: { result: AcrisIngestResult | null; phase: string }) {
  if (phase === 'idle' && !result) return null;

  if (phase !== 'idle') {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-700">
              {phase === 'socrata' && 'Phase 1: Pulling from NYC Open Data...'}
              {phase === 'scrape' && 'Phase 2: Scraping ACRIS website for recent documents...'}
              {phase === 'starting' && 'Starting ACRIS data sync...'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {phase === 'scrape' && 'This may take a few minutes due to rate limiting.'}
              {phase === 'socrata' && 'Fetching deeds and mortgages from Socrata API.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isSuccess = result.status === 'success';
  const isPartial = result.status === 'partial';
  const scrapeBlocked = result.scrape?.blocked;

  return (
    <div className={`rounded-lg px-4 py-3 border ${
      isSuccess ? 'bg-emerald-50/60 border-emerald-200' :
      isPartial ? 'bg-amber-50/60 border-amber-200' :
      'bg-red-50/60 border-red-200'
    }`}>
      <div className="flex items-start gap-2">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        ) : isPartial ? (
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${
            isSuccess ? 'text-emerald-800' : isPartial ? 'text-amber-800' : 'text-red-800'
          }`}>
            {result.ingested > 0
              ? `Synced ${result.ingested.toLocaleString()} documents`
              : 'No new documents found'}
            <span className="font-normal text-[10px] ml-2 opacity-70">
              ({(result.durationMs / 1000).toFixed(1)}s)
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px]">
            {result.socrata && (
              <span className={isSuccess ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-red-600'}>
                Open Data: {result.socrata.ingested.toLocaleString()} docs
                {result.socrata.dateRange.from && ` (${result.socrata.dateRange.from} - ${result.socrata.dateRange.to})`}
              </span>
            )}
            {result.scrape && (
              <span className={isSuccess ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-red-600'}>
                ACRIS Live: {result.scrape.ingested.toLocaleString()} docs
                {result.scrape.pagesScraped ? ` (${result.scrape.pagesScraped} pages)` : ''}
                {scrapeBlocked ? ' [blocked]' : ''}
              </span>
            )}
          </div>
          {scrapeBlocked && (
            <p className="text-[10px] text-amber-600 mt-1">
              ACRIS website blocked automated access. Data may be incomplete for the most recent dates.
            </p>
          )}
          {result.errors.length > 0 && !scrapeBlocked && (
            <p className="text-[10px] text-red-600 mt-1 truncate">
              {result.errors[0]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcrisDocsPage({ onAnalyze, refreshKey = 0, onHistoryChange }: AcrisDocsPageProps) {
  const [response, setResponse] = useState<AcrisRecentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<AcrisRecentQuery>(() => {
    const d = defaultDateRange();
    return { dateFrom: d.from, dateTo: d.to, sortBy: 'recorded_date', sortDir: 'desc', limit: 50, offset: 0 };
  });
  const [page, setPage] = useState(1);
  const [previewDoc, setPreviewDoc] = useState<AcrisDocument | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<string>('idle');
  const [syncResult, setSyncResult] = useState<AcrisIngestResult | null>(null);
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [coverage, setCoverage] = useState<AcrisDataCoverage[]>([]);
  const didInitRef = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const prevRefreshKeyRef = useRef(refreshKey);

  const executeSearch = useCallback(async (q: AcrisRecentQuery, pg: number): Promise<AcrisRecentResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const offset = (pg - 1) * (q.limit || 50);
      const data = await fetchAcrisRecent({ ...q, offset });
      setResponse(data);
      if (data.total === 0 && !data.lastSyncAt) {
        setBootstrapNeeded(true);
      } else {
        setBootstrapNeeded(false);
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch documents');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCoverage = useCallback(async () => {
    try {
      const data = await fetchDataCoverage();
      setCoverage(data);
    } catch {
      // coverage is informational, don't block on failure
    }
  }, []);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      executeSearch(query, 1);
      loadCoverage();
    }
  }, [executeSearch, loadCoverage, query]);

  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      executeSearch(query, 1).then(() => {
        setTimeout(() => {
          tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      });
      loadCoverage();
      setPage(1);
    }
  }, [refreshKey, executeSearch, loadCoverage, query]);

  function handleSearch(q: AcrisRecentQuery) {
    setQuery(q);
    setPage(1);
    executeSearch(q, 1).then((data) => {
      if (!data) return;
      recordAcrisSearch({
        borough: q.borough || null,
        dateFrom: q.dateFrom || null,
        dateTo: q.dateTo || null,
        docCategories: q.docTypes?.join(',') || null,
        resultCount: data.total,
      }).then(() => onHistoryChange?.()).catch(() => {});
    });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    executeSearch(query, newPage);
  }

  function handleSortChange(col: AcrisDocsSortableColumn, dir: AcrisSortDirection) {
    const updated = { ...query, sortBy: col, sortDir: dir };
    setQuery(updated);
    setPage(1);
    executeSearch(updated, 1);
  }

  async function handleSync(mode: 'auto' | 'socrata' = 'socrata') {
    setSyncing(true);
    setSyncResult(null);
    setSyncPhase('starting');
    try {
      setSyncPhase(mode === 'socrata' ? 'socrata' : 'socrata');
      const result = await triggerAcrisSync({ mode });
      setSyncResult(result);
      setSyncPhase('idle');
      executeSearch(query, page);
      loadCoverage();
    } catch (e) {
      setSyncResult({
        status: 'failed',
        mode,
        ingested: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : 'Sync failed'],
        durationMs: 0,
        socrata: null,
        scrape: null,
      });
      setSyncPhase('idle');
    } finally {
      setSyncing(false);
    }
  }

  async function handleBootstrap() {
    setBootstrapping(true);
    setSyncResult(null);
    try {
      const result = await triggerAcrisSync({ mode: 'auto', lookbackDays: 30, bootstrap: true });
      setSyncResult(result);
      setBootstrapNeeded(false);
      executeSearch(query, 1);
      loadCoverage();
    } catch (e) {
      setSyncResult({
        status: 'failed',
        mode: 'auto',
        ingested: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : 'Bootstrap failed'],
        durationMs: 0,
        socrata: null,
        scrape: null,
      });
    } finally {
      setBootstrapping(false);
    }
  }

  const latestDocDate = response?.documents?.[0]?.recorded_date || null;
  const dataLagDays = latestDocDate
    ? Math.floor((Date.now() - new Date(latestDocDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">ACRIS Documents</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Recently recorded deeds and mortgages from NYC ACRIS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {response?.lastSyncAt && (
            <span className="text-[10px] text-slate-400">
              Last sync: {new Date(response.lastSyncAt).toLocaleString()}
            </span>
          )}
          <button
            onClick={() => handleSync('socrata')}
            disabled={syncing || bootstrapping}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Open Data'}
          </button>
        </div>
      </div>

      {coverage.length > 0 && !bootstrapNeeded && (
        <CoverageBar coverage={coverage} />
      )}

      {dataLagDays !== null && dataLagDays > 5 && !bootstrapNeeded && !syncing && !syncResult && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-800">
              Data is {dataLagDays} days behind
            </p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              NYC Open Data updates ACRIS records monthly. The most recent recording is from{' '}
              <span className="font-medium">{latestDocDate}</span>.
              Click <strong>Sync Open Data</strong> to pull from NYC Open Data, or use <strong>ACRIS Assist</strong> to manually browse and import the most recent recordings.
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-amber-500">
            <Clock className="h-3 w-3" />
            <span>{dataLagDays}d lag</span>
          </div>
        </div>
      )}

      <SyncProgress result={syncResult} phase={syncPhase} />

      {bootstrapNeeded && !bootstrapping && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <Database className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">No ACRIS data found</p>
            <p className="text-xs text-amber-600 mt-1">
              This appears to be the first time loading ACRIS documents. Run an initial pull to import the last 30 days of recorded documents across all boroughs.
            </p>
            <button
              onClick={handleBootstrap}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Database className="h-3.5 w-3.5" />
              Load Last 30 Days
            </button>
          </div>
        </div>
      )}

      {bootstrapping && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <div className="inline-flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-600">Loading ACRIS data across all boroughs... This may take a minute.</span>
          </div>
        </div>
      )}

      <AcrisDocsFilters onSearch={handleSearch} loading={loading} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {response && !bootstrapping && (
        <div ref={tableRef}>
        <AcrisDocsTable
          documents={response.documents}
          total={response.total}
          page={page}
          pageSize={query.limit || 50}
          sortBy={query.sortBy || 'recorded_date'}
          sortDir={query.sortDir || 'desc'}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onAnalyze={onAnalyze}
          onPreview={setPreviewDoc}
        />
        </div>
      )}

      {loading && !response && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-6 py-4 shadow-sm">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-600">Loading ACRIS documents...</span>
          </div>
        </div>
      )}

      {previewDoc && (
        <AcrisDocPreview
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onAnalyze={onAnalyze}
        />
      )}
    </div>
  );
}
