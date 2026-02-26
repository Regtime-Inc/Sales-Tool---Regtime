import { useState, useCallback, useEffect, useRef } from 'react';
import { Building2, RefreshCw, Loader2 } from 'lucide-react';
import OwnerSearchPanel from './owners/OwnerSearchPanel';
import OwnerPortfolioView from './owners/OwnerPortfolioView';
import { triggerReindex } from '../lib/owners/api';
import type { OwnerSearchResult, AssociatedEntity } from '../types/owners';

interface OwnersPageProps {
  onAnalyze: (bbl: string) => void;
  onHistoryChange?: () => void;
  searchPrefill?: string | null;
  onSearchPrefillConsumed?: () => void;
}

function entityToSearchResult(entity: AssociatedEntity): OwnerSearchResult {
  return {
    id: entity.id,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    aliases: [],
    emails: [],
    phones: [],
    addresses: [],
    match_score: 1,
    property_count: entity.property_count,
  };
}

export default function OwnersPage({ onAnalyze, onHistoryChange, searchPrefill, onSearchPrefillConsumed }: OwnersPageProps) {
  const [selectedOwner, setSelectedOwner] = useState<OwnerSearchResult | null>(null);
  const [ownerHistory, setOwnerHistory] = useState<OwnerSearchResult[]>([]);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    if (searchPrefill) {
      if (!prefillConsumedRef.current) {
        prefillConsumedRef.current = true;
        onSearchPrefillConsumed?.();
      }
    } else {
      prefillConsumedRef.current = false;
    }
  }, [searchPrefill, onSearchPrefillConsumed]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    setReindexResult(null);
    try {
      const result = await triggerReindex();
      setReindexResult(
        `Indexed ${result.created} new + ${result.updated} updated entities, ${result.linksCreated} property links`
      );
    } catch (e) {
      setReindexResult(e instanceof Error ? e.message : 'Reindex failed');
    } finally {
      setReindexing(false);
    }
  }, []);

  const handleSelectOwner = useCallback((owner: OwnerSearchResult) => {
    setSelectedOwner(owner);
    setOwnerHistory([]);
  }, []);

  const handleNavigateToEntity = useCallback((entity: AssociatedEntity) => {
    setOwnerHistory((prev) => selectedOwner ? [...prev, selectedOwner] : prev);
    setSelectedOwner(entityToSearchResult(entity));
  }, [selectedOwner]);

  const handleBack = useCallback(() => {
    setOwnerHistory((prev) => {
      const next = [...prev];
      const previous = next.pop();
      if (previous) setSelectedOwner(previous);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Owner / Developer Portfolio</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Search across ACRIS, DOB NOW, and stakeholder data to find owner portfolios
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reindexResult && (
            <span className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5 max-w-md">
              {reindexResult}
            </span>
          )}
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {reindexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reindex
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[600px]">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <OwnerSearchPanel
            selectedId={selectedOwner?.id || null}
            onSelect={handleSelectOwner}
            onHistoryChange={onHistoryChange}
            prefillQuery={searchPrefill}
          />
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {selectedOwner ? (
            <OwnerPortfolioView
              owner={selectedOwner}
              onAnalyze={onAnalyze}
              onNavigateToEntity={handleNavigateToEntity}
              onBack={handleBack}
              hasPreviousEntity={ownerHistory.length > 0}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <Building2 className="h-12 w-12 text-slate-200 mb-4" />
              <p className="text-sm text-slate-400 mb-1">Select an owner to view their portfolio</p>
              <p className="text-xs text-slate-300">
                Properties, purchases, DOB filings, and contact info
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
