import type {
  V2PipelineOptions,
  V2PipelineProgress,
  ClassifiedTable,
  DocAiTable,
  UnitCountMention,
} from './types';
import type { ExtractedPdfData } from '../../types/pdf';
import { extractPageTexts } from './pdfText';
import { checkDocAiAvailable, fetchDocAiLayout } from './docaiLayout';
import { classifyDocAiTables, classifyRawTables } from './tableClassifier';
import { extractCoverSheetSignals, collectUnitCountMentions } from './signals/coverSheet';
import { extractZoningSignals, collectZoningUnitMentions } from './signals/zoningAnalysis';
import { extractUnitCountsFromTables } from './signals/unitCountsFromTables';
import { resolveExtraction } from './resolve';
import { toExtractedPdfData } from './types';
import { reconstructTables } from '../pdf/tableRecon';
import { crossCheckWithPluto } from '../pdf/plutoCheck';
import { computeFileHash, getCachedResult, setCachedResult } from '../pdf/cache';
import { classifyPages } from './pageRelevance';
import { applyValidationGates } from './validationGates';
import { postProcessOcrText } from './ocrPostProcess';
import { runLlmValidation } from './llmValidation';
import { reconcileLlmWithRuleBased } from './llmReconcile';

function emit(options: V2PipelineOptions, progress: V2PipelineProgress) {
  options.onProgress?.(progress);
}

function aborted(options: V2PipelineOptions): boolean {
  return options.signal?.aborted === true;
}

export async function runPipelineV2(
  files: File[],
  options: V2PipelineOptions = {},
): Promise<ExtractedPdfData> {
  const file = files[0];
  if (!file) {
    return emptyResult();
  }

  let fileHash: string | undefined;
  try {
    fileHash = await computeFileHash(file);
    const cached = await getCachedResult(fileHash);
    if (cached && cached.validationGates !== undefined) {
      emit(options, { stage: 'DONE', message: 'Loaded from cache', pct: 100 });
      return { ...cached, status: 'cached' as const };
    }
  } catch {
    // non-fatal
  }

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'TEXT_EXTRACT', message: 'Extracting text from PDF', pct: 5 });
  const { pages, raw } = await extractPageTexts(file);

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'OCR_DETECT', message: 'Detecting scanned pages', pct: 18 });
  const scannedPages = pages.filter((p) => p.isLikelyScanned).map((p) => p.pageIndex);
  let ocrUsed = false;

  const allClassifiedTables: ClassifiedTable[] = [];
  const docAiTables: DocAiTable[] = [];

  if (scannedPages.length > 0) {
    emit(options, { stage: 'DOCAI_FETCH', message: 'Running cloud OCR on scanned pages', pct: 24 });

    try {
      const available = await checkDocAiAvailable();
      if (available) {
        const pagesToOcr = scannedPages.slice(0, 20);
        const layout = await fetchDocAiLayout(file, pagesToOcr);
        ocrUsed = true;

        for (const ocrPage of layout.pages) {
          const existing = pages.find((p) => p.pageIndex === ocrPage.pageIndex);
          if (existing && existing.charCount < ocrPage.text.length) {
            existing.text = postProcessOcrText(ocrPage.text);
            existing.charCount = existing.text.length;
            existing.isLikelyScanned = false;
          }
        }

        docAiTables.push(...layout.tables);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'no_provider') {
        console.warn('[PipelineV2] Google Doc AI not configured – skipping cloud OCR');
      } else {
        console.warn('[PipelineV2] Doc AI OCR failed, proceeding with text-only:', msg);
      }
    }
  }

  const lowKeywordPages = pages.filter((p) => {
    if (p.isLikelyScanned) return false;
    if (p.charCount < 200) return false;
    const upper = p.text.toUpperCase();
    const keywords = ['UNIT', 'FAR', 'LOT AREA', 'DWELLING', 'ZONING', 'FLOOR AREA'];
    const hits = keywords.filter((kw) => upper.includes(kw)).length;
    return hits < 2;
  });

  if (!ocrUsed && lowKeywordPages.length > 0 && lowKeywordPages.length <= pages.length * 0.5) {
    try {
      const available = await checkDocAiAvailable();
      if (available) {
        const toOcr = lowKeywordPages.slice(0, 5).map((p) => p.pageIndex);
        const layout = await fetchDocAiLayout(file, toOcr);
        ocrUsed = true;
        for (const ocrPage of layout.pages) {
          const existing = pages.find((p) => p.pageIndex === ocrPage.pageIndex);
          if (existing && ocrPage.text.length > existing.charCount) {
            existing.text = postProcessOcrText(ocrPage.text);
            existing.charCount = existing.text.length;
          }
        }
        docAiTables.push(...layout.tables);
      }
    } catch (err) {
      console.warn('[PipelineV2] Secondary Doc AI OCR attempt failed:', err instanceof Error ? err.message : String(err));
    }
  }

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'TABLE_CLASSIFY', message: 'Classifying tables', pct: 45 });

  if (docAiTables.length > 0) {
    allClassifiedTables.push(...classifyDocAiTables(docAiTables));
  }

  const nativeTextTables: Array<{
    pageIndex: number;
    tableIndex: number;
    headers: string[];
    rows: string[][];
  }> = [];

  for (const [pageNum, items] of raw.positionedItems) {
    if (items.length === 0) continue;
    const reconTables = reconstructTables(items, pageNum);
    for (let ti = 0; ti < reconTables.length; ti++) {
      const rt = reconTables[ti];
      nativeTextTables.push({
        pageIndex: pageNum,
        tableIndex: allClassifiedTables.length + ti,
        headers: rt.headerRow.cells.map((c) => c.text),
        rows: rt.dataRows.map((dr) => dr.cells.map((c) => c.text)),
      });
    }
  }

  if (nativeTextTables.length > 0) {
    allClassifiedTables.push(...classifyRawTables(nativeTextTables));
  }

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'SIGNAL_EXTRACT', message: 'Extracting signals', pct: 55 });

  const coverSheetSignals = extractCoverSheetSignals(pages);
  const zoningSignals = extractZoningSignals(pages);
  const tableSignals = extractUnitCountsFromTables(allClassifiedTables);

  const coverMentions = collectUnitCountMentions(pages, 'cover_sheet');
  const zoningMentions = collectZoningUnitMentions(pages);
  const tableMention: UnitCountMention[] = tableSignals.totalUnits
    ? [{
        value: tableSignals.totalUnits.value,
        page: tableSignals.totalUnits.evidence[0]?.page ?? -1,
        sourceType: 'unit_schedule_table',
        snippet: `Table-derived unit count: ${tableSignals.totalUnits.value}`,
        confidence: tableSignals.totalUnits.confidence,
      }]
    : [];

  const allMentions = deduplicateMentions([...coverMentions, ...zoningMentions, ...tableMention]);

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'RESOLVE', message: 'Resolving extraction', pct: 65 });

  const v2Result = resolveExtraction(
    coverSheetSignals,
    zoningSignals,
    tableSignals,
    allClassifiedTables,
    ocrUsed,
    allMentions,
  );

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'VALIDATE_GATES', message: 'Validating against city data', pct: 72 });

  const pageRelevance = classifyPages(pages);
  v2Result.pageRelevance = pageRelevance;

  const zoneDist = options.zoneDist
    ?? v2Result.zoning.zone?.value
    ?? null;

  const { gates } = applyValidationGates(v2Result, options.plutoData, zoneDist);
  v2Result.validationGates = gates;

  if (aborted(options)) return emptyResult();

  emit(options, { stage: 'ADAPT', message: 'Finalizing results', pct: 88 });

  const result = toExtractedPdfData(v2Result, raw.pageCount, fileHash);

  if (options.plutoData) {
    result.plutoCheck = crossCheckWithPluto(result, options.plutoData);
    result.confidence.warnings.push(...result.plutoCheck.warnings);
  }

  if (options.bbl) {
    result.bbl = options.bbl;
  }

  if (fileHash) {
    try {
      await setCachedResult(fileHash, result);
    } catch {
      // non-fatal
    }
  }

  emit(options, { stage: 'DONE', message: 'Complete', pct: 100 });
  return result;
}

