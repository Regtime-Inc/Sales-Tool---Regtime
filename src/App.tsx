import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Building2, AlertCircle, Search, Compass, FileText, ClipboardPaste, Users } from 'lucide-react';
import SearchInput from './components/SearchInput';
import ResultsPanel from './components/ResultsPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { analyzeProperty } from './lib/api';
import { recordAnalysisSearch } from './lib/searchHistory';
import type { AnalysisResult } from './types/analysis';
import type { AppliedOverrides } from './types/pdf';
import type { DiscoveryHistoryEntry, AcrisSearchHistoryEntry } from './types/searchHistory';
import type { DiscoveryFilters } from './types/discovery';

// ── Lazy-loaded tab pages (Improvement 2) ────────────────────────────────
const DiscoveryPage = lazy(() => import('./components/DiscoveryPage'));
const AcrisDocsPage = lazy(() => import('./components/AcrisDocsPage'));
const AcrisAssistPage = lazy(() => import('./components/AcrisAssistPage'));
const OwnersPage = lazy(() => import('./components/OwnersPage'));

type Tab = 'analyze' | 'discovery' | 'acris' | 'acris-assist' | 'owners';

const VALID_TABS: Tab[] = ['analyze', 'discovery', 'acris', 'acris-assist', 'owners'];

// ── Hash-based routing hook (Improvement 1) ──────────────────────────────
function parseHash(): { tab: Tab; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return { tab: 'analyze' };

  const slashIdx = raw.indexOf('/');
  const segment = slashIdx >= 0 ? raw.substring(0, slashIdx) : raw;
  const param = slashIdx >= 0 ? decodeURIComponent(raw.substring(slashIdx + 1)) : undefined;

  if (VALID_TABS.includes(segment as Tab)) {
    return { tab: segment as Tab, param: param || undefined };
  }
  return { tab: 'analyze' };
}

function setHash(tab: Tab, param?: string) {
  const hash = param ? `#${tab}/${encodeURIComponent(param)}` : `#${tab}`;
  if (window.location.hash !== hash) {
    window.history.pushState(null, '', hash);
  }
}

