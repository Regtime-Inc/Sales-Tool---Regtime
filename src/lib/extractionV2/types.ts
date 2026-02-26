import type {
  ExtractedPdfData,
  PdfExtraction,
  UnitRecord,
  UnitMixExtraction,
  FarExtraction,
  CoverSheetExtraction,
} from '../../types/pdf';

export type EvidenceSourceType =
  | 'cover_sheet'
  | 'zoning_text'
  | 'unit_schedule_table'
  | 'docai_table'
  | 'regex';

export interface Evidence {
  page: number;
  snippet: string;
  sourceType: EvidenceSourceType;
  tableType?: TableType;
  tableIndex?: number;
  confidence: number;
}

export interface Signal<T> {
  value: T;
  confidence: number;
  evidence: Evidence[];
}

export type TableType =
  | 'light_ventilation_schedule'
  | 'unit_schedule'
  | 'zoning_table'
  | 'occupancy_load'
  | 'unknown';

export interface ClassifiedTable {
  tableType: TableType;
  confidence: number;
  pageIndex: number;
  tableIndex: number;
  headers: string[];
  rows: string[][];
}

export interface PageText {
  pageIndex: number;
  text: string;
  charCount: number;
  isLikelyScanned: boolean;
}

export interface DocAiTable {
  pageIndex: number;
  tableIndex: number;
  headerRows: string[][];
  bodyRows: string[][];
}

export interface DocAiLayoutResult {
  pages: Array<{ pageIndex: number; text: string; lines: string[] }>;
  tables: DocAiTable[];
}

export interface UnitMixSignal {
  totalUnits: Signal<number> | null;
  unitMix: Signal<Record<string, number>> | null;
  unitRecords: Signal<UnitRecord[]> | null;
}

export interface ZoningSignals {
  totalDwellingUnits: Signal<number> | null;
  lotArea: Signal<number> | null;
  far: Signal<number> | null;
  zoningFloorArea: Signal<number> | null;
  zone: Signal<string> | null;
}

export interface CoverSheetSignals {
  totalUnits: Signal<number> | null;
  floors: Signal<number> | null;
  zone: Signal<string> | null;
  lotArea: Signal<number> | null;
  buildingArea: Signal<number> | null;
  far: Signal<number> | null;
}

export interface ExtractionV2Result {
  totalUnits: Signal<number> | null;
  unitMix: Signal<Record<string, number>> | null;
  unitRecords: UnitRecord[];
  zoning: ZoningSignals;
  coverSheet: CoverSheetSignals;
  warnings: string[];
  tablesSummary: ClassifiedTable[];
  ocrUsed: boolean;
  unitCountMentions: UnitCountMention[];
  redundancyScore: number;
  validationGates: ValidationGate[];
  llmReconciliation: LlmReconciliation[];
  pageRelevance: PageRelevanceResult[];
}

export type ValidationGateStatus = 'PASS' | 'WARN' | 'NEEDS_OVERRIDE' | 'CONFLICTING';

export interface ValidationGate {
  field: string;
  extractedValue: number | string | null;
  expectedRange: { min: number; max: number } | null;
  cityBasis: string;
  status: ValidationGateStatus;
  evidence: Evidence[];
  message: string;
}

export type PageCategory =
  | 'COVER_SHEET'
  | 'ZONING_ANALYSIS'
  | 'UNIT_SCHEDULE'
  | 'FLOOR_PLAN'
  | 'AFFORDABLE_HOUSING'
  | 'IRRELEVANT';

export interface PageRelevanceResult {
  pageIndex: number;
  score: number;
  category: PageCategory;
  selectedForLlm: boolean;
}

export interface LlmReconciliation {
  field: string;
  ruleBasedValue: number | string | null;
  llmValue: number | string | null;
  agreement: boolean;
  finalValue: number | string | null;
  finalConfidence: number;
  note: string;
}

export interface UnitCountMention {
  value: number;
  page: number;
  sourceType: EvidenceSourceType | 'llm';
  snippet: string;
  confidence: number;
}

