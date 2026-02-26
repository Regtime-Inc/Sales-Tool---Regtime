import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AnalysisResult } from '../types/analysis';
import type { AppliedOverrides, UnitMixExtraction } from '../types/pdf';
import type { FeasibilityResult, CapacityInput } from '../types/feasibility';
import type { MihEligibilityResult } from '../lib/mih/types';
import { checkMihEligibility, clearMihCache } from '../lib/mih/service';
import { applyMihOverlay } from '../lib/feasibility/mih';
import { evaluateFeasibility } from '../lib/feasibility';
import ScoreGauge from './ScoreGauge';
import MetricsGrid from './MetricsGrid';
import ScoredIndicators from './ScoredIndicators';
import FeasibilityPanel from './FeasibilityPanel';
import ErrorBoundary from './ErrorBoundary';
import TaxProjectionChart from './TaxProjectionChart';
import PdfUploadPanel from './PdfUploadPanel';
import CapacityOverridesEditor from './CapacityOverridesEditor';
import OptimizerPanel from './OptimizerPanel';
import EvidenceList from './EvidenceList';
import AcrisDocsSection from './AcrisDocsSection';
import StakeholdersPanel from './StakeholdersPanel';
import TraceLog from './TraceLog';
import NextActions from './NextActions';
import ZolaWidget from './ZolaWidget';
import { MapPin, Clock } from 'lucide-react';

interface ResultsPanelProps {
  result: AnalysisResult;
  pdfOverrides: AppliedOverrides | null;
  onPdfOverridesChange: (overrides: AppliedOverrides | null) => void;
  onAnalyze?: (bbl: string) => void;
  onSelectOwner?: (name: string) => void;
}

