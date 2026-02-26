import { FileCheck, AlertTriangle, ChevronDown, ChevronRight, Scan, FileQuestion, ShieldAlert, Ruler, Table2, Info } from 'lucide-react';
import { useState, useCallback } from 'react';
import type {
  PdfExtraction,
  ExtractedField,
  UnitRecord,
  UnitMixOverrides,
  PlutoCheckResult,
  CoverSheetExtraction,
} from '../types/pdf';
import type { ExtractionV2Result, ClassifiedTable, Evidence, TableType } from '../lib/extractionV2';
import UnitMixSummary from './UnitMixSummary';
import UnitMixEvidence from './UnitMixEvidence';
import UnitMixReviewTable from './UnitMixReviewTable';

interface PdfExtractedValuesProps {
  extraction: PdfExtraction;
  filename: string;
  onRecordsChange?: (records: UnitRecord[]) => void;
  onTriggerOcr?: () => void;
  plutoCheck?: PlutoCheckResult;
  pipelineConfidence?: number;
  pipelineEvidence?: { pagesUsed: number[]; tablesFound: number };
  coverSheet?: CoverSheetExtraction;
  v2Result?: ExtractionV2Result;
  unitMixOverrides?: UnitMixOverrides | null;
}

const TABLE_TYPE_LABELS: Record<TableType, string> = {
  light_ventilation_schedule: 'Light & Vent',
  unit_schedule: 'Unit Schedule',
  zoning_table: 'Zoning',
  occupancy_load: 'Occupancy',
  unknown: 'Unknown',
};

const TABLE_TYPE_COLORS: Record<TableType, string> = {
  light_ventilation_schedule: 'bg-slate-100 text-slate-600',
  unit_schedule: 'bg-teal-100 text-teal-700',
  zoning_table: 'bg-sky-100 text-sky-700',
  occupancy_load: 'bg-amber-100 text-amber-700',
  unknown: 'bg-slate-100 text-slate-500',
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  let color = 'bg-emerald-100 text-emerald-700';
  if (confidence < 0.55) color = 'bg-red-100 text-red-700';
  else if (confidence < 0.8) color = 'bg-amber-100 text-amber-700';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>
      {pct}%
    </span>
  );
}

function FieldRow({ label, field }: { label: string; field: ExtractedField<number | string> | null }) {
  if (!field) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">
          {typeof field.value === 'number' ? field.value.toLocaleString() : field.value}
        </span>
        <ConfidenceBadge confidence={field.confidence} />
        {field.pageNumber && (
          <span className="text-[10px] text-slate-400">p.{field.pageNumber}</span>
        )}
      </div>
    </div>
  );
}

