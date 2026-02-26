export interface ExtractedField<T = number> {
  value: T;
  confidence: number;
  source: string;
  pageNumber: number | null;
}

export interface UnitScheduleRow {
  unitType: ExtractedField<string>;
  count: ExtractedField<number>;
  nsf: ExtractedField<number> | null;
  gsf: ExtractedField<number> | null;
  affordableOrMarket: ExtractedField<string> | null;
}

export interface ZoningExtraction {
  lotArea: ExtractedField<number> | null;
  far: ExtractedField<number> | null;
  zoningFloorArea: ExtractedField<number> | null;
  proposedFloorArea: ExtractedField<number> | null;
  residFar: ExtractedField<number> | null;
  totalUnits: ExtractedField<number> | null;
  zoneDistrict: ExtractedField<string> | null;
  buildingArea: ExtractedField<number> | null;
  floors: ExtractedField<number> | null;
  bin: ExtractedField<string> | null;
}

export interface ConversionExtraction {
  preExistingArea: ExtractedField<number> | null;
  newArea: ExtractedField<number> | null;
  totalArea: ExtractedField<number> | null;
}

export interface PdfExtraction {
  unitSchedule: UnitScheduleRow[];
  zoningAnalysis: ZoningExtraction;
  conversion: ConversionExtraction | null;
  unitMix?: UnitMixExtraction;
  overallConfidence: number;
  textYield: 'high' | 'low' | 'none';
  needsOcr: boolean;
  pageCount: number;
  rawSnippets: Array<{ page: number; text: string; target: string }>;
}

export interface PdfUpload {
  id: string;
  filename: string;
  storagePath: string;
  fileSize: number;
  status: 'uploaded' | 'extracting' | 'extracted' | 'failed';
  extraction: PdfExtraction | null;
  extractedAt: string | null;
  createdAt: string;
}

export interface PdfUploadResponse {
  fileId: string;
  filename: string;
  status: string;
}

export interface PdfExtractionResponse {
  fileId: string;
  extraction: PdfExtraction;
}

export interface AppliedOverrides {
  lotArea?: number;
  residFar?: number;
  commFar?: number;
  facilFar?: number;
  proposedFloorArea?: number;
  existingBldgArea?: number;
  zoneDist?: string;
  assemblage?: AssemblageConfig;
  totalUnits?: number;
  floors?: number;
  buildingArea?: number;
  maxFar?: number;
}

export interface UnitMixOverrides {
  totalUnits?: number;
  affordableUnits?: number;
  marketUnits?: number;
  studio?: number;
  br1?: number;
  br2?: number;
  br3?: number;
  br4plus?: number;
}

export type DataPointCategory = 'zoning' | 'building' | 'unit_mix';

export interface DataPointEntry {
  key: string;
  label: string;
  category: DataPointCategory;
  unit?: string;
  ruleBasedValue: number | string | null;
  llmValue: number | string | null;
  finalValue: number | string | null;
  confidence: number;
  agreement: boolean | null;
  note: string;
}

export interface DataPointToggle {
  enabled: boolean;
  overrideValue?: number | string;
}

export type DataPointToggleState = Record<string, DataPointToggle>;

export type FarSelectionMode = 'most_restrictive' | 'least_restrictive' | 'manual';

export interface AssemblageLot {
  bbl: string;
  address: string;
  lotArea: number;
  existingBldgArea: number;
  residFar: number;
  commFar: number;
  facilFar: number;
  zoneDist: string;
  isPrimary: boolean;
}

export interface AssemblageConfig {
  lots: AssemblageLot[];
  totalLotArea: number;
  totalExistingBldgArea: number;
  effectiveResidFar: number;
  effectiveCommFar: number;
  effectiveFacilFar: number;
  effectiveZoneDist: string;
  farSelectionMode: FarSelectionMode;
}

export type BedroomType = 'STUDIO' | '1BR' | '2BR' | '3BR' | '4BR_PLUS' | 'UNKNOWN';
export type AllocationKind = 'MARKET' | 'AFFORDABLE' | 'MIH_RESTRICTED' | 'UNKNOWN';
export type ExtractionMethod = 'TEXT_TABLE' | 'TEXT_REGEX' | 'OCR';

