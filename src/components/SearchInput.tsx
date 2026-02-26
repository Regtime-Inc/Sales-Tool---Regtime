import { useState } from 'react';
import { Search, Building2, Loader2 } from 'lucide-react';
import RecentSearches from './RecentSearches';
import type { DiscoveryHistoryEntry, AcrisSearchHistoryEntry } from '../types/searchHistory';

interface SearchInputProps {
  onAnalyze: (input: string) => void;
  loading: boolean;
  historyVersion?: number;
  onSelectDiscovery?: (entry: DiscoveryHistoryEntry) => void;
  onSelectOwner?: (query: string) => void;
  onSelectAcris?: (entry: AcrisSearchHistoryEntry) => void;
}

export default function SearchInput({ onAnalyze, loading, historyVersion = 0, onSelectDiscovery, onSelectOwner, onSelectAcris }: SearchInputProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim() && !loading) onAnalyze(value.trim());
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Building2 className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter NYC address or BBL (e.g. 1001370027)"
            className="w-full pl-12 pr-36 py-4 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent shadow-sm text-base transition-shadow hover:shadow-md"
            disabled={loading}
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-700 text-white rounded-lg font-medium text-sm hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => { setValue('1001370027'); }}
            className="hover:text-teal-600 transition-colors underline decoration-dotted"
          >
            Demo: BBL 1001370027
          </button>
          <button
            type="button"
            onClick={() => { setValue('120 Broadway, New York, NY'); }}
            className="hover:text-teal-600 transition-colors underline decoration-dotted"
          >
            Demo: 120 Broadway
          </button>
        </div>
      </form>

      <RecentSearches onSelectAnalysis={onAnalyze} onSelectDiscovery={onSelectDiscovery} onSelectOwner={onSelectOwner} onSelectAcris={onSelectAcris} historyVersion={historyVersion} />
    </div>
  );
}