export default function ResultsPanel({ result, pdfOverrides, onPdfOverridesChange, onAnalyze, onSelectOwner }: ResultsPanelProps) {
  const [mihResult, setMihResult] = useState<MihEligibilityResult | null>(null);
  const [mihLoading, setMihLoading] = useState(false);
  const [extractedUnitMix, setExtractedUnitMix] = useState<UnitMixExtraction | null>(null);
  const [uapUtilizationPct, setUapUtilizationPct] = useState(100);

  const lat = result.latitude;
  const lng = result.longitude;

  const runMihCheck = useCallback(async (force = false) => {
    if (lat == null || lng == null) return;
    setMihLoading(true);
    try {
      if (force) clearMihCache();
      const res = await checkMihEligibility(lat, lng, force, result.pluto?.zonedist1);
      setMihResult(res);
    } catch {
      setMihResult({
        status: 'unavailable',
        eligible: false,
        derived: {},
        source: { name: 'NYC Open Data - MIH', datasetId: 'bw8v-wzdr', fetchedAtISO: new Date().toISOString() },
        errors: ['Unexpected error during MIH check'],
      });
    } finally {
      setMihLoading(false);
    }
  }, [lat, lng, result.pluto?.zonedist1]);

  useEffect(() => {
    setMihResult(null);
    if (lat != null && lng != null) {
      runMihCheck();
    } else if (result.feasibility) {
      setMihResult({
        status: 'unavailable',
        eligible: false,
        derived: {},
        source: { name: 'NYC Open Data - MIH', datasetId: 'bw8v-wzdr', fetchedAtISO: new Date().toISOString() },
        errors: ['Property coordinates not available for MIH lookup'],
      });
    }
  }, [lat, lng, runMihCheck, result.feasibility]);

  const baseFeasibility = useMemo((): FeasibilityResult | null => {
    if (!result.pluto) return result.feasibility;
    if (!pdfOverrides && uapUtilizationPct === 100) return result.feasibility;

    const pluto = result.pluto;
    const asm = pdfOverrides?.assemblage;

    const lotArea = pdfOverrides?.lotArea
      ?? asm?.totalLotArea
      ?? pluto.lotarea;
    const existingBldgArea = pdfOverrides?.existingBldgArea
      ?? asm?.totalExistingBldgArea
      ?? pluto.bldgarea;
    const residFar = pdfOverrides?.residFar
      ?? asm?.effectiveResidFar
      ?? pluto.residfar;
    const commFar = pdfOverrides?.commFar
      ?? asm?.effectiveCommFar
      ?? pluto.commfar;
    const facilFar = pdfOverrides?.facilFar
      ?? asm?.effectiveFacilFar
      ?? pluto.facilfar;
    const zoneDist = pdfOverrides?.zoneDist
      ?? asm?.effectiveZoneDist
      ?? pluto.zonedist1;

    const input: CapacityInput = {
      lotArea,
      existingBldgArea,
      residFar,
      commFar,
      facilFar,
      builtFar: pluto.builtfar,
      zoneDist,
      landUse: pluto.landuse,
      unitsRes: pdfOverrides?.totalUnits ?? pluto.unitsres,
      numFloors: pdfOverrides?.floors ?? pluto.numfloors,
      yearBuilt: pluto.yearbuilt,
    };

    const activePrograms: string[] = [];
    if (result.flags?.is485x) activePrograms.push('485-x');
    if (result.flags?.isUap) activePrograms.push('UAP');

    return evaluateFeasibility(input, activePrograms, uapUtilizationPct);
  }, [result.feasibility, result.pluto, result.flags, pdfOverrides, uapUtilizationPct]);

  const overrideContext = useMemo((): string | null => {
    if (!pdfOverrides) return null;
    const asm = pdfOverrides.assemblage;
    const manualKeys = Object.entries(pdfOverrides).filter(
      ([k, v]) => k !== 'assemblage' && v != null
    );
    const parts: string[] = [];
    if (asm) parts.push(`Assemblage: ${asm.lots.length} lots, ${asm.totalLotArea.toLocaleString()} SF`);
    if (manualKeys.length > 0) parts.push('Manual overrides active');
    return parts.length > 0 ? parts.join(' / ') : null;
  }, [pdfOverrides]);

  const resolvedFeasibility = useMemo((): FeasibilityResult | null => {
    const base = baseFeasibility ?? result.feasibility;
    if (!base) return null;
    if (!mihResult) return base;

    const mihIdx = base.programs.findIndex((p) => p.program === 'MIH');
    if (mihIdx < 0) return base;

    const updatedMih = applyMihOverlay(base.programs[mihIdx], mihResult);
    const programs = [...base.programs];
    programs[mihIdx] = updatedMih;
    return { ...base, programs };
  }, [baseFeasibility, result.feasibility, mihResult]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            {result.address ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-800">{result.address}</h2>
                </div>
                <p className="text-sm text-slate-400 ml-6">
                  BBL {result.bbl} &middot; Borough {result.borough}, Block {parseInt(result.block)}, Lot {parseInt(result.lot)}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>BBL {result.bbl}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-800">
                  Borough {result.borough}, Block {parseInt(result.block)}, Lot {parseInt(result.lot)}
                </h2>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            <span>{new Date(result.analyzedAt).toLocaleString()}</span>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{result.summary}</p>
      </div>

      <ScoreGauge scoring={result.scoring} />

      <MetricsGrid metrics={result.metrics} pluto={result.pluto} onSelectOwner={onSelectOwner} />

      <ScoredIndicators breakdown={result.scoring.breakdown} />

      <ZolaWidget borough={result.borough} block={result.block} lot={result.lot} />

      <PdfUploadPanel
        onOverridesChange={onPdfOverridesChange}
        appliedOverrides={pdfOverrides}
        onUnitMixChange={setExtractedUnitMix}
        bbl={result.bbl}
        plutoData={result.pluto ? {
          lotarea: result.pluto.lotarea,
          residfar: result.pluto.residfar,
          bldgarea: result.pluto.bldgarea,
        } : null}
      />

      {result.pluto && (
        <CapacityOverridesEditor
          pluto={result.pluto}
          overrides={pdfOverrides}
          onOverridesChange={onPdfOverridesChange}
          bbl={result.bbl}
        />
      )}

      {resolvedFeasibility && (
        <ErrorBoundary label="FeasibilityPanel">
          <FeasibilityPanel
            feasibility={resolvedFeasibility}
            mihOverlay={mihResult}
            mihLoading={mihLoading}
            onRetryMih={() => runMihCheck(true)}
            overrideContext={overrideContext}
            uapUtilizationPct={uapUtilizationPct}
            onUapUtilizationChange={setUapUtilizationPct}
          />
        </ErrorBoundary>
      )}

      {resolvedFeasibility && (
        <ErrorBoundary label="Unit-Mix Optimizer">
          <OptimizerPanel
            feasibility={resolvedFeasibility}
            recentSale={result.recentSale}
            metrics={result.metrics}
            pluto={result.pluto}
            borough={result.borough}
            overrideContext={overrideContext}
            extractedUnitMix={extractedUnitMix}
          />
        </ErrorBoundary>
      )}

      {result.taxProjections && <TaxProjectionChart projections={result.taxProjections} />}

      <EvidenceList
        sale={result.recentSale}
        secondarySale={result.secondarySale}
        dobFilings={result.dobFilings}
        dobPermits={result.dobPermits || []}
        bisWebFilings={result.bisWebFilings || []}
        hpdRegistrations={result.hpdRegistrations || []}
        flags={result.flags}
        bbl={result.bbl}
      />

      <ErrorBoundary label="AcrisDocsSection">
        <AcrisDocsSection bbl={result.bbl} onAnalyze={onAnalyze || (() => {})} />
      </ErrorBoundary>

      <ErrorBoundary label="StakeholdersPanel">
        <StakeholdersPanel stakeholders={result.stakeholders} bbl={result.bbl} onSelectOwner={onSelectOwner} />
      </ErrorBoundary>

      <TraceLog trace={result.trace} />

      <NextActions actions={result.nextActions} />
    </div>
  );
}