export interface UnitRecordSource {
  page: number;
  method: ExtractionMethod;
  evidence: string;
}

export interface UnitRecord {
  unitId?: string;
  floor?: string;
  bedroomType: BedroomType;
  bedroomCount?: number;
  unitTypeCode?: string;
  allocation: AllocationKind;
  amiBand?: number;
  areaSf?: number;
  notes?: string;
  source: UnitRecordSource;
}

export interface UnitMixTotals {
  totalUnits: number;
  byBedroomType: Record<string, number>;
  byAllocation: Record<string, number>;
  byAllocationAndBedroom: Record<string, Record<string, number>>;
  byAmiBand?: Record<string, number>;
}

export interface UnitMixConfidence {
  overall: number;
  byPage: Record<string, number>;
  warnings: string[];
}

export interface UnitMixExtraction {
  unitRecords: UnitRecord[];
  totals: UnitMixTotals;
  confidence: UnitMixConfidence;
}

export interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface PageLine {
  y: number;
  items: PositionedTextItem[];
  text: string;
  page: number;
}

export interface PageTableRow {
  cells: Array<{ text: string; x0: number; x1: number }>;
  rowText: string;
  y: number;
  page: number;
}

export interface DocumentAnalysis {
  pageCount: number;
  textRichScore: number;
  isLikelyScanned: boolean;
  avgCharsPerPage: number;
  candidatePages: number[];
}

export interface OcrPageResult {
  page: number;
  text: string;
  confidence: number;
  lines: string[];
}

export type PipelineStage =
  | 'CACHE_CHECK'
  | 'CLASSIFY'
  | 'CANDIDATE_SCORE'
  | 'TEXT_EXTRACT'
  | 'TABLE_RECON'
  | 'OCR_FALLBACK'
  | 'PARSE_ROWS'
  | 'PLUTO_CHECK'
  | 'SHEET_INDEX'
  | 'RECIPE_RUN'
  | 'LLM_EXTRACT'
  | 'LLM_NORMALIZE'
  | 'VALIDATE'
  | 'DONE';

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  pct: number;
  currentPage?: number;
  totalPages?: number;
}

export interface CandidatePage {
  page: number;
  score: number;
  tags: Array<'schedule' | 'far'>;
}