function useHashTab() {
  const initial = parseHash();
  const [tab, setTabState] = useState<Tab>(initial.tab);
  const [hashParam, setHashParam] = useState<string | undefined>(initial.param);
  const suppressRef = useRef(false);

  const setTab = useCallback((newTab: Tab, param?: string) => {
    setTabState(newTab);
    setHashParam(param);
    suppressRef.current = true;
    setHash(newTab, param);
    // Reset suppress after a tick so hashchange from pushState is ignored
    requestAnimationFrame(() => { suppressRef.current = false; });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (suppressRef.current) return;
      const parsed = parseHash();
      setTabState(parsed.tab);
      setHashParam(parsed.param);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return { tab, hashParam, setTab };
}

// ── Tab loading spinner ──────────────────────────────────────────────────
function TabSpinner() {
  return (
    <div className="text-center py-16 animate-fadeIn">
      <div className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-6 py-4 shadow-sm">
        <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-600">Loading...</span>
      </div>
    </div>
  );
}

export default function App() {
  const { tab, hashParam, setTab } = useHashTab();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfOverrides, setPdfOverrides] = useState<AppliedOverrides | null>(null);

  const [historyVersion, setHistoryVersion] = useState(0);
  const [discoveryFiltersOverride, setDiscoveryFiltersOverride] = useState<DiscoveryFilters | null>(null);
  const [acrisRefreshKey, setAcrisRefreshKey] = useState(0);
  const [ownerSearchPrefill, setOwnerSearchPrefill] = useState<string | null>(null);

  // ── Deep-link: auto-analyze BBL from hash on mount ──────────────────
  const autoAnalyzeRef = useRef(false);
  useEffect(() => {
    if (autoAnalyzeRef.current) return;
    if (tab === 'analyze' && hashParam && /^\d{10}$/.test(hashParam)) {
      autoAnalyzeRef.current = true;
      handleAnalyze(hashParam);
    }
    if (tab === 'owners' && hashParam) {
      setOwnerSearchPrefill(hashParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAcrisDataIngested = useCallback(() => {
    setAcrisRefreshKey((k) => k + 1);
  }, []);

  const handleSelectDiscovery = useCallback((entry: DiscoveryHistoryEntry) => {
    setDiscoveryFiltersOverride({
      borough: entry.borough,
      zonePrefix: entry.zonePrefix ? entry.zonePrefix.split(',').filter(Boolean) : [],
      minSlackSF: entry.minSlackSf,
      minUnderbuiltRatio: entry.minUnderbuiltRatio,
      excludeCondos: entry.excludeCondos,
      maxSaleRecencyYears: entry.maxSaleRecencyYears,
    });
    setTab('discovery');
  }, [setTab]);

  const handleSelectOwner = useCallback((query: string) => {
    setOwnerSearchPrefill(query);
    setTab('owners', query);
  }, [setTab]);

  const handleSelectAcris = useCallback((_entry: AcrisSearchHistoryEntry) => {
    setTab('acris');
  }, [setTab]);

  const handleAnalyze = useCallback(async (input: string) => {
    setTab('analyze');
    setLoading(true);
    setError(null);
    setResult(null);
    setPdfOverrides(null);
    try {
      const data = await analyzeProperty(input);
      setResult(data);
      // Update hash with BBL for deep-linking
      setTab('analyze', data.bbl);
      recordAnalysisSearch({
        input,
        bbl: data.bbl,
        address: data.address || '',
        borough: data.borough,
        devScore: data.scoring?.totalScore ?? 0,
        zoneDist: data.pluto?.zonedist1 || '',
        slackSf: data.metrics?.buildableSlackSf ?? 0,
        underbuiltRatio: data.metrics?.underbuiltRatio ?? 0,
        lastSaleDate: data.recentSale?.documentDate || null,
      }).then(() => setHistoryVersion((v) => v + 1)).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [setTab]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-700 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">NYC Dev Property Analyzer</h1>
              <p className="text-xs text-slate-400">Development potential scoring with ACRIS, PLUTO, DOB, HPD data</p>
            </div>
          </div>

          <nav className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab('analyze')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'analyze'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Analyze
            </button>
            <button
              onClick={() => setTab('discovery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'discovery'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Discovery
            </button>
            <button
              onClick={() => setTab('acris')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'acris'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              ACRIS Docs
            </button>
            <button
              onClick={() => setTab('acris-assist')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'acris-assist'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              ACRIS Assist
            </button>
            <button
              onClick={() => setTab('owners')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'owners'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Owners
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <ErrorBoundary label="Application">

        {/* Analyze tab: kept always mounted (hidden) to preserve results */}
        <div className={tab !== 'analyze' ? 'hidden' : ''}>
            <div className="space-y-8">
            <SearchInput onAnalyze={handleAnalyze} loading={loading} historyVersion={historyVersion} onSelectDiscovery={handleSelectDiscovery} onSelectOwner={handleSelectOwner} onSelectAcris={handleSelectAcris} />

            {loading && (
              <div className="text-center py-16 animate-fadeIn">
                <div className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-6 py-4 shadow-sm">
                  <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-600">Querying NYC open data sources...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-fadeIn">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Analysis Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}

            {result && (
              <ResultsPanel
                result={result}
                pdfOverrides={pdfOverrides}
                onPdfOverridesChange={setPdfOverrides}
                onAnalyze={handleAnalyze}
                onSelectOwner={handleSelectOwner}
              />
            )}

            {!result && !loading && !error && (
              <div className="text-center py-16">
                <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">Enter a NYC address or 10-digit BBL to analyze development potential</p>
                <p className="text-slate-300 text-xs mt-2">
                  Pulls data from ACRIS, PLUTO, DOB, HPD, and DOF Rolling Sales
                </p>
              </div>
            )}
            </div>
        </div>

        {/* Lazy-rendered tabs: only mount when active (Improvement 2) */}
        {tab === 'discovery' && (
          <Suspense fallback={<TabSpinner />}>
            <DiscoveryPage
              onAnalyze={handleAnalyze}
              onHistoryChange={() => setHistoryVersion((v) => v + 1)}
              filtersOverride={discoveryFiltersOverride}
              onFiltersOverrideConsumed={() => setDiscoveryFiltersOverride(null)}
            />
          </Suspense>
        )}

        {tab === 'acris' && (
          <Suspense fallback={<TabSpinner />}>
            <AcrisDocsPage onAnalyze={handleAnalyze} refreshKey={acrisRefreshKey} onHistoryChange={() => setHistoryVersion((v) => v + 1)} />
          </Suspense>
        )}

        {tab === 'acris-assist' && (
          <Suspense fallback={<TabSpinner />}>
            <AcrisAssistPage onAnalyze={handleAnalyze} onDataIngested={handleAcrisDataIngested} />
          </Suspense>
        )}

        {tab === 'owners' && (
          <Suspense fallback={<TabSpinner />}>
            <OwnersPage onAnalyze={handleAnalyze} onHistoryChange={() => setHistoryVersion((v) => v + 1)} searchPrefill={ownerSearchPrefill} onSearchPrefillConsumed={() => setOwnerSearchPrefill(null)} />
          </Suspense>
        )}

        </ErrorBoundary>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
          Data sourced from NYC Open Data. Not financial or legal advice.
        </div>
      </footer>
    </div>
  );
}