export type V2PipelineStage =
  | 'TEXT_EXTRACT'
  | 'OCR_DETECT'
  | 'DOCAI_FETCH'
  | 'TABLE_CLASSIFY'
  | 'SIGNAL_EXTRACT'
  | 'RESOLVE'
  | 'VALIDATE_GATES'
  | 'LLM_VALIDATE'
  | 'ADAPT'
  | 'DONE';

export interface V2PipelineProgress {
  stage: V2PipelineStage;
  message: string;
  pct: number;
}

export interface V2PipelineOptions {
  onProgress?: (progress: V2PipelineProgress) => void;
  signal?: AbortSignal;
  bbl?: string;
  plutoData?: { lotarea: number; residfar: number; bldgarea: number } | null;
  enableLlmValidation?: boolean;
  zoneDist?: string;
}

function signalToField<T>(sig: Signal<T> | null, source: string) {
  if (!sig) return null;
  return {
    value: sig.value,
    confidence: sig.confidence,
    source,
    pageNumber: sig.evidence[0]?.page ?? null,
  };
}

function collectSnippets(v2: ExtractionV2Result) {
  const snippets: Array<{ page: number; text: string; target: string }> = [];
  const add = (ev: Evidence[], target: string) => {
    for (const e of ev) {
      if (e.snippet) snippets.push({ page: e.page, text: e.snippet, target });
    }
  };
  if (v2.totalUnits) add(v2.totalUnits.evidence, 'totalUnits');
  if (v2.unitMix) add(v2.unitMix.evidence, 'unitMix');
  if (v2.zoning.lotArea) add(v2.zoning.lotArea.evidence, 'lotArea');
  if (v2.zoning.far) add(v2.zoning.far.evidence, 'FAR');
  if (v2.zoning.zoningFloorArea) add(v2.zoning.zoningFloorArea.evidence, 'zoningFloorArea');
  return snippets;
}

