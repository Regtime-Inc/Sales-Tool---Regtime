import { useState, useRef, useCallback, useEffect } from 'react';
import { Compass } from 'lucide-react';
import DiscoveryFiltersComp from './DiscoveryFilters';
import DiscoveryTable from './DiscoveryTable';
import { fetchDiscovery } from '../lib/discovery/api';
import { getDefaultBldgClassCodes } from '../lib/discovery/buildingClasses';
import { getDefaultZoneCodes } from '../lib/discovery/zoningDistricts';
import { recordDiscoverySearch } from '../lib/searchHistory';
import type { DiscoveryFilters, DiscoveryResponse, SortSpec } from '../types/discovery';

const BOROUGH_NAMES: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

interface DiscoveryPageProps {
  onAnalyze: (bbl: string) => void;
  onHistoryChange?: () => void;
  filtersOverride?: DiscoveryFilters | null;
  onFiltersOverrideConsumed?: () => void;
}

export default function DiscoveryPage({ onAnalyze, onHistoryChange, filtersOverride, onFiltersOverrideConsumed }: DiscoveryPageProps) {
  const [filters, setFilters] = useState<DiscoveryFilters>(() => ({
    borough: '1',
    minSlackSF: 0,
    minUnderbuiltRatio: 0,
    excludeCondos: true,
    zonePrefix: getDefaultZoneCodes(),
    maxSaleRecencyYears: 0,
    minSalePrice: 200000,
    minPPBSF: 50,
    maxPPBSF: 250,
    bldgClass: getDefaultBldgClassCodes(),
  }));
  const [sorts, setSorts] = useState<SortSpec[]>([{ column: 'score', direction: 'desc' }]);
  const [response, setResponse] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const pendingRef = useRef<{ page: number; sorts: SortSpec[] } | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const executeSearchWithFilters = useCallback(async (f: DiscoveryFilters, page: number, sortSpecs: SortSpec[]) => {
    if (inflightRef.current) {
      pendingRef.current = { page, sorts: sortSpecs };
      return;
    }
    inflightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDiscovery(f, page, 25, sortSpecs);
      setResponse(data);

      if (page === 1) {
        const topScore = data.candidates.length > 0
          ? Math.max(...data.candidates.map((c) => c.score))
          : 0;
        recordDiscoverySearch({
          borough: f.borough || '1',
          boroughName: BOROUGH_NAMES[f.borough || '1'] || 'Manhattan',
          zonePrefix: (f.zonePrefix || []).join(','),
          minSlackSf: f.minSlackSF || 0,
          minUnderbuiltRatio: f.minUnderbuiltRatio || 0,
          excludeCondos: f.excludeCondos ?? true,
          maxSaleRecencyYears: f.maxSaleRecencyYears || 0,
          resultCount: data.total,
          topScore,
        }).then(() => onHistoryChange?.()).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discovery failed');
    } finally {
      setLoading(false);
      inflightRef.current = false;
      const next = pendingRef.current;
      if (next) {
        pendingRef.current = null;
        executeSearchWithFilters(filtersRef.current, next.page, next.sorts);
      }
    }
  }, [onHistoryChange]);

  useEffect(() => {
    if (filtersOverride) {
      setFilters(filtersOverride);
      onFiltersOverrideConsumed?.();
      executeSearchWithFilters(filtersOverride, 1, sorts);
    }
  }, [filtersOverride, onFiltersOverrideConsumed, executeSearchWithFilters, sorts]);

  function handleSearch(page = 1) {
    executeSearchWithFilters(filters, page, sorts);
  }

  function handleSortChange(newSorts: SortSpec[]) {
    setSorts(newSorts);
    executeSearchWithFilters(filters, 1, newSorts);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
          <Compass className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Batch BBL Discovery</h2>
          <p className="text-xs text-slate-400">
            Find underbuilt parcels ranked by development potential
          </p>
        </div>
      </div>

      <DiscoveryFiltersComp
        filters={filters}
        onChange={setFilters}
        onSearch={() => handleSearch(1)}
        loading={loading}
        latestSaleDate={response?.latestSaleDate}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {response && (
        <DiscoveryTable
          response={response}
          onAnalyze={onAnalyze}
          onPageChange={(p) => handleSearch(p)}
          sorts={sorts}
          onSortChange={handleSortChange}
        />
      )}

      {!response && !loading && (
        <div className="text-center py-12">
          <Compass className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Set filters and click Search to find candidate development sites
          </p>
        </div>
      )}
    </div>
  );
}
