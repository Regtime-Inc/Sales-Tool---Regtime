import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, X, Loader2, ToggleLeft, ToggleRight, AlertCircle, RefreshCw, StopCircle, Database, Sparkles, CloudOff, ChevronDown, ChevronRight } from 'lucide-react';
import { runPipelineV2, runLlmValidationPass } from '../lib/extractionV2';
import type { V2PipelineProgress } from '../lib/extractionV2';
import { checkDocAiAvailable } from '../lib/extractionV2/docaiLayout';
import { applyValidationGates } from '../lib/extractionV2/validationGates';
import PdfExtractedValues from './PdfExtractedValues';
import ExtractionOverridePrompt from './ExtractionOverridePrompt';
import LlmReconciliationSummary from './LlmReconciliationSummary';
import ExtractedDataPointsPanel from './ExtractedDataPointsPanel';
import type {
  AppliedOverrides,
  UnitRecord,
  UnitMixExtraction,
  UnitMixOverrides,
  ExtractedPdfData,
} from '../types/pdf';
import { supabase } from '../lib/supabase';

const STAGE_LABELS: Record<string, string> = {
  TEXT_EXTRACT: 'Extracting text',
  OCR_DETECT: 'Detecting scanned pages',
  DOCAI_FETCH: 'Running cloud OCR',
  TABLE_CLASSIFY: 'Classifying tables',
  SIGNAL_EXTRACT: 'Extracting signals',
  RESOLVE: 'Resolving extraction',
  VALIDATE_GATES: 'Validating against city data',
  LLM_VALIDATE: 'Verifying with AI',
  ADAPT: 'Finalizing results',
  DONE: 'Complete',
};

function mergeUnitMixOverrides(base: UnitMixExtraction, overrides: UnitMixOverrides): UnitMixExtraction {
  const byBed = { ...base.totals.byBedroomType };
  if (overrides.studio != null) byBed['STUDIO'] = overrides.studio;
  if (overrides.br1 != null) byBed['1BR'] = overrides.br1;
  if (overrides.br2 != null) byBed['2BR'] = overrides.br2;
  if (overrides.br3 != null) byBed['3BR'] = overrides.br3;
  if (overrides.br4plus != null) byBed['4BR_PLUS'] = overrides.br4plus;

  const byAlloc = { ...base.totals.byAllocation };
  if (overrides.affordableUnits != null) {
    const totalAff = (byAlloc['AFFORDABLE'] ?? 0) + (byAlloc['MIH_RESTRICTED'] ?? 0);
    if (totalAff > 0 && byAlloc['MIH_RESTRICTED']) {
      const ratio = (byAlloc['MIH_RESTRICTED'] ?? 0) / totalAff;
      byAlloc['MIH_RESTRICTED'] = Math.round(overrides.affordableUnits * ratio);
      byAlloc['AFFORDABLE'] = overrides.affordableUnits - byAlloc['MIH_RESTRICTED'];
    } else {
      byAlloc['AFFORDABLE'] = overrides.affordableUnits;
    }
  }
  if (overrides.marketUnits != null) byAlloc['MARKET'] = overrides.marketUnits;

  const totalUnits = overrides.totalUnits ?? base.totals.totalUnits;

  return {
    ...base,
    totals: {
      ...base.totals,
      totalUnits,
      byBedroomType: byBed,
      byAllocation: byAlloc,
    },
    confidence: {
      ...base.confidence,
      warnings: [
        ...base.confidence.warnings.filter((w) => !w.startsWith('AI override')),
        'AI override values applied to unit mix summary',
      ],
    },
  };
}

interface PdfFile {
  id: string;
  file: File;
  status: 'pending' | 'extracting' | 'extracted' | 'error' | 'verifying';
  error: string | null;
  pipelineData: ExtractedPdfData | null;
  progress: V2PipelineProgress | null;
  cached: boolean;
  overridesConfirmed: boolean;
}

interface PdfUploadPanelProps {
  onOverridesChange: (overrides: AppliedOverrides | null) => void;
  appliedOverrides: AppliedOverrides | null;
  onUnitMixChange?: (unitMix: UnitMixExtraction | null) => void;
  bbl?: string;
  plutoData?: { lotarea: number; residfar: number; bldgarea: number } | null;
}