export function toExtractedPdfData(
  v2: ExtractionV2Result,
  pageCount: number,
  fileHash?: string,
): ExtractedPdfData {
  const totalUnits = v2.totalUnits?.value ?? 0;
  const mix = v2.unitMix?.value ?? {};

  const byBed: Record<string, number> = {};
  const byAlloc: Record<string, number> = {};
  const byCross: Record<string, Record<string, number>> = {};
  let affordableCount = 0;
  let marketCount = 0;
  for (const r of v2.unitRecords) {
    byBed[r.bedroomType] = (byBed[r.bedroomType] || 0) + 1;
    byAlloc[r.allocation] = (byAlloc[r.allocation] || 0) + 1;
    if (!byCross[r.allocation]) byCross[r.allocation] = {};
    byCross[r.allocation][r.bedroomType] = (byCross[r.allocation][r.bedroomType] || 0) + 1;
    if (r.allocation === 'AFFORDABLE' || r.allocation === 'MIH_RESTRICTED') affordableCount++;
    if (r.allocation === 'MARKET') marketCount++;
  }

  const unitMixExtraction: UnitMixExtraction | undefined =
    v2.unitRecords.length > 0
      ? {
          unitRecords: v2.unitRecords,
          totals: {
            totalUnits: v2.unitRecords.length,
            byBedroomType: byBed,
            byAllocation: byAlloc,
            byAllocationAndBedroom: byCross,
          },
          confidence: {
            overall: v2.totalUnits?.confidence ?? 0.5,
            byPage: {},
            warnings: v2.warnings,
          },
        }
      : undefined;

  const overallConfidence = v2.totalUnits?.confidence ?? 0.3;

  const pagesUsed = new Set<number>();
  if (v2.totalUnits) v2.totalUnits.evidence.forEach((e) => pagesUsed.add(e.page));
  if (v2.unitMix) v2.unitMix.evidence.forEach((e) => pagesUsed.add(e.page));
  v2.tablesSummary.forEach((t) => pagesUsed.add(t.pageIndex));

  const extraction: PdfExtraction = {
    unitSchedule: [],
    zoningAnalysis: {
      lotArea: signalToField(v2.zoning.lotArea, 'v2_zoning'),
      far: signalToField(v2.zoning.far, 'v2_zoning'),
      zoningFloorArea: signalToField(v2.zoning.zoningFloorArea, 'v2_zoning'),
      proposedFloorArea: null,
      residFar: null,
      totalUnits: signalToField(v2.totalUnits, 'v2_resolved'),
      zoneDistrict: signalToField(v2.zoning.zone, 'v2_zoning'),
      buildingArea: null,
      floors: signalToField(v2.coverSheet.floors, 'v2_cover'),
      bin: null,
    },
    conversion: null,
    unitMix: unitMixExtraction,
    overallConfidence,
    textYield: overallConfidence >= 0.5 ? 'high' : 'low',
    needsOcr: false,
    pageCount,
    rawSnippets: collectSnippets(v2),
  };

  const farExtraction: FarExtraction | null =
    v2.zoning.lotArea || v2.zoning.far || v2.zoning.zoningFloorArea
      ? {
          lotAreaSf: v2.zoning.lotArea?.value ?? null,
          zoningFloorAreaSf: v2.zoning.zoningFloorArea?.value ?? null,
          proposedFloorAreaSf: null,
          proposedFAR: v2.zoning.far?.value ?? null,
          source: {
            page: v2.zoning.lotArea?.evidence[0]?.page ?? v2.zoning.far?.evidence[0]?.page ?? 0,
            method: 'TEXT_REGEX',
            evidence: 'v2 pipeline zoning extraction',
          },
          confidence: Math.max(v2.zoning.lotArea?.confidence ?? 0, v2.zoning.far?.confidence ?? 0),
        }
      : null;

  const coverSheetData: CoverSheetExtraction | undefined =
    v2.coverSheet.totalUnits || v2.coverSheet.floors || v2.coverSheet.zone
      ? {
          lotAreaSf: v2.coverSheet.lotArea?.value ?? null,
          far: v2.coverSheet.far?.value ?? null,
          totalUnits: v2.coverSheet.totalUnits?.value ?? null,
          floors: v2.coverSheet.floors?.value ?? null,
          buildingAreaSf: v2.coverSheet.buildingArea?.value ?? null,
          zone: v2.coverSheet.zone?.value ?? null,
          zoningMap: null,
          occupancyGroup: null,
          constructionClass: null,
          scopeOfWork: null,
          block: null,
          lot: null,
          bin: null,
        }
      : undefined;

  const needsManualConfirmation = v2.validationGates.some(
    (g) => g.status === 'NEEDS_OVERRIDE' || g.status === 'CONFLICTING'
  );

  return {
    status: v2.warnings.some((w) => w.includes('failed')) ? 'partial' : 'complete',
    totals: { totalUnits, affordableUnits: affordableCount, marketUnits: marketCount },
    unitMix: {
      studio: mix['STUDIO'] ?? byBed['STUDIO'] ?? 0,
      br1: mix['1BR'] ?? byBed['1BR'] ?? 0,
      br2: mix['2BR'] ?? byBed['2BR'] ?? 0,
      br3: mix['3BR'] ?? byBed['3BR'] ?? 0,
      br4plus: mix['4BR_PLUS'] ?? byBed['4BR_PLUS'] ?? 0,
    },
    unitRecords: v2.unitRecords,
    far: farExtraction,
    confidence: { overall: overallConfidence, warnings: [...v2.warnings] },
    evidence: {
      pagesUsed: Array.from(pagesUsed).sort((a, b) => a - b),
      tablesFound: v2.tablesSummary.length,
    },
    extraction,
    errors: [],
    fileHash,
    coverSheet: coverSheetData,
    llmExtractionUsed: v2.llmReconciliation.length > 0,
    ocrProviderUsed: v2.ocrUsed ? 'google_document_ai' : 'none',
    normalizationSource: 'none',
    v2Result: v2,
    validationGates: v2.validationGates,
    needsManualConfirmation,
    redundancyScore: v2.redundancyScore,
    llmValidationUsed: v2.llmReconciliation.length > 0,
  };
}
