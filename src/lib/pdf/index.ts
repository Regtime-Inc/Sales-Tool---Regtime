export { uploadPdf, extractPdf } from './api';
export { buildExtraction, extractUnitSchedule, extractZoningAnalysis, extractConversion, assessTextYield } from './parsers';
export { extractPdfText, renderPageToCanvas } from './extractPdfText';
export { extractUnitMix } from './unitMixExtractor';
export { ocrPages, detectCandidatePagesViaOcr, shouldOcrPage } from './ocr';
export {
  groupItemsIntoLines,
  linesToTableRows,
  detectCandidatePages,
  detectHeaderRow,
  isScheduleCandidatePage,
} from './pageTextLayout';

export { runPipeline } from './pdfPipeline';
export { computeFileHash, getCachedResult, setCachedResult } from './cache';
export { clusterByY, clusterByX, computeYTolerance, computeXGapTolerance } from './layout';
export { detectCandidatePages as detectCandidatePagesScored, scorePage } from './candidates';
export { reconstructTables } from './tableRecon';
export {
  inferColumnMapping,
  parseUnitRow,
  parseUnitRowPositional,
  extractTotalsRow,
  deduplicateRecords,
  computeTotalsFromRecords,
  extractFarFromLines,
} from './unitRowParser';
export { scorePageConfidence, scoreOverallConfidence, generateWarnings } from './confidence';
export { crossCheckWithPluto } from './plutoCheck';
export { indexSheets, filterBottomRegion } from './sheetIndexer';
export { selectRecipes, ZONING_SCHEDULE_RECIPE, FLOOR_PLAN_LABEL_RECIPE, GENERIC_RECIPE } from './recipes';
export { createOcrEngine, detectAvailableProvider } from './ocrProvider';
export type { OcrEngine } from './ocrProvider';
export { validateExtraction } from './validateExtract';
export { renderPageCrop } from './extractPdfText';
