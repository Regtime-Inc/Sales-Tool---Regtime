import { useState, useEffect } from 'react';
import { Clock, X, MapPin, Compass, ArrowUpRight, Search, Users, FileText } from 'lucide-react';
import { fetchSearchHistory, clearSearchHistory } from '../lib/searchHistory';
import type { SearchHistoryEntry, AnalysisHistoryEntry, DiscoveryHistoryEntry, OwnerSearchHistoryEntry, AcrisSearchHistoryEntry } from '../types/searchHistory';

const BOROUGH_SHORT: Record<string, string> = {
  '1': 'MN',
  '2': 'BX',
  '3': 'BK',
  '4': 'QN',
  '5': 'SI',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBbl(raw: string): string {
  const d = raw.replace(/\D/g, '').padStart(10, '0').slice(-10);
  return `${d[0]}-${d.slice(1, 6)}-${d.slice(6, 10)}`;
}

function ScorePill({ score, variant = 'default' }: { score: number; variant?: 'default' | 'discovery' }) {
  let color = 'bg-slate-100 text-slate-500';
  if (variant === 'discovery') {
    if (score >= 60) color = 'bg-teal-50 text-teal-700';
    else if (score >= 30) color = 'bg-sky-50 text-sky-700';
    else color = 'bg-slate-100 text-slate-500';
  } else {
    if (score >= 70) color = 'bg-emerald-50 text-emerald-700';
    else if (score >= 50) color = 'bg-teal-50 text-teal-700';
    else if (score >= 30) color = 'bg-amber-50 text-amber-700';
  }
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>
      {score.toFixed(0)}
    </span>
  );
}