function EvidencePanel({ evidence, label }: { evidence: Evidence[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (evidence.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {evidence.length} evidence source{evidence.length !== 1 ? 's' : ''} for {label}
      </button>
      {open && (
        <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
          {evidence.map((e, i) => (
            <div key={i} className="bg-slate-50 rounded px-2 py-1 text-[10px] text-slate-500">
              <span className="font-medium text-slate-400">p.{e.page}</span>{' '}
              <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                e.sourceType === 'cover_sheet' ? 'bg-teal-50 text-teal-600' :
                e.sourceType === 'zoning_text' ? 'bg-sky-50 text-sky-600' :
                e.sourceType === 'unit_schedule_table' ? 'bg-emerald-50 text-emerald-600' :
                'bg-slate-100 text-slate-500'
              }`}>
                {e.sourceType.replace(/_/g, ' ')}
              </span>{' '}
              <span className="break-all">{e.snippet.substring(0, 120)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotFoundCard({ label, message }: { label: string; message: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
      <Info className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-amber-800">{label}: Not found</p>
        <p className="text-[10px] text-amber-600 mt-0.5 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

function TablesSummary({ tables }: { tables: ClassifiedTable[] }) {
  const [open, setOpen] = useState(false);
  if (tables.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-lg p-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full"
      >
        <Table2 className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Tables Found ({tables.length})
        </p>
        {open ? <ChevronDown className="h-3 w-3 text-slate-400 ml-auto" /> : <ChevronRight className="h-3 w-3 text-slate-400 ml-auto" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {tables.map((t, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${TABLE_TYPE_COLORS[t.tableType]}`}>
                {TABLE_TYPE_LABELS[t.tableType]}
              </span>
              <span className="text-[10px] text-slate-400">p.{t.pageIndex}</span>
              <span className="text-[10px] text-slate-400 truncate flex-1">
                {t.headers.join(' | ').substring(0, 80)}
              </span>
              <ConfidenceBadge confidence={t.confidence} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlutoCrossCheck({ plutoCheck }: { plutoCheck: PlutoCheckResult }) {
  if (plutoCheck.warnings.length === 0) return null;
  return (
    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
        <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide">
          PLUTO Cross-Check
        </p>
      </div>
      <div className="space-y-1">
        {plutoCheck.warnings.map((w, i) => (
          <p key={i} className="text-[11px] text-orange-700 leading-relaxed">{w}</p>
        ))}
      </div>
      {plutoCheck.plutoValues.impliedMaxUnits != null && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-orange-600">
          {plutoCheck.plutoValues.lotArea != null && (
            <span>PLUTO Lot: {plutoCheck.plutoValues.lotArea.toLocaleString()} SF</span>
          )}
          {plutoCheck.plutoValues.residFar != null && (
            <span>PLUTO FAR: {plutoCheck.plutoValues.residFar}</span>
          )}
          <span>Implied Max Units: {plutoCheck.plutoValues.impliedMaxUnits}</span>
        </div>
      )}
    </div>
  );
}

function CoverSheetData({ coverSheet }: { coverSheet: CoverSheetExtraction }) {
  const entries: Array<{ label: string; value: string }> = [];
  if (coverSheet.lotAreaSf) entries.push({ label: 'Lot Area', value: `${coverSheet.lotAreaSf.toLocaleString()} SF` });
  if (coverSheet.far) entries.push({ label: 'FAR', value: `${coverSheet.far}` });
  if (coverSheet.totalUnits) entries.push({ label: 'Units', value: `${coverSheet.totalUnits}` });
  if (coverSheet.floors) entries.push({ label: 'Floors', value: `${coverSheet.floors}` });
  if (coverSheet.buildingAreaSf) entries.push({ label: 'Bldg Area', value: `${coverSheet.buildingAreaSf.toLocaleString()} SF` });
  if (coverSheet.zone) entries.push({ label: 'Zone', value: coverSheet.zone });
  if (coverSheet.block) entries.push({ label: 'Block', value: coverSheet.block });
  if (coverSheet.lot) entries.push({ label: 'Lot', value: coverSheet.lot });
  if (coverSheet.bin) entries.push({ label: 'BIN', value: coverSheet.bin });
  if (coverSheet.occupancyGroup) entries.push({ label: 'Occupancy', value: coverSheet.occupancyGroup });
  if (coverSheet.constructionClass) entries.push({ label: 'Constr. Class', value: coverSheet.constructionClass });
  if (entries.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <FileCheck className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Cover Sheet Data
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
        {entries.map((e) => (
          <div key={e.label} className="flex items-center justify-between py-0.5">
            <span className="text-[10px] text-slate-500">{e.label}</span>
            <span className="text-[10px] font-semibold text-slate-700">{e.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoningData({ v2Result }: { v2Result: ExtractionV2Result }) {
  const z = v2Result.zoning;
  const hasData = z.lotArea || z.far || z.zoningFloorArea || z.zone;
  if (!hasData) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Ruler className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Zoning Data
        </p>
      </div>
      <div className="space-y-1.5">
        {z.lotArea && (
          <div className="flex items-center justify-between py-1 border-b border-slate-50">
            <span className="text-xs text-slate-500">Lot Area</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">{z.lotArea.value.toLocaleString()} SF</span>
              <ConfidenceBadge confidence={z.lotArea.confidence} />
            </div>
          </div>
        )}
        {z.zoningFloorArea && (
          <div className="flex items-center justify-between py-1 border-b border-slate-50">
            <span className="text-xs text-slate-500">Zoning Floor Area</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">{z.zoningFloorArea.value.toLocaleString()} SF</span>
              <ConfidenceBadge confidence={z.zoningFloorArea.confidence} />
            </div>
          </div>
        )}
        {z.far && (
          <div className="flex items-center justify-between py-1 border-b border-slate-50">
            <span className="text-xs text-slate-500">FAR</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">{z.far.value}</span>
              <ConfidenceBadge confidence={z.far.confidence} />
            </div>
          </div>
        )}
        {z.zone && (
          <div className="flex items-center justify-between py-1 border-b border-slate-50">
            <span className="text-xs text-slate-500">Zone District</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">{z.zone.value}</span>
              <ConfidenceBadge confidence={z.zone.confidence} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SnippetLog({ snippets }: { snippets: PdfExtraction['rawSnippets'] }) {
  const [open, setOpen] = useState(false);
  if (snippets.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {snippets.length} evidence snippet{snippets.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
          {snippets.map((s, i) => (
            <div key={i} className="bg-slate-50 rounded px-2 py-1 text-[10px] text-slate-500">
              <span className="font-medium text-slate-400">p.{s.page} [{s.target}]</span>{' '}
              <span className="break-all">{s.text.substring(0, 120)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function exportUnitMixJson(extraction: PdfExtraction) {
  if (!extraction.unitMix) return;
  const blob = new Blob([JSON.stringify(extraction.unitMix, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'unit-mix.json';
  a.click();
  URL.revokeObjectURL(url);
}

function exportUnitMixCsv(extraction: PdfExtraction) {
  if (!extraction.unitMix) return;
  const headers = ['Unit ID', 'Bedroom Type', 'Bedroom Count', 'Allocation', 'AMI Band', 'Type Code', 'Page', 'Method'];
  const rows = extraction.unitMix.unitRecords.map((r) => [
    r.unitId || '',
    r.bedroomType,
    r.bedroomCount ?? '',
    r.allocation,
    r.amiBand ?? '',
    r.unitTypeCode || '',
    r.source.page,
    r.source.method,
  ]);
  const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'unit-mix.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function PdfExtractedValues({
  extraction,
  filename,
  onRecordsChange,
  onTriggerOcr,
  plutoCheck,
  pipelineConfidence,
  pipelineEvidence,
  coverSheet,
  v2Result,
  unitMixOverrides,
}: PdfExtractedValuesProps) {
  const z = extraction.zoningAnalysis;
  const hasZoning = v2Result
    ? !!(v2Result.zoning.lotArea || v2Result.zoning.far || v2Result.zoning.zoningFloorArea)
    : !!(z.lotArea || z.far || z.zoningFloorArea || z.proposedFloorArea || z.residFar);
  const hasUnits = extraction.unitSchedule.length > 0;
  const hasConversion = extraction.conversion !== null;
  const hasUnitMix = extraction.unitMix && extraction.unitMix.unitRecords.length > 0;
  const [showReview, setShowReview] = useState(false);

  const displayConfidence = pipelineConfidence ?? extraction.overallConfidence;

  const handleRecordsChange = useCallback(
    (records: UnitRecord[]) => onRecordsChange?.(records),
    [onRecordsChange]
  );

  const noUnitMix = v2Result && !hasUnitMix;
  const noData = !hasZoning && !hasUnits && !hasConversion && !hasUnitMix && !v2Result;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-xs font-medium text-slate-600">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={displayConfidence} />
          <span className="text-[10px] text-slate-400">
            {extraction.pageCount} pg, {extraction.textYield} yield
          </span>
          {pipelineEvidence && (
            <span className="text-[10px] text-slate-400">
              {pipelineEvidence.tablesFound} tbl, {pipelineEvidence.pagesUsed.length} pg used
            </span>
          )}
        </div>
      </div>

      {v2Result?.ocrUsed && (
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
          <Scan className="h-3 w-3 text-slate-400" />
          <span className="text-[10px] text-slate-500">OCR:</span>
          <span className="text-[10px] font-medium text-teal-700">Google Document AI</span>
        </div>
      )}

      {coverSheet && <CoverSheetData coverSheet={coverSheet} />}

      {v2Result && v2Result.totalUnits && (
        <EvidencePanel evidence={v2Result.totalUnits.evidence} label="Total Units" />
      )}

      {plutoCheck && <PlutoCrossCheck plutoCheck={plutoCheck} />}

      {v2Result && hasZoning && <ZoningData v2Result={v2Result} />}

      {!v2Result && hasZoning && (
        <div className="bg-white border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Zoning Analysis
          </p>
          <FieldRow label="Lot Area (SF)" field={z.lotArea} />
          <FieldRow label="FAR" field={z.far} />
          <FieldRow label="Residential FAR" field={z.residFar} />
          <FieldRow label="Zoning Floor Area (SF)" field={z.zoningFloorArea} />
          <FieldRow label="Proposed Floor Area (SF)" field={z.proposedFloorArea} />
        </div>
      )}

      {extraction.needsOcr && !v2Result && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] text-amber-700">
              Low text yield detected. This PDF may be scanned/image-based. Results may be incomplete.
            </p>
            {onTriggerOcr && (
              <button
                onClick={onTriggerOcr}
                className="flex items-center gap-1 mt-1.5 text-[10px] text-sky-600 hover:text-sky-700 font-medium transition-colors"
              >
                <Scan className="h-3 w-3" /> Run OCR to improve extraction
              </button>
            )}
          </div>
        </div>
      )}

      {hasUnitMix && extraction.unitMix && (
        <>
          <UnitMixSummary unitMix={extraction.unitMix} overrides={unitMixOverrides} />
          <UnitMixEvidence records={extraction.unitMix.unitRecords} />

          <button
            onClick={() => setShowReview(!showReview)}
            className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 font-medium transition-colors"
          >
            {showReview ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showReview ? 'Hide' : 'Show'} Review & Edit Table
          </button>

          {showReview && (
            <UnitMixReviewTable
              records={extraction.unitMix.unitRecords}
              onRecordsChange={handleRecordsChange}
              onExportJson={() => exportUnitMixJson(extraction)}
              onExportCsv={() => exportUnitMixCsv(extraction)}
            />
          )}
        </>
      )}

      {noUnitMix && (
        <NotFoundCard
          label="Unit Mix"
          message={
            v2Result.warnings.find((w) => w.includes('Unit mix')) ??
            'No unit schedule table found in the uploaded plans. Upload plans containing an apartment unit schedule for detailed unit mix data.'
          }
        />
      )}

      {v2Result && v2Result.unitRecords.length === 0 && !hasUnitMix && (
        <NotFoundCard
          label="Unit Schedule"
          message="No unit schedule table was identified. Total unit count is from cover sheet or zoning text only."
        />
      )}

      {hasUnits && !hasUnitMix && (
        <div className="bg-white border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Unit Schedule ({extraction.unitSchedule.length} types)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-left py-1 pr-2 font-medium">Type</th>
                  <th className="text-right py-1 px-2 font-medium">Count</th>
                  <th className="text-right py-1 px-2 font-medium">NSF</th>
                  <th className="text-right py-1 px-2 font-medium">GSF</th>
                  <th className="text-right py-1 pl-2 font-medium">Tenure</th>
                </tr>
              </thead>
              <tbody>
                {extraction.unitSchedule.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1 pr-2 text-slate-600">
                      <div className="flex items-center gap-1">
                        {row.unitType.value}
                        <ConfidenceBadge confidence={row.unitType.confidence} />
                      </div>
                    </td>
                    <td className="py-1 px-2 text-right font-medium text-slate-700">
                      {row.count.value}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-600">
                      {row.nsf ? row.nsf.value.toLocaleString() : '-'}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-600">
                      {row.gsf ? row.gsf.value.toLocaleString() : '-'}
                    </td>
                    <td className="py-1 pl-2 text-right text-slate-500 text-[10px]">
                      {row.affordableOrMarket?.value ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasConversion && extraction.conversion && (
        <div className="bg-white border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Conversion Breakdown
          </p>
          <FieldRow label="Pre-Existing Area (SF)" field={extraction.conversion.preExistingArea} />
          <FieldRow label="New Area (SF)" field={extraction.conversion.newArea} />
          <FieldRow label="Total Area (SF)" field={extraction.conversion.totalArea} />
        </div>
      )}

      {v2Result && <TablesSummary tables={v2Result.tablesSummary} />}

      {noData && (
        <div className="text-center py-6 bg-slate-50 rounded-lg">
          <FileQuestion className="h-6 w-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">No unit schedule detected</p>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">
            Try uploading architectural plans with an "Apartment Unit Schedule" table, or use OCR for scanned documents.
          </p>
          {onTriggerOcr && (
            <button
              onClick={onTriggerOcr}
              className="flex items-center gap-1 mx-auto mt-3 text-[10px] text-sky-600 hover:text-sky-700 font-medium bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-md transition-colors"
            >
              <Scan className="h-3 w-3" /> Select pages to OCR
            </button>
          )}
        </div>
      )}

      <SnippetLog snippets={extraction.rawSnippets} />
    </div>
  );
}