export default function PdfUploadPanel({
  onOverridesChange,
  appliedOverrides,
  onUnitMixChange,
  bbl,
  plutoData,
}: PdfUploadPanelProps) {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [applyToggle, setApplyToggle] = useState(false);
  const [docAiUnavailable, setDocAiUnavailable] = useState(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [dataPointAppliedCount, setDataPointAppliedCount] = useState(0);
  const [unitMixOverrides, setUnitMixOverrides] = useState<UnitMixOverrides | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    checkDocAiAvailable().then((ok) => {
      if (!ok) setDocAiUnavailable(true);
    });
  }, []);

  const runPipelineForEntry = useCallback(async (entry: PdfFile) => {
    setFiles((prev) =>
      prev.map((p) => (p.id === entry.id ? { ...p, status: 'extracting', progress: null, error: null, cached: false, overridesConfirmed: false } : p))
    );

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await runPipelineV2([entry.file], {
        signal: abort.signal,
        bbl,
        plutoData,
        onProgress: (progress) => {
          setFiles((prev) =>
            prev.map((p) => (p.id === entry.id ? { ...p, progress } : p))
          );
        },
      });

      setFiles((prev) =>
        prev.map((p) =>
          p.id === entry.id
            ? {
                ...p,
                status: 'extracted',
                pipelineData: result,
                progress: null,
                cached: result.status === 'cached',
                overridesConfirmed: !result.needsManualConfirmation,
              }
            : p
        )
      );

      setExpandedFileId(entry.id);

      if (result.extraction?.unitMix) {
        onUnitMixChange?.(result.extraction.unitMix);
      }
    } catch (e) {
      if (abort.signal.aborted) return;
      const msg = e instanceof Error ? e.message : 'PDF processing failed';
      setFiles((prev) =>
        prev.map((p) =>
          p.id === entry.id
            ? { ...p, status: 'error', error: msg, progress: null }
            : p
        )
      );
    }
  }, [onUnitMixChange, bbl, plutoData]);

  const runLlmVerification = useCallback(async (fileId: string) => {
    const entry = files.find((f) => f.id === fileId);
    if (!entry?.pipelineData?.v2Result) return;

    setFiles((prev) =>
      prev.map((p) => (p.id === fileId ? { ...p, status: 'verifying' } : p))
    );

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const pages = entry.pipelineData.v2Result.pageRelevance.map((r) => ({
        pageIndex: r.pageIndex,
        text: '',
        charCount: 0,
        isLikelyScanned: false,
      }));

      const v2Pages = entry.pipelineData.v2Result;
      const relevantPageTexts = v2Pages.pageRelevance
        .filter((r) => r.selectedForLlm)
        .map((r) => ({
          pageIndex: r.pageIndex,
          text: entry.pipelineData!.extraction.rawSnippets
            .filter((s) => s.page === r.pageIndex)
            .map((s) => s.text)
            .join('\n') || `Page ${r.pageIndex}`,
          charCount: 100,
          isLikelyScanned: false,
        }));

      const updated = await runLlmValidationPass(
        entry.pipelineData,
        relevantPageTexts.length > 0 ? relevantPageTexts : pages,
        { plutoData, bbl, signal: abort.signal },
      );

      setFiles((prev) =>
        prev.map((p) =>
          p.id === fileId
            ? { ...p, status: 'extracted', pipelineData: updated, overridesConfirmed: !updated.needsManualConfirmation }
            : p
        )
      );

      onUnitMixChange?.(updated.extraction?.unitMix ?? null);
    } catch (e) {
      if (abort.signal.aborted) return;
      setFiles((prev) =>
        prev.map((p) =>
          p.id === fileId
            ? { ...p, status: 'extracted', error: e instanceof Error ? e.message : 'LLM verification failed' }
            : p
        )
      );
    }
  }, [files, plutoData, bbl, onUnitMixChange]);

  const handleOverridesSubmit = useCallback(async (fileId: string, overrides: Record<string, number | string>) => {
    let emittedUnitMix: UnitMixExtraction | null = null;

    setFiles((prev) =>
      prev.map((p) => {
        if (p.id !== fileId || !p.pipelineData) return p;
        const updated = { ...p.pipelineData, manualOverrides: overrides, needsManualConfirmation: false };

        if (typeof overrides.totalUnits === 'number') {
          updated.totals = { ...updated.totals, totalUnits: overrides.totalUnits };
          if (updated.v2Result?.totalUnits) {
            updated.v2Result = {
              ...updated.v2Result,
              totalUnits: { ...updated.v2Result.totalUnits, value: overrides.totalUnits },
            };
          }
          const za = updated.extraction.zoningAnalysis;
          if (za.totalUnits) {
            updated.extraction = {
              ...updated.extraction,
              zoningAnalysis: { ...za, totalUnits: { ...za.totalUnits, value: overrides.totalUnits } },
            };
          }
          if (updated.extraction.unitMix) {
            const oldTotals = updated.extraction.unitMix.totals;
            const oldTotal = oldTotals.totalUnits || 1;
            const newTotal = overrides.totalUnits as number;
            const scale = newTotal / oldTotal;
            const scaledBed: Record<string, number> = {};
            let bedSum = 0;
            const bedKeys = Object.keys(oldTotals.byBedroomType);
            for (const k of bedKeys) {
              const v = Math.round(oldTotals.byBedroomType[k] * scale);
              scaledBed[k] = v;
              bedSum += v;
            }
            if (bedKeys.length > 0 && bedSum !== newTotal) {
              scaledBed[bedKeys[0]] += newTotal - bedSum;
            }
            const scaledAlloc: Record<string, number> = {};
            let allocSum = 0;
            const allocKeys = Object.keys(oldTotals.byAllocation);
            for (const k of allocKeys) {
              const v = Math.round(oldTotals.byAllocation[k] * scale);
              scaledAlloc[k] = v;
              allocSum += v;
            }
            if (allocKeys.length > 0 && allocSum !== newTotal) {
              scaledAlloc[allocKeys[0]] += newTotal - allocSum;
            }
            const scaledCross: Record<string, Record<string, number>> = {};
            for (const [alloc, bedMap] of Object.entries(oldTotals.byAllocationAndBedroom)) {
              scaledCross[alloc] = {};
              for (const [bed, cnt] of Object.entries(bedMap)) {
                scaledCross[alloc][bed] = Math.round(cnt * scale);
              }
            }
            const scaledAmi: Record<string, number> | undefined = oldTotals.byAmiBand
              ? Object.fromEntries(Object.entries(oldTotals.byAmiBand).map(([k, v]) => [k, Math.round(v * scale)]))
              : undefined;
            updated.extraction = {
              ...updated.extraction,
              unitMix: {
                ...updated.extraction.unitMix,
                totals: {
                  totalUnits: newTotal,
                  byBedroomType: scaledBed,
                  byAllocation: scaledAlloc,
                  byAllocationAndBedroom: scaledCross,
                  byAmiBand: scaledAmi,
                },
              },
            };
          }
        }

        if (typeof overrides.far === 'number' && updated.v2Result?.zoning.far) {
          updated.v2Result = {
            ...updated.v2Result,
            zoning: { ...updated.v2Result.zoning, far: { ...updated.v2Result.zoning.far, value: overrides.far } },
          };
          const z = updated.extraction.zoningAnalysis;
          if (z.far) {
            updated.extraction = { ...updated.extraction, zoningAnalysis: { ...z, far: { ...z.far, value: overrides.far } } };
          }
        }

        if (typeof overrides.lotArea === 'number' && updated.v2Result?.zoning.lotArea) {
          updated.v2Result = {
            ...updated.v2Result,
            zoning: { ...updated.v2Result.zoning, lotArea: { ...updated.v2Result.zoning.lotArea, value: overrides.lotArea } },
          };
          const z = updated.extraction.zoningAnalysis;
          if (z.lotArea) {
            updated.extraction = { ...updated.extraction, zoningAnalysis: { ...z, lotArea: { ...z.lotArea, value: overrides.lotArea } } };
          }
        }

        if (updated.v2Result) {
          const effectiveLotArea = typeof overrides.lotArea === 'number'
            ? overrides.lotArea
            : updated.v2Result.zoning.lotArea?.value;
          const effectiveFar = typeof overrides.far === 'number'
            ? overrides.far
            : updated.v2Result.zoning.far?.value;
          if (effectiveLotArea && effectiveFar) {
            const derivedZfa = Math.round(effectiveLotArea * effectiveFar);
            const existingZfa = updated.v2Result.zoning.zoningFloorArea;
            updated.v2Result = {
              ...updated.v2Result,
              zoning: {
                ...updated.v2Result.zoning,
                zoningFloorArea: existingZfa
                  ? { ...existingZfa, value: derivedZfa }
                  : { value: derivedZfa, confidence: 0.9, evidence: [] },
              },
            };
            const za = updated.extraction.zoningAnalysis;
            updated.extraction = {
              ...updated.extraction,
              zoningAnalysis: {
                ...za,
                zoningFloorArea: za.zoningFloorArea
                  ? { ...za.zoningFloorArea, value: derivedZfa }
                  : { value: derivedZfa, confidence: 0.9, source: 'derived', pageNumber: null },
              },
            };
          }

          const { gates } = applyValidationGates(updated.v2Result, plutoData);
          updated.validationGates = gates;
          updated.v2Result = { ...updated.v2Result, validationGates: gates };
        }

        if (updated.extraction.unitMix) {
          emittedUnitMix = updated.extraction.unitMix;
        }

        return { ...p, pipelineData: updated, overridesConfirmed: true };
      })
    );

    onUnitMixChange?.(emittedUnitMix);

    try {
      if (bbl) {
        await supabase
          .from('pdf_uploads')
          .update({ manual_overrides: overrides })
          .eq('filename', files.find((f) => f.id === fileId)?.file.name ?? '');
      }
    } catch {
      // non-fatal
    }
  }, [bbl, files, plutoData, onUnitMixChange]);

  const handleConfirmAll = useCallback((fileId: string) => {
    let confirmedUnitMix: UnitMixExtraction | null = null;
    setFiles((prev) =>
      prev.map((p) => {
        if (p.id !== fileId || !p.pipelineData) return p;
        if (p.pipelineData.extraction?.unitMix) {
          confirmedUnitMix = p.pipelineData.extraction.unitMix;
        }
        return { ...p, pipelineData: { ...p.pipelineData, needsManualConfirmation: false }, overridesConfirmed: true };
      })
    );
    if (confirmedUnitMix) {
      onUnitMixChange?.(confirmedUnitMix);
    }
  }, [onUnitMixChange]);

  const handleDataPointsApply = useCallback((overrides: AppliedOverrides) => {
    const count = Object.entries(overrides).filter(([k, v]) => k !== 'assemblage' && v != null).length;
    setDataPointAppliedCount(count);
    setApplyToggle(true);
    onOverridesChange(count > 0 ? overrides : null);

    try {
      const extracted = files.find((f) => f.pipelineData?.llmValidationUsed);
      if (bbl && extracted) {
        supabase
          .from('pdf_uploads')
          .update({ applied_data_points: overrides })
          .eq('filename', extracted.file.name)
          .then(() => {});
      }
    } catch {
      // non-fatal
    }
  }, [files, bbl, onOverridesChange]);

  const handleDataPointsClear = useCallback(() => {
    setDataPointAppliedCount(0);
    setApplyToggle(false);
    onOverridesChange(null);
    setUnitMixOverrides(null);
    const extracted = files.find((f) => f.pipelineData?.extraction?.unitMix);
    if (extracted?.pipelineData?.extraction?.unitMix) {
      onUnitMixChange?.(extracted.pipelineData.extraction.unitMix);
    }
  }, [onOverridesChange, files, onUnitMixChange]);

  const handleUnitMixApply = useCallback((overrides: UnitMixOverrides | null) => {
    setUnitMixOverrides(overrides);
    const extracted = files.find((f) => f.pipelineData?.extraction?.unitMix);
    const baseUnitMix = extracted?.pipelineData?.extraction?.unitMix;
    if (!baseUnitMix) return;
    if (!overrides) {
      onUnitMixChange?.(baseUnitMix);
      return;
    }
    const merged = mergeUnitMixOverrides(baseUnitMix, overrides);
    onUnitMixChange?.(merged);
  }, [files, onUnitMixChange]);

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const pdfs = Array.from(newFiles).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;

    const entries: PdfFile[] = pdfs.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'pending' as const,
      error: null,
      pipelineData: null,
      progress: null,
      cached: false,
      overridesConfirmed: false,
    }));

    setFiles((prev) => [...prev, ...entries]);

    for (const entry of entries) {
      await runPipelineForEntry(entry);
    }
  }, [runPipelineForEntry]);

  const cancelPipeline = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleRecordsChange = useCallback((fileId: string, records: UnitRecord[]) => {
    let emittedUnitMix: UnitMixExtraction | null = null;

    setFiles((prev) =>
      prev.map((p) => {
        if (p.id !== fileId || !p.pipelineData?.extraction?.unitMix) return p;
        const byBed: Record<string, number> = {};
        const byAlloc: Record<string, number> = {};
        const byCross: Record<string, Record<string, number>> = {};
        const byAmi: Record<string, number> = {};
        for (const r of records) {
          byBed[r.bedroomType] = (byBed[r.bedroomType] || 0) + 1;
          byAlloc[r.allocation] = (byAlloc[r.allocation] || 0) + 1;
          if (!byCross[r.allocation]) byCross[r.allocation] = {};
          byCross[r.allocation][r.bedroomType] = (byCross[r.allocation][r.bedroomType] || 0) + 1;
          if (r.amiBand !== undefined) {
            const key = `${r.amiBand}%`;
            byAmi[key] = (byAmi[key] || 0) + 1;
          }
        }
        const updatedUnitMix: UnitMixExtraction = {
          ...p.pipelineData.extraction.unitMix,
          unitRecords: records,
          totals: {
            totalUnits: records.length,
            byBedroomType: byBed,
            byAllocation: byAlloc,
            byAllocationAndBedroom: byCross,
            byAmiBand: Object.keys(byAmi).length > 0 ? byAmi : undefined,
          },
        };
        emittedUnitMix = updatedUnitMix;
        const updatedExtraction = { ...p.pipelineData.extraction, unitMix: updatedUnitMix };
        const updatedData = { ...p.pipelineData, extraction: updatedExtraction, unitRecords: records };
        return { ...p, pipelineData: updatedData };
      })
    );

    if (emittedUnitMix) {
      onUnitMixChange?.(emittedUnitMix);
    }
  }, [onUnitMixChange]);

  const handleToggle = () => {
    const next = !applyToggle;
    setApplyToggle(next);

    if (next) {
      if (dataPointAppliedCount > 0) {
        return;
      }
      const extracted = files.find((f) => f.pipelineData);
      if (extracted?.pipelineData) {
        const z = extracted.pipelineData.extraction.zoningAnalysis;
        const overrides: AppliedOverrides = {};
        if (z.lotArea) overrides.lotArea = z.lotArea.value;
        if (z.residFar) overrides.residFar = z.residFar.value;
        if (z.proposedFloorArea) overrides.proposedFloorArea = z.proposedFloorArea.value;
        if (extracted.pipelineData.extraction.conversion?.preExistingArea) {
          overrides.existingBldgArea = extracted.pipelineData.extraction.conversion.preExistingArea.value;
        }
        if (extracted.pipelineData.far?.lotAreaSf) {
          overrides.lotArea = overrides.lotArea ?? extracted.pipelineData.far.lotAreaSf;
        }
        const cs = extracted.pipelineData.coverSheet;
        if (cs) {
          if (cs.lotAreaSf && !overrides.lotArea) overrides.lotArea = cs.lotAreaSf;
          if (cs.far && !overrides.residFar) overrides.residFar = cs.far;
          if (cs.buildingAreaSf && !overrides.proposedFloorArea) overrides.proposedFloorArea = cs.buildingAreaSf;
          if (cs.zone && !overrides.zoneDist) overrides.zoneDist = cs.zone;
        }

        if (extracted.pipelineData.manualOverrides) {
          const mo = extracted.pipelineData.manualOverrides;
          if (typeof mo.lotArea === 'number') overrides.lotArea = mo.lotArea;
          if (typeof mo.far === 'number') overrides.residFar = mo.far;
        }

        onOverridesChange(Object.keys(overrides).length > 0 ? overrides : null);
      }
    } else {
      setDataPointAppliedCount(0);
      onOverridesChange(null);
    }
  };

  const hasExtracted = files.some((f) => f.status === 'extracted');

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        PDF Document Ingestion
      </h3>

      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragActive
            ? 'border-teal-400 bg-teal-50'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/pdf';
          input.multiple = true;
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) addFiles(target.files);
          };
          input.click();
        }}
      >
        <Upload
          className={`h-8 w-8 mx-auto mb-2 ${dragActive ? 'text-teal-500' : 'text-slate-300'}`}
        />
        <p className="text-sm text-slate-500">
          Drop PDF files here or <span className="text-teal-600 font-medium">browse</span>
        </p>
        <p className="text-[10px] text-slate-400 mt-1">
          Zoning analyses, unit schedules, pro formas (50MB max per file)
        </p>
      </div>

      {docAiUnavailable && (
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <CloudOff className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700">Cloud OCR unavailable</p>
            <p className="text-[10px] text-amber-600 mt-0.5">
              Google Document AI is not configured. Scanned or image-based PDFs may produce incomplete extractions.
            </p>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-3">
          {files.map((f) => (
            <div key={f.id} className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpandedFileId(expandedFileId === f.id ? null : f.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {f.pipelineData?.extraction ? (
                    expandedFileId === f.id
                      ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-sm text-slate-700 truncate">{f.file.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {(f.file.size / 1024).toFixed(0)} KB
                  </span>
                  {f.cached && (
                    <span className="flex items-center gap-1">
                      <span className="flex items-center gap-0.5 text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full font-medium">
                        <Database className="h-2.5 w-2.5" /> Cached
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runPipelineForEntry(f);
                        }}
                        className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded-full font-medium transition-colors"
                        title="Reprocess file (ignore cache)"
                      >
                        <RefreshCw className="h-2.5 w-2.5" /> Reprocess
                      </button>
                    </span>
                  )}
                  {f.pipelineData?.llmValidationUsed && (
                    <span className="flex items-center gap-0.5 text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full font-medium">
                      <Sparkles className="h-2.5 w-2.5" /> AI Verified
                    </span>
                  )}
                  {f.pipelineData?.redundancyScore != null && f.pipelineData.redundancyScore > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      f.pipelineData.redundancyScore >= 0.85
                        ? 'text-emerald-600 bg-emerald-50'
                        : f.pipelineData.redundancyScore >= 0.6
                        ? 'text-amber-600 bg-amber-50'
                        : 'text-red-600 bg-red-50'
                    }`}>
                      {(f.pipelineData.redundancyScore * 100).toFixed(0)}% redundancy
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(f.status === 'extracting' || f.status === 'verifying') && (
                    <>
                      <span className="flex items-center gap-1 text-[10px] text-amber-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {f.status === 'verifying'
                          ? 'Verifying with AI'
                          : f.progress
                          ? STAGE_LABELS[f.progress.stage] || f.progress.message
                          : 'Starting'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelPipeline();
                        }}
                        className="p-0.5 hover:bg-red-50 rounded transition-colors"
                        title="Cancel"
                      >
                        <StopCircle className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </>
                  )}
                  {f.status === 'extracted' && (
                    <span className="text-[10px] text-emerald-600 font-medium">Extracted</span>
                  )}
                  {f.status === 'error' && (
                    <div className="flex items-center gap-1">
                      <span className="flex items-center gap-1 text-[10px] text-red-600 max-w-[200px] truncate">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" /> {f.error}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addFiles([f.file]);
                          removeFile(f.id);
                        }}
                        className="p-0.5 hover:bg-red-50 rounded transition-colors"
                        title="Retry"
                      >
                        <RefreshCw className="h-3 w-3 text-red-400" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.id);
                    }}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {(f.status === 'extracting' || f.status === 'verifying') && f.progress && (
                <div className="px-4 py-2">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(f.progress.pct, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {expandedFileId === f.id && (
                <>
                  {f.pipelineData && f.pipelineData.confidence.warnings.length > 0 && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                      {f.pipelineData.confidence.warnings.slice(0, 5).map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-700">{w}</p>
                      ))}
                    </div>
                  )}

                  {f.pipelineData?.validationGates && f.pipelineData.validationGates.length > 0 && (
                    <div className="px-4 py-3 border-t border-slate-50">
                      <ExtractionOverridePrompt
                        gates={f.pipelineData.validationGates}
                        onOverridesSubmit={(overrides) => handleOverridesSubmit(f.id, overrides)}
                        onConfirmAll={() => handleConfirmAll(f.id)}
                        redundancyScore={f.pipelineData.redundancyScore}
                        overridesApplied={f.overridesConfirmed && !!f.pipelineData.manualOverrides}
                      />
                    </div>
                  )}

                  {f.pipelineData?.extraction && (
                    <div className="px-4 py-3">
                      <PdfExtractedValues
                        extraction={f.pipelineData.extraction}
                        filename={f.file.name}
                        onRecordsChange={(records) => handleRecordsChange(f.id, records)}
                        plutoCheck={f.pipelineData.plutoCheck}
                        pipelineConfidence={f.pipelineData.confidence.overall}
                        pipelineEvidence={f.pipelineData.evidence}
                        coverSheet={f.pipelineData.coverSheet}
                        v2Result={f.pipelineData.v2Result}
                        unitMixOverrides={unitMixOverrides}
                      />
                    </div>
                  )}

                  {f.status === 'extracted' && f.pipelineData && !f.pipelineData.llmValidationUsed && (
                    <div className="px-4 py-3 border-t border-slate-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runLlmVerification(f.id);
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 transition-all shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Verify with AI
                      </button>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sends relevant pages to GPT-4o for cross-validation against city data
                      </p>
                    </div>
                  )}

                  {f.pipelineData?.llmValidationUsed && f.pipelineData.v2Result?.llmReconciliation && f.pipelineData.v2Result.llmReconciliation.length > 0 && (
                    <div className="px-4 py-3 border-t border-slate-50 space-y-3">
                      <LlmReconciliationSummary reconciliations={f.pipelineData.v2Result.llmReconciliation} />
                      <ExtractedDataPointsPanel
                        reconciliations={f.pipelineData.v2Result.llmReconciliation}
                        onApply={handleDataPointsApply}
                        onUnitMixApply={handleUnitMixApply}
                        onClear={handleDataPointsClear}
                        appliedCount={dataPointAppliedCount}
                      />
                    </div>
                  )}
                </>
              )}

              {expandedFileId !== f.id && f.pipelineData?.extraction?.unitMix && (
                <div className="px-4 py-2 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {f.pipelineData.extraction.unitMix.totals.totalUnits} units extracted
                  </span>
                  <span className="text-[10px] text-teal-600 font-medium">Click to expand</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasExtracted && (
        <div className="mt-4 flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Apply extracted values to feasibility model
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Overrides PLUTO data with PDF-extracted lot area, FAR, and floor area values
            </p>
          </div>
          <button
            onClick={handleToggle}
            className="flex-shrink-0 transition-colors"
          >
            {applyToggle ? (
              <ToggleRight className="h-7 w-7 text-teal-600" />
            ) : (
              <ToggleLeft className="h-7 w-7 text-slate-300" />
            )}
          </button>
        </div>
      )}

      {appliedOverrides && (
        <div className="mt-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1">
            Active Overrides
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-teal-700">
            {appliedOverrides.lotArea != null && (
              <span>Lot Area: {appliedOverrides.lotArea.toLocaleString()} SF</span>
            )}
            {appliedOverrides.residFar != null && (
              <span>Resid FAR: {appliedOverrides.residFar}</span>
            )}
            {appliedOverrides.maxFar != null && (
              <span>Max FAR: {appliedOverrides.maxFar}</span>
            )}
            {appliedOverrides.proposedFloorArea != null && (
              <span>Proposed FA: {appliedOverrides.proposedFloorArea.toLocaleString()} SF</span>
            )}
            {appliedOverrides.existingBldgArea != null && (
              <span>Existing Bldg: {appliedOverrides.existingBldgArea.toLocaleString()} SF</span>
            )}
            {appliedOverrides.totalUnits != null && (
              <span>Units: {appliedOverrides.totalUnits}</span>
            )}
            {appliedOverrides.floors != null && (
              <span>Floors: {appliedOverrides.floors}</span>
            )}
            {appliedOverrides.buildingArea != null && (
              <span>Bldg Area: {appliedOverrides.buildingArea.toLocaleString()} SF</span>
            )}
            {appliedOverrides.zoneDist != null && (
              <span>Zone: {appliedOverrides.zoneDist}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