export async function runLlmValidationPass(
  result: ExtractedPdfData,
  pages: { pageIndex: number; text: string; charCount: number; isLikelyScanned: boolean }[],
  options: V2PipelineOptions = {},
): Promise<ExtractedPdfData> {
  const v2 = result.v2Result;
  if (!v2) return result;

  const pageRelevance = v2.pageRelevance.length > 0 ? v2.pageRelevance : classifyPages(pages);

  const llmResult = await runLlmValidation({
    v2Result: v2,
    pages,
    pageRelevance,
    plutoData: options.plutoData,
    zoneDist: options.zoneDist ?? v2.zoning.zone?.value ?? null,
    signal: options.signal,
  });

  if (!llmResult.extraction) {
    return {
      ...result,
      llmExtractionUsed: false,
    };
  }

  const { reconciliation, updatedMentions } = reconcileLlmWithRuleBased(
    v2,
    llmResult.extraction,
    options.plutoData,
  );

  v2.llmReconciliation = reconciliation;
  v2.unitCountMentions = updatedMentions;

  for (const rec of reconciliation) {
    if (rec.field === 'totalUnits' && v2.totalUnits && rec.agreement) {
      v2.totalUnits.confidence = Math.min(1, rec.finalConfidence);
    }
  }

  const zoneDist = options.zoneDist ?? v2.zoning.zone?.value ?? null;
  const { gates } = applyValidationGates(v2, options.plutoData, zoneDist);
  v2.validationGates = gates;

  const updated = toExtractedPdfData(v2, result.extraction.pageCount, result.fileHash);
  updated.llmExtraction = llmResult.extraction;
  updated.bbl = result.bbl;
  updated.plutoCheck = result.plutoCheck;

  if (result.plutoCheck) {
    updated.confidence.warnings.push(...result.plutoCheck.warnings);
  }

  return updated;
}

function deduplicateMentions(mentions: UnitCountMention[]): UnitCountMention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.sourceType}-${m.page}-${m.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyResult(): ExtractedPdfData {
  return {
    status: 'partial',
    totals: { totalUnits: 0, affordableUnits: 0, marketUnits: 0 },
    unitMix: { studio: 0, br1: 0, br2: 0, br3: 0, br4plus: 0 },
    unitRecords: [],
    far: null,
    confidence: { overall: 0, warnings: ['No PDF file provided or extraction was cancelled.'] },
    evidence: { pagesUsed: [], tablesFound: 0 },
    extraction: {
      unitSchedule: [],
      zoningAnalysis: {
        lotArea: null, far: null, zoningFloorArea: null, proposedFloorArea: null,
        residFar: null, totalUnits: null, zoneDistrict: null, buildingArea: null,
        floors: null, bin: null,
      },
      conversion: null,
      overallConfidence: 0,
      textYield: 'none',
      needsOcr: true,
      pageCount: 0,
      rawSnippets: [],
    },
    errors: [],
    llmExtractionUsed: false,
    ocrProviderUsed: 'none',
    normalizationSource: 'none',
  };
}
