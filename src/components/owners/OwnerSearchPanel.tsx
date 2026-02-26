import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader2, Building2, User, AlertCircle } from 'lucide-react';
import { searchOwners } from '../../lib/owners/api';
import { recordOwnerSearch } from '../../lib/searchHistory';
import type { OwnerSearchResult } from '../../types/owners';

interface OwnerSearchPanelProps {
  selectedId: string | null;
  onSelect: (owner: OwnerSearchResult) => void;
  onHistoryChange?: () => void;
  prefillQuery?: string | null;
}

export default function OwnerSearchPanel({ selectedId, onSelect, onHistoryChange, prefillQuery }: OwnerSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OwnerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefillAppliedRef = useRef(false);
  const pendingSearchRef = useRef(false);

  useEffect(() => {
    if (prefillQuery) {
      if (!prefillAppliedRef.current) {
        prefillAppliedRef.current = true;
        setQuery(prefillQuery);
        pendingSearchRef.current = true;
      }
    } else {
      prefillAppliedRef.current = false;
    }
  }, [prefillQuery]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const owners = await searchOwners(query);
      setResults(owners);
      const top = owners[0] || null;
      recordOwnerSearch({
        query: query.trim(),
        resultCount: owners.length,
        topEntityName: top?.canonical_name || null,
        topEntityType: top?.entity_type || null,
      }).then(() => onHistoryChange?.()).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, onHistoryChange]);

  useEffect(() => {
    if (pendingSearchRef.current && query.trim()) {
      pendingSearchRef.current = false;
      handleSearch();
    }
  }, [query, handleSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search owner or developer name..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-400 focus:border-teal-400 outline-none bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Building2 className="h-8 w-8 text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">
              {query.trim() ? 'No owners found' : 'Search for an owner or developer'}
            </p>
          </div>
        )}

        {results.map((owner) => (
          <button
            key={owner.id}
            onClick={() => onSelect(owner)}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
              selectedId === owner.id ? 'bg-teal-50 border-l-2 border-l-teal-500' : ''
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`mt-0.5 p-1.5 rounded-lg ${
                owner.entity_type === 'org' ? 'bg-sky-100' : owner.entity_type === 'person' ? 'bg-teal-100' : 'bg-slate-100'
              }`}>
                {owner.entity_type === 'org'
                  ? <Building2 className="h-3.5 w-3.5 text-sky-600" />
                  : <User className="h-3.5 w-3.5 text-teal-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{owner.canonical_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">
                    {owner.property_count} {owner.property_count === 1 ? 'property' : 'properties'}
                  </span>
                  {owner.match_score > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                      owner.match_score >= 0.7 ? 'bg-emerald-50 text-emerald-600' :
                      owner.match_score >= 0.4 ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>
                      {(owner.match_score * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    owner.entity_type === 'org' ? 'bg-sky-50 text-sky-600' :
                    owner.entity_type === 'person' ? 'bg-teal-50 text-teal-600' :
                    'bg-slate-50 text-slate-500'
                  }`}>
                    {owner.entity_type}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
