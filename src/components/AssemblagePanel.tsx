import { useState, useCallback } from 'react';
import {
  Plus,
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { AssemblageLot, AssemblageConfig, FarSelectionMode } from '../types/pdf';
import type { PlutoData } from '../types/analysis';
import { analyzeProperty } from '../lib/api';
import { computeAssemblage, hasMultipleZoningDistricts } from '../lib/assemblage/compute';

interface AssemblagePanelProps {
  primaryBbl: string;
  pluto: PlutoData;
  assemblage: AssemblageConfig | null;
  onAssemblageChange: (config: AssemblageConfig | null) => void;
}

function plutoToLot(bbl: string, pluto: PlutoData, isPrimary: boolean): AssemblageLot {
  return {
    bbl,
    address: '',
    lotArea: pluto.lotarea,
    existingBldgArea: pluto.bldgarea,
    residFar: pluto.residfar,
    commFar: pluto.commfar,
    facilFar: pluto.facilfar,
    zoneDist: pluto.zonedist1,
    isPrimary,
  };
}

export default function AssemblagePanel({
  primaryBbl,
  pluto,
  assemblage,
  onAssemblageChange,
}: AssemblagePanelProps) {
  const [expanded, setExpanded] = useState(assemblage != null);
  const [bblInput, setBblInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [farMode, setFarMode] = useState<FarSelectionMode>(
    assemblage?.farSelectionMode ?? 'most_restrictive'
  );
  const [manualResidFar, setManualResidFar] = useState('');

  const lots = assemblage?.lots ?? [];

  const initAssemblage = useCallback(() => {
    if (lots.length > 0) return lots;
    const primary = plutoToLot(primaryBbl, pluto, true);
    return [primary];
  }, [lots, primaryBbl, pluto]);

  const recompute = useCallback(
    (updatedLots: AssemblageLot[], mode: FarSelectionMode) => {
      if (updatedLots.length <= 1) {
        onAssemblageChange(null);
        return;
      }
      const manualFar =
        mode === 'manual' && manualResidFar
          ? { resid: parseFloat(manualResidFar) }
          : undefined;
      const config = computeAssemblage(updatedLots, mode, manualFar);
      onAssemblageChange(config);
    },
    [onAssemblageChange, manualResidFar]
  );

  const addLot = useCallback(async () => {
    const cleaned = bblInput.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setError('BBL must be 10 digits');
      return;
    }
    if (lots.some((l) => l.bbl === cleaned) || cleaned === primaryBbl) {
      setError('This lot is already included');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await analyzeProperty(cleaned);
      if (!result.pluto) {
        setError('No PLUTO data found for this BBL');
        return;
      }

      const newLot: AssemblageLot = {
        bbl: cleaned,
        address: result.address ?? '',
        lotArea: result.pluto.lotarea,
        existingBldgArea: result.pluto.bldgarea,
        residFar: result.pluto.residfar,
        commFar: result.pluto.commfar,
        facilFar: result.pluto.facilfar,
        zoneDist: result.pluto.zonedist1,
        isPrimary: false,
      };

      const currentLots = initAssemblage();
      const updatedLots = [...currentLots, newLot];
      recompute(updatedLots, farMode);
      setBblInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }, [bblInput, lots, primaryBbl, initAssemblage, recompute, farMode]);

  const removeLot = useCallback(
    (bbl: string) => {
      const updated = lots.filter((l) => l.bbl !== bbl);
      recompute(updated, farMode);
    },
    [lots, recompute, farMode]
  );

  const handleModeChange = useCallback(
    (mode: FarSelectionMode) => {
      setFarMode(mode);
      if (lots.length > 1) {
        recompute(lots, mode);
      }
    },
    [lots, recompute]
  );

  const handleManualFarCommit = useCallback(() => {
    if (farMode === 'manual' && lots.length > 1) {
      const val = parseFloat(manualResidFar);
      if (!isNaN(val) && val > 0) {
        const config = computeAssemblage(lots, 'manual', { resid: val });
        onAssemblageChange(config);
      }
    }
  }, [farMode, lots, manualResidFar, onAssemblageChange]);

  const multipleZones = hasMultipleZoningDistricts(lots);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-700">
            Lot Assemblage
          </span>
          {lots.length > 1 && (
            <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full font-medium">
              {lots.length} lots
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-3">
          <p className="text-[10px] text-slate-400">
            Combine adjacent lots for aggregate capacity. Primary lot is included automatically.
          </p>

          {lots.length > 0 && (
            <div className="space-y-1.5">
              {lots.map((lot) => (
                <div
                  key={lot.bbl}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-md text-xs ${
                    lot.isPrimary
                      ? 'bg-slate-100 border border-slate-200'
                      : 'bg-white border border-slate-150'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-600">
                        {lot.bbl}
                      </span>
                      {lot.isPrimary && (
                        <span className="text-[9px] font-semibold text-slate-500 bg-slate-200 px-1 py-0.5 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    {lot.address && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {lot.address}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {lot.lotArea.toLocaleString()} SF / FAR {lot.residFar} / {lot.zoneDist}
                    </p>
                  </div>
                  {!lot.isPrimary && (
                    <button
                      onClick={() => removeLot(lot.bbl)}
                      className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    >
                      <X className="h-3 w-3 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={bblInput}
              onChange={(e) => {
                setBblInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addLot();
              }}
              placeholder="Enter 10-digit BBL"
              className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-slate-300"
            />
            <button
              onClick={addLot}
              disabled={loading || bblInput.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-md transition-colors"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Add
            </button>
          </div>

          {error && (
            <p className="text-[10px] text-red-600">{error}</p>
          )}

          {multipleZones && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700">
                These lots span multiple zoning districts. The effective FAR may require manual review.
              </p>
            </div>
          )}

          {lots.length > 1 && (
            <div className="bg-slate-50 rounded-md p-2.5 space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                FAR Selection
              </p>
              <div className="flex items-center gap-2">
                {(['most_restrictive', 'least_restrictive', 'manual'] as FarSelectionMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      onClick={() => handleModeChange(mode)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        farMode === mode
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {mode === 'most_restrictive'
                        ? 'Most Restrictive'
                        : mode === 'least_restrictive'
                          ? 'Least Restrictive'
                          : 'Manual'}
                    </button>
                  )
                )}
              </div>

              {farMode === 'manual' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-400">
                    Resid FAR:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualResidFar}
                    onChange={(e) => setManualResidFar(e.target.value)}
                    onBlur={handleManualFarCommit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualFarCommit();
                    }}
                    placeholder={String(assemblage?.effectiveResidFar ?? '')}
                    className="w-20 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-400">Total Lot Area</span>
                  <p className="font-semibold text-slate-700">
                    {assemblage?.totalLotArea.toLocaleString()} SF
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Eff. Resid FAR</span>
                  <p className="font-semibold text-slate-700">
                    {assemblage?.effectiveResidFar}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Eff. Zone</span>
                  <p className="font-semibold text-slate-700">
                    {assemblage?.effectiveZoneDist || '--'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
