import { useState } from 'react';
import { Search, X } from 'lucide-react';
import type { AcrisRecentQuery, AcrisDocsSortableColumn, AcrisSortDirection } from '../types/acris';
import { DEED_TYPES, MORTGAGE_TYPES, REGULATORY_TYPES } from '../lib/acris/docTypes';
import { defaultDateRange } from '../lib/acris/utils';

interface AcrisDocsFiltersProps {
  onSearch: (query: AcrisRecentQuery) => void;
  loading: boolean;
}

const DOC_CATEGORIES = [
  { label: 'Deeds', types: [...DEED_TYPES], color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { label: 'Mortgages', types: [...MORTGAGE_TYPES], color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Regulatory', types: [...REGULATORY_TYPES], color: 'bg-slate-100 text-slate-600 border-slate-200' },
] as const;

export default function AcrisDocsFilters({ onSearch, loading }: AcrisDocsFiltersProps) {
  const defaults = defaultDateRange();
  const [borough, setBorough] = useState('');
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<AcrisDocsSortableColumn>('recorded_date');
  const [sortDir, setSortDir] = useState<AcrisSortDirection>('desc');

  function toggleCategory(label: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function buildQuery(): AcrisRecentQuery {
    const docTypes: string[] = [];
    for (const cat of DOC_CATEGORIES) {
      if (selectedCategories.has(cat.label)) {
        docTypes.push(...cat.types);
      }
    }

    return {
      borough: borough || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      docTypes: docTypes.length > 0 ? docTypes : undefined,
      sortBy,
      sortDir,
      limit: 50,
      offset: 0,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSearch(buildQuery());
  }

  function handleReset() {
    const d = defaultDateRange();
    setBorough('');
    setDateFrom(d.from);
    setDateTo(d.to);
    setMinAmount('');
    setMaxAmount('');
    setSelectedCategories(new Set());
    setSortBy('recorded_date');
    setSortDir('desc');
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Borough</label>
          <select
            value={borough}
            onChange={(e) => setBorough(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">All Boroughs</option>
            <option value="1">Manhattan</option>
            <option value="2">Bronx</option>
            <option value="3">Brooklyn</option>
            <option value="4">Queens</option>
            <option value="5">Staten Island</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Min Amount</label>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="$0"
            min={0}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Max Amount</label>
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            placeholder="No max"
            min={0}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as AcrisDocsSortableColumn)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="recorded_date">Date</option>
            <option value="amount">Amount</option>
            <option value="doc_type">Doc Type</option>
            <option value="borough">Borough</option>
            <option value="bbl">BBL</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Direction</label>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as AcrisSortDirection)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium text-slate-500">Doc Types:</span>
        {DOC_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => toggleCategory(cat.label)}
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
              selectedCategories.has(cat.label)
                ? cat.color + ' ring-1 ring-offset-1 ring-current'
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
            }`}
          >
            {cat.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-700 text-white text-xs font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </form>
  );
}