export interface TableRegion {
  headerRow: PageTableRow;
  dataRows: PageTableRow[];
  page: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface FarExtraction {
  lotAreaSf: number | null;
  zoningFloorAreaSf: number | null;
  proposedFloorAreaSf: number | null;
  proposedFAR: number | null;
  source: UnitRecordSource;
  confidence: number;
}

export interface PlutoCheckResult {
  warnings: string[];
  plutoValues: {
    lotArea?: number;
    residFar?: number;
    bldgArea?: number;
    impliedMaxUnits?: number;
  };
}

export type NormalizationSource = 'llm' | 'llm_extract' | 'local_fallback' | 'none';

export type ExtractionMode = 'llm_primary' | 'local_only' | 'auto';

export interface CoverSheetExtraction {
  lotAreaSf: number | null;
  far: number | null;
  totalUnits: number | null;
  floors: number | null;
  buildingAreaSf: number | null;
  zone: string | null;
  zoningMap: string | null;
  occupancyGroup: string | null;
  constructionClass: string | null;
  scopeOfWork: string | null;
  block: string | null;
  lot: string | null;
  bin: string | null;
}

export interface ExtractedPdfData {
  bbl?: string;
  status: 'complete' | 'partial' | 'cached';
  totals: {
    totalUnits: number;
    affordableUnits: number;
    marketUnits: number;
  };
  unitMix: {
    studio: number;
    br1: number;
    br2: number;
    br3: number;
    br4plus: number;
  };
  unitRecords: UnitRecord[];
  far: FarExtraction | null;
  confidence: {
    overall: number;
    warnings: string[];
  };
  evidence: {
    pagesUsed: number[];
    tablesFound: number;
  };
  extraction: PdfExtraction;
  plutoCheck?: PlutoCheckResult;
  errors: string[];
  fileHash?: string;
  sheetIndex?: SheetIndex;
  normalizedExtract?: NormalizedPlanExtract;
  unitSizes?: {
    byType: Record<string, number[]>;
    avgByType: Record<string, number | null>;
  };
  validationResult?: ValidationResult;
  coverSheet?: CoverSheetExtraction;
  llmExtraction?: LlmExtractedPlanData;
  llmExtractionUsed: boolean;
  ocrProviderUsed?: OcrProvider;
  normalizationSource?: NormalizationSource;
  normalizationReason?: string;
  v2Result?: import('../lib/extractionV2/types').ExtractionV2Result;
  validationGates?: import('../lib/extractionV2/types').ValidationGate[];
  needsManualConfirmation?: boolean;
  redundancyScore?: number;
  llmValidationUsed?: boolean;
  manualOverrides?: Record<string, number | string>;
}

export type OcrProvider = 'none' | 'tesseract_crop' | 'google_document_ai';

export type RecipeType = 'COVER_SHEET' | 'ZONING_SCHEDULE' | 'FLOOR_PLAN_LABEL' | 'OCCUPANT_LOAD' | 'GENERIC';

export interface SheetInfo {
  pageNumber: number;
  drawingNo?: string;
  drawingTitle?: string;
  projectTitle?: string;
  confidence: number;
  method: 'PDF_TEXT' | 'OCR_CROP';
}

export interface SheetIndex {
  pages: SheetInfo[];
  lookup: {
    byDrawingNo: Record<string, number>;
    byTitleKey: Record<string, number[]>;
  };
}

export interface RecipeEvidence {
  field: string;
  page: number;
  method: string;
  snippet: string;
}

export interface RecipeResult {
  recipe: RecipeType;
  pages: number[];
  fields: Record<string, unknown>;
  evidence: RecipeEvidence[];
  confidence: number;
}

export interface NormalizedPlanExtract {
  totals: {
    totalUnits: number | null;
    affordableUnits: number | null;
    marketUnits: number | null;
  };
  unitMix: {
    studio: number | null;
    br1: number | null;
    br2: number | null;
    br3: number | null;
    br4plus: number | null;
  };
  unitSizes: {
    byType: Record<string, number[]>;
    avgByType: Record<string, number | null>;
  };
  zoning: {
    lotAreaSf: number | null;
    zoningFloorAreaSf: number | null;
    far: number | null;
  };
  evidence: RecipeEvidence[];
  confidence: {
    overall: number;
    warnings: string[];
  };
}

export interface CropRegion {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface ValidationResult {
  warnings: string[];
  adjustedConfidence: number;
}

export interface LlmExtractedPlanData {
  totals: {
    totalUnits: number | null;
    affordableUnits: number | null;
    marketUnits: number | null;
  };
  unitMix: {
    studio: number | null;
    br1: number | null;
    br2: number | null;
    br3: number | null;
    br4plus: number | null;
  };
  unitRecords: Array<{
    unitId: string;
    areaSf: number;
    bedroomType: string;
    floor: string | null;
  }>;
  zoning: {
    lotAreaSf: number | null;
    zoningFloorAreaSf: number | null;
    far: number | null;
    zone: string | null;
    maxFar: number | null;
  };
  building: {
    floors: number | null;
    buildingAreaSf: number | null;
    block: string | null;
    lot: string | null;
    bin: string | null;
    occupancyGroup: string | null;
    constructionClass: string | null;
    scopeOfWork: string | null;
  };
  confidence: {
    overall: number;
    warnings: string[];
  };
}

export interface PipelineOptions {
  onProgress?: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
  enableOcr?: boolean;
  maxOcrPages?: number;
  bbl?: string;
  plutoData?: {
    lotarea: number;
    residfar: number;
    bldgarea: number;
  } | null;
  ocrProvider?: OcrProvider;
  enableLlmNormalization?: boolean;
  extractionMode?: ExtractionMode;
  sheetOverrides?: Record<number, RecipeType | 'skip'>;
  forceRefresh?: boolean;
}
