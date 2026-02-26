import { useState, useRef, useEffect, useMemo } from 'react';
import { SlidersHorizontal, Clock, ChevronDown, ChevronRight, X, Search, DollarSign } from 'lucide-react';
import type { DiscoveryFilters as Filters } from '../types/discovery';
import { BLDG_CLASS_GROUPS } from '../lib/discovery/buildingClasses';
import ZoneDropdown from './ZoneDropdown';

interface DiscoveryFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onSearch: () => void;
  loading: boolean;
  latestSaleDate?: string | null;
}

const BOROUGHS = [
  { value: '1', label: 'Manhattan' },
  { value: '2', label: 'Bronx' },
  { value: '3', label: 'Brooklyn' },
  { value: '4', label: 'Queens' },
  { value: '5', label: 'Staten Island' },
];

const SALE_RECENCY_OPTIONS = [
  { value: 0, label: 'Any', years: 0 },
  { value: 0.038, label: '2 weeks', years: 0.038 },
  { value: 0.083, label: '1 month', years: 0.083 },
  { value: 0.25, label: '3 months', years: 0.25 },
  { value: 0.5, label: '6 months', years: 0.5 },
  { value: 1, label: '1 year', years: 1 },
  { value: 2, label: '2 years', years: 2 },
  { value: 3, label: '3 years', years: 3 },
  { value: 5, label: '5 years', years: 5 },
  { value: 10, label: '10 years', years: 10 },
];