function AnalysisRow({ entry, onSelect }: { entry: AnalysisHistoryEntry; onSelect: (bbl: string) => void }) {
  return (
    <button
      onClick={() => onSelect(entry.bbl)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors group"
    >
      <div className="w-5 h-5 rounded bg-teal-50 flex items-center justify-center shrink-0">
        <Search className="h-3 w-3 text-teal-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <MapPin className="h-3 w-3 text-slate-300 shrink-0" />
          <span className="text-xs text-slate-700 truncate font-medium">
            {entry.address || formatBbl(entry.bbl)}
          </span>
          {entry.borough && (
            <span className="text-[9px] font-bold px-1 py-px bg-slate-100 text-slate-500 rounded shrink-0">
              {BOROUGH_SHORT[entry.borough] || entry.borough}
            </span>
          )}
          {entry.zoneDist && (
            <span className="text-[9px] text-slate-400 shrink-0">{entry.zoneDist}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 pl-5">
          <span className="text-[10px] text-slate-400 font-mono">{formatBbl(entry.bbl)}</span>
          {entry.slackSf > 0 && (
            <span className="text-[10px] text-slate-400">
              {Math.round(entry.slackSf).toLocaleString()} SF slack
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ScorePill score={entry.devScore} />
        <span className="text-[10px] text-slate-300 w-12 text-right">
          {relativeTime(entry.searchedAt)}
        </span>
        <ArrowUpRight className="h-3 w-3 text-slate-300 group-hover:text-teal-600 transition-colors" />
      </div>
    </button>
  );
}

function DiscoveryRow({ entry, onSelect }: { entry: DiscoveryHistoryEntry; onSelect: (entry: DiscoveryHistoryEntry) => void }) {
  const filterParts: string[] = [];
  if (entry.minSlackSf > 0) filterParts.push(`${entry.minSlackSf.toLocaleString()} SF+`);
  if (entry.minUnderbuiltRatio > 0) filterParts.push(`${entry.minUnderbuiltRatio}%+ UB`);
  if (entry.excludeCondos) filterParts.push('no condos');
  if (entry.maxSaleRecencyYears > 0) filterParts.push(`${entry.maxSaleRecencyYears}yr sale`);

  return (
    <button
      onClick={() => onSelect(entry)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-sky-50/40 transition-colors group"
    >
      <div className="w-5 h-5 rounded bg-sky-50 flex items-center justify-center shrink-0">
        <Compass className="h-3 w-3 text-sky-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700 font-medium">
            {entry.boroughName || BOROUGH_SHORT[entry.borough] || 'Borough ' + entry.borough}
          </span>
          {entry.zonePrefix && entry.zonePrefix.length > 0 && (
            <span className="text-[9px] font-bold px-1 py-px bg-sky-50 text-sky-600 rounded shrink-0 truncate max-w-[120px]">
              {entry.zonePrefix.includes(',')
                ? `${entry.zonePrefix.split(',').length} zones`
                : entry.zonePrefix}
            </span>
          )}
          <span className="text-[9px] px-1 py-px bg-slate-50 text-slate-400 rounded shrink-0">
            Discovery
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 pl-0">
          <span className="text-[10px] text-slate-500 font-semibold">
            {entry.resultCount.toLocaleString()} results
          </span>
          {filterParts.length > 0 && (
            <span className="text-[10px] text-slate-400 truncate">
              {filterParts.join(' / ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {entry.topScore > 0 && (
          <ScorePill score={entry.topScore} variant="discovery" />
        )}
        <span className="text-[10px] text-slate-300 w-12 text-right">
          {relativeTime(entry.searchedAt)}
        </span>
        <ArrowUpRight className="h-3 w-3 text-slate-300 group-hover:text-sky-600 transition-colors" />
      </div>
    </button>
  );
}

function OwnerRow({ entry, onSelect }: { entry: OwnerSearchHistoryEntry; onSelect: (query: string) => void }) {
  return (
    <button
      onClick={() => onSelect(entry.query)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-amber-50/40 transition-colors group"
    >
      <div className="w-5 h-5 rounded bg-amber-50 flex items-center justify-center shrink-0">
        <Users className="h-3 w-3 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700 font-medium truncate">{entry.query}</span>
          <span className="text-[9px] px-1 py-px bg-amber-50 text-amber-600 rounded shrink-0">
            Owners
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-500 font-semibold">
            {entry.resultCount} result{entry.resultCount !== 1 ? 's' : ''}
          </span>
          {entry.topEntityName && (
            <span className="text-[10px] text-slate-400 truncate">{entry.topEntityName}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-slate-300 w-12 text-right">
          {relativeTime(entry.searchedAt)}
        </span>
        <ArrowUpRight className="h-3 w-3 text-slate-300 group-hover:text-amber-600 transition-colors" />
      </div>
    </button>
  );
}

function AcrisRow({ entry, onSelect }: { entry: AcrisSearchHistoryEntry; onSelect: (entry: AcrisSearchHistoryEntry) => void }) {
  const parts: string[] = [];
  if (entry.borough) parts.push(entry.borough);
  if (entry.docCategories) parts.push(entry.docCategories);

  return (
    <button
      onClick={() => onSelect(entry)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-emerald-50/40 transition-colors group"
    >
      <div className="w-5 h-5 rounded bg-emerald-50 flex items-center justify-center shrink-0">
        <FileText className="h-3 w-3 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700 font-medium">
            {entry.dateFrom && entry.dateTo ? `${entry.dateFrom} - ${entry.dateTo}` : 'ACRIS Filter'}
          </span>
          <span className="text-[9px] px-1 py-px bg-emerald-50 text-emerald-600 rounded shrink-0">
            ACRIS
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-500 font-semibold">
            {entry.resultCount} doc{entry.resultCount !== 1 ? 's' : ''}
          </span>
          {parts.length > 0 && (
            <span className="text-[10px] text-slate-400 truncate">{parts.join(' / ')}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-slate-300 w-12 text-right">
          {relativeTime(entry.searchedAt)}
        </span>
        <ArrowUpRight className="h-3 w-3 text-slate-300 group-hover:text-emerald-600 transition-colors" />
      </div>
    </button>
  );
}

interface RecentSearchesProps {
  onSelectAnalysis: (bbl: string) => void;
  onSelectDiscovery?: (entry: DiscoveryHistoryEntry) => void;
  onSelectOwner?: (query: string) => void;
  onSelectAcris?: (entry: AcrisSearchHistoryEntry) => void;
  historyVersion: number;
}

export default function RecentSearches({ onSelectAnalysis, onSelectDiscovery, onSelectOwner, onSelectAcris, historyVersion }: RecentSearchesProps) {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'analysis' | 'discovery' | 'owner' | 'acris'>('all');

  useEffect(() => {
    fetchSearchHistory(20).then(setEntries).catch(() => {});
  }, [historyVersion]);

  async function handleClear() {
    await clearSearchHistory();
    setEntries([]);
  }

  if (entries.length === 0) return null;

  const analysisCount = entries.filter((e) => e.type === 'analysis').length;
  const discoveryCount = entries.filter((e) => e.type === 'discovery').length;
  const ownerCount = entries.filter((e) => e.type === 'owner').length;
  const acrisCount = entries.filter((e) => e.type === 'acris').length;

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => e.type === filter);

  return (
    <div className="mt-3 animate-fadeIn">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Clock className="h-3 w-3" />
            <span className="font-medium">Recent Searches</span>
            <span className="text-slate-300">({entries.length})</span>
          </button>
          {!collapsed && (
            <div className="flex items-center gap-0.5 ml-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                  filter === 'all' ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                All
              </button>
              {analysisCount > 0 && (
                <button
                  onClick={() => setFilter('analysis')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    filter === 'analysis' ? 'bg-teal-100 text-teal-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Analyze ({analysisCount})
                </button>
              )}
              {discoveryCount > 0 && (
                <button
                  onClick={() => setFilter('discovery')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    filter === 'discovery' ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Discovery ({discoveryCount})
                </button>
              )}
              {ownerCount > 0 && (
                <button
                  onClick={() => setFilter('owner')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    filter === 'owner' ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Owners ({ownerCount})
                </button>
              )}
              {acrisCount > 0 && (
                <button
                  onClick={() => setFilter('acris')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                    filter === 'acris' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  ACRIS ({acrisCount})
                </button>
              )}
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="bg-white border border-slate-100 rounded-lg shadow-sm divide-y divide-slate-50 overflow-hidden">
          {filtered.map((entry) => {
            switch (entry.type) {
              case 'analysis':
                return <AnalysisRow key={entry.id} entry={entry} onSelect={onSelectAnalysis} />;
              case 'discovery':
                return <DiscoveryRow key={entry.id} entry={entry} onSelect={(e) => onSelectDiscovery?.(e)} />;
              case 'owner':
                return <OwnerRow key={entry.id} entry={entry} onSelect={(q) => onSelectOwner?.(q)} />;
              case 'acris':
                return <AcrisRow key={entry.id} entry={entry} onSelect={(e) => onSelectAcris?.(e)} />;
              default:
                return null;
            }
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-slate-400">
              No {filter} searches yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