function Checkbox({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] shrink-0 ${
        checked
          ? 'bg-teal-600 border-teal-600 text-white'
          : partial
            ? 'bg-teal-100 border-teal-400 text-teal-600'
            : 'border-slate-300'
      }`}
    >
      {checked ? '\u2713' : partial ? '\u2013' : ''}
    </span>
  );
}

function BldgClassDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const query = search.toUpperCase().trim();

  const filteredGroups = useMemo(() => {
    if (!query) return BLDG_CLASS_GROUPS;
    return BLDG_CLASS_GROUPS.map((g) => {
      const groupMatch =
        g.prefix.includes(query) || g.label.toUpperCase().includes(query);
      if (groupMatch) return g;
      const filteredSubs = g.subClasses.filter(
        (sc) =>
          sc.code.includes(query) || sc.name.toUpperCase().includes(query)
      );
      if (filteredSubs.length === 0) return null;
      return { ...g, subClasses: filteredSubs };
    }).filter(Boolean) as typeof BLDG_CLASS_GROUPS;
  }, [query]);

  function toggleSub(code: string) {
    onChange(
      selectedSet.has(code)
        ? selected.filter((s) => s !== code)
        : [...selected, code]
    );
  }

  function toggleGroup(prefix: string) {
    const group = BLDG_CLASS_GROUPS.find((g) => g.prefix === prefix);
    if (!group) return;
    const codes = group.subClasses.map((sc) => sc.code);
    const allSelected = codes.every((c) => selectedSet.has(c));
    if (allSelected) {
      onChange(selected.filter((s) => !codes.includes(s)));
    } else {
      const toAdd = codes.filter((c) => !selectedSet.has(c));
      onChange([...selected, ...toAdd]);
    }
  }

  function toggleExpand(prefix: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }

  const summaryText = useMemo(() => {
    if (selected.length === 0) return 'All Classes';
    if (selected.length <= 3) return selected.join(', ');
    return `${selected.length} selected`;
  }, [selected]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-400 transition-colors"
      >
        <span className="truncate">{summaryText}</span>
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200"
            >
              {s}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSub(s);
                }}
                className="hover:text-teal-900"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 flex flex-col">
          <div className="px-2 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
            <Search className="h-3 w-3 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes..."
              className="w-full text-xs text-slate-700 bg-transparent outline-none placeholder:text-slate-300"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {filteredGroups.map((group) => {
              const codes = group.subClasses.map((sc) => sc.code);
              const selectedCount = codes.filter((c) => selectedSet.has(c)).length;
              const allSelected = selectedCount === codes.length;
              const isExpanded = expanded.has(group.prefix) || query.length > 0;

              return (
                <div key={group.prefix}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.prefix)}
                      className="px-1.5 py-1.5 text-slate-400 hover:text-slate-600"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.prefix)}
                      className={`flex-1 flex items-center gap-1.5 py-1.5 pr-3 text-xs transition-colors ${
                        allSelected
                          ? 'text-teal-700 font-semibold'
                          : 'text-slate-700 font-medium'
                      } hover:bg-slate-50`}
                    >
                      <Checkbox
                        checked={allSelected}
                        partial={selectedCount > 0 && !allSelected}
                      />
                      <span>
                        {group.prefix} - {group.label}
                      </span>
                      {selectedCount > 0 && !allSelected && (
                        <span className="text-[9px] text-teal-500 ml-auto">
                          {selectedCount}/{codes.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-5 border-l border-slate-100">
                      {group.subClasses.map((sc) => {
                        const active = selectedSet.has(sc.code);
                        return (
                          <button
                            key={sc.code}
                            type="button"
                            onClick={() => toggleSub(sc.code)}
                            className={`w-full flex items-center gap-1.5 pl-3 pr-3 py-1 text-[11px] transition-colors ${
                              active
                                ? 'bg-teal-50/60 text-teal-700'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            <Checkbox checked={active} />
                            <span className="font-mono text-[10px] w-5 shrink-0 text-slate-400">
                              {sc.code}
                            </span>
                            <span className="truncate">{sc.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                No matching classes
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-center px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 border-t border-slate-100 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function dataAgeDays(latestSaleDate: string | null | undefined): number | null {
  if (!latestSaleDate) return null;
  const latest = new Date(latestSaleDate + 'T00:00:00');
  const now = new Date();
  return Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DiscoveryFilters({ filters, onChange, onSearch, loading, latestSaleDate }: DiscoveryFiltersProps) {
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const ageDays = dataAgeDays(latestSaleDate);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">Discovery Filters</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-3">
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Borough</label>
          <select
            value={filters.borough || '1'}
            onChange={(e) => update({ borough: e.target.value })}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
          >
            {BOROUGHS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Min Slack SF</label>
          <input
            type="number"
            value={filters.minSlackSF ?? 0}
            onChange={(e) => update({ minSlackSF: Number(e.target.value) })}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Min Underbuilt %</label>
          <input
            type="number"
            value={filters.minUnderbuiltRatio ?? 0}
            onChange={(e) => update({ minUnderbuiltRatio: Number(e.target.value) })}
            min={0}
            max={100}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Zoning District</label>
          <ZoneDropdown
            selected={filters.zonePrefix || []}
            onChange={(v) => update({ zonePrefix: v })}
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Exclude Condos</label>
          <select
            value={filters.excludeCondos === false ? 'false' : 'true'}
            onChange={(e) => update({ excludeCondos: e.target.value === 'true' })}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Min Projected Units</label>
          <input
            type="number"
            value={filters.minProjectedUnits ?? 0}
            onChange={(e) => update({ minProjectedUnits: Number(e.target.value) })}
            min={0}
            placeholder="e.g. 6"
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Max Projected Units</label>
          <input
            type="number"
            value={filters.maxProjectedUnits ?? ''}
            onChange={(e) => update({ maxProjectedUnits: e.target.value ? Number(e.target.value) : undefined })}
            min={0}
            placeholder="e.g. 200"
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Building Class</label>
          <BldgClassDropdown
            selected={filters.bldgClass || []}
            onChange={(v) => update({ bldgClass: v })}
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Min Sale Price</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            <input
              type="number"
              value={filters.minSalePrice ?? ''}
              onChange={(e) => update({ minSalePrice: e.target.value ? Number(e.target.value) : undefined })}
              min={0}
              placeholder="e.g. 500000"
              className="w-full pl-6 pr-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Max Sale Price</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            <input
              type="number"
              value={filters.maxSalePrice ?? ''}
              onChange={(e) => update({ maxSalePrice: e.target.value ? Number(e.target.value) : undefined })}
              min={0}
              placeholder="e.g. 5000000"
              className="w-full pl-6 pr-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Min PPBSF</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            <input
              type="number"
              value={filters.minPPBSF ?? ''}
              onChange={(e) => update({ minPPBSF: e.target.value ? Number(e.target.value) : undefined })}
              min={0}
              placeholder="e.g. 50"
              className="w-full pl-6 pr-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Max PPBSF</label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            <input
              type="number"
              value={filters.maxPPBSF ?? ''}
              onChange={(e) => update({ maxPPBSF: e.target.value ? Number(e.target.value) : undefined })}
              min={0}
              placeholder="e.g. 250"
              className="w-full pl-6 pr-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1">Sold Within</label>
          <select
            value={filters.maxSaleRecencyYears ?? 0}
            onChange={(e) => update({ maxSaleRecencyYears: Number(e.target.value) })}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
          >
            {SALE_RECENCY_OPTIONS.map((opt) => {
              const cutoffDays = opt.years > 0 ? Math.round(opt.years * 365.25) : 0;
              const unreachable = ageDays !== null && cutoffDays > 0 && cutoffDays < ageDays;
              return (
                <option key={opt.value} value={opt.value} disabled={unreachable}>
                  {opt.label}{unreachable ? ' (no data)' : ''}
                </option>
              );
            })}
          </select>
          {latestSaleDate && (
            <div className="flex items-center gap-1 mt-1.5">
              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="text-[10px] text-slate-400">
                Latest sale: {formatDate(latestSaleDate)}
                {ageDays !== null && ageDays > 30 && (
                  <span className="text-amber-500 ml-1">({ageDays}d lag)</span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-end">
          <button
            onClick={onSearch}
            disabled={loading}
            className="w-full px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
}
