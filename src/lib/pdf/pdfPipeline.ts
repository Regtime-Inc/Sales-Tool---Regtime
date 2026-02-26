import type {
  PipelineOptions,
  PipelineProgress,
  ExtractedPdfData,
  PdfExtraction,
  UnitRecord,
  FarExtraction,
  TableRegion,
  PageLine,
  SheetIndex,
  RecipeResult,
  RecipeType,
  NormalizedPlanExtract,
  NormalizationSource,
  ValidationResult,
  OcrProvider,
  LlmExtractedPlanData,
  CoverSheetExtraction,
  BedroomType,
} from '../../types/pdf';
import { extractPdfText } from './extractPdfText';
import type { PdfTextResult } from './extractPdfText';
import { buildExtraction } from './parsers';
import { clusterByY } from './layout';
import { detectCandidatePages } from './candidates';
import { reconstructTables } from './tableRecon';
import {
  inferColumnMapping,
  parseUnitRow,
  parseUnitRowPositional,
  extractTotalsRow,
  deduplicateRecords,
  computeTotalsFromRecords,
  extractFarFromLines,
} from './unitRowParser';
import {
  scorePageConfidence,
  scoreOverallConfidence,
  generateWarnings,
} from './confidence';
import { computeFileHash, getCachedResult, setCachedResult, removeCachedResult } from './cache';
import { shouldOcrPage } from './ocr';
import { crossCheckWithPluto } from './plutoCheck';
import { extractUnitMix } from './unitMixExtractor';
import { indexSheets } from './sheetIndexer';
import { selectRecipes } from './recipes';
import type { RecipeParams } from './recipes';
import { validateExtraction } from './validateExtract';
import { normalizePlanExtract } from '../ai/normalizePlanExtract';
import { llmExtractFromPages } from '../ai/llmExtractFromPages';
import { createOcrEngine, detectAvailableProvider } from './ocrProvider';
import { applyBedroomInference } from './bedroomInfer';

function emit(
  options: PipelineOptions,
  progress: Omit<PipelineProgress, 'pct'> & { pct: number }
) {
  options.onProgress?.(progress as PipelineProgress);
}

function aborted(options: PipelineOptions): boolean {
  return options.signal?.aborted === true;
}

export async function runPipeline(
  files: File[],
  options: PipelineOptions = {}
): Promise<ExtractedPdfData> {
  const errors: string[] = [];
  const allRecords: UnitRecord[] = [];
  const allTables: TableRegion[] = [];
  const pagesUsed = new Set<number>();
  let far: FarExtraction | null = null;
  let ocrUsed = false;
  let bestExtraction: PdfExtraction | null = null;
  const pageConfScores: Array<{ page: number; score: number; weight: number }> = [];
  let sheetIndex: SheetIndex | undefined;
  let recipeResults: RecipeResult[] = [];
  let normalizedExtract: NormalizedPlanExtract | undefined;
  let validationResult: ValidationResult | undefined;
  let normalizationSource: NormalizationSource = 'none';
  let normalizationReason: string | undefined;
  let llmExtraction: LlmExtractedPlanData | undefined;
  let llmExtractionUsed = false;
  let coverSheet: CoverSheetExtraction | undefined;
  const recipeTypeMap = new Map<number, RecipeType>();

  let resolvedProvider: OcrProvider = options.ocrProvider ?? 'none';
  if (!options.ocrProvider || options.ocrProvider === 'none') {
    try {
      resolvedProvider = await detectAvailableProvider();
    } catch {
      resolvedProvider = 'tesseract_crop';
    }
  }
  const ocrEngine = createOcrEngine(resolvedProvider);

  for (const file of files) {
    if (aborted(options)) break;

    emit(options, { stage: 'CACHE_CHECK', message: 'Checking cache', pct: 0 });
    let fileHash: string | undefined;
    try {
      fileHash = await computeFileHash(file);
      if (options.forceRefresh) {
        await removeCachedResult(fileHash);
      } else {
        const cached = await getCachedResult(fileHash);
        if (cached) {
          return cached;
        }
      }
    } catch {
      // non-fatal
    }

    if (aborted(options)) break;

    emit(options, { stage: 'CLASSIFY', message: 'Loading PDF', pct: 5 });
    let pdfResult: PdfTextResult;
    try {
      pdfResult = await extractPdfText(file);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'PDF load failed');
      continue;
    }

    const legacyExtraction = buildExtraction(
      pdfResult.text,
      pdfResult.pageTexts,
      pdfResult.pageCount,
      pdfResult.positionedItems
    );
    if (!bestExtraction || legacyExtraction.overallConfidence > bestExtraction.overallConfidence) {
      bestExtraction = legacyExtraction;
    }

    if (aborted(options)) break;

    emit(options, { stage: 'CANDIDATE_SCORE', message: 'Scoring pages', pct: 12 });
    const pageLines = new Map<number, PageLine[]>();
    for (const [page, items] of pdfResult.positionedItems) {
      if (items.length > 0) {
        pageLines.set(page, clusterByY(items, page));
      }
    }

    const candidates = detectCandidatePages(pageLines);

    if (aborted(options)) break;

    // --- Sheet Indexing ---
    emit(options, { stage: 'SHEET_INDEX', message: 'Indexing sheets', pct: 18 });
    sheetIndex = indexSheets(pdfResult.positionedItems, pdfResult.pageCount);

    const hasDrawingInfo = sheetIndex.pages.some((s) => s.confidence >= 0.5);

    if (aborted(options)) break;

    // --- Recipe Path (for architectural plans with drawing info) ---
    if (hasDrawingInfo) {
      emit(options, { stage: 'RECIPE_RUN', message: 'Running extraction recipes', pct: 25 });
      const recipePairs = selectRecipes(sheetIndex, options.sheetOverrides);

      for (let ri = 0; ri < recipePairs.length; ri++) {
        if (aborted(options)) break;
        const { recipe, pages } = recipePairs[ri];
        emit(options, {
          stage: 'RECIPE_RUN',
          message: `${recipe.type} on page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`,
          pct: 25 + ((ri + 1) / recipePairs.length) * 20,
        });

        const params: RecipeParams = {
          pages,
          positionedItems: pdfResult.positionedItems,
          pageTexts: pdfResult.pageTexts,
          pageLines,
        };

        try {
          const result = await recipe.extract(params);
          recipeResults.push(result);
          for (const p of pages) pagesUsed.add(p);
        } catch (e) {
          errors.push(`Recipe ${recipe.type} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    for (const result of recipeResults) {
      const recipeUnitRecords = (result.fields as Record<string, unknown>).unitRecords;
      if (Array.isArray(recipeUnitRecords)) {
        allRecords.push(...(recipeUnitRecords as UnitRecord[]));
      }
      if (result.recipe === 'COVER_SHEET') {
        const cs = (result.fields as Record<string, unknown>).coverSheet;
        if (cs) coverSheet = cs as CoverSheetExtraction;
      }
      for (const p of result.pages) {
        recipeTypeMap.set(p, result.recipe);
      }
    }

    if (aborted(options)) break;

    // --- LLM Primary Extraction ---
    const mode = options.extractionMode ?? 'auto';
    if (mode !== 'local_only') {
      emit(options, { stage: 'LLM_EXTRACT', message: 'Running AI extraction', pct: 47 });
      try {
        const llmResult = await llmExtractFromPages(
          pdfResult.pageTexts,
          sheetIndex,
          recipeTypeMap,
          { signal: options.signal }
        );
        if (llmResult.success && llmResult.extraction) {
          llmExtraction = llmResult.extraction;
          llmExtractionUsed = true;
          const llmRecords = convertLlmRecords(llmResult.extraction);
          if (llmRecords.length > allRecords.length) {
            allRecords.length = 0;
            allRecords.push(...llmRecords);
          }
        } else if (llmResult.fallbackReason) {
          errors.push(`LLM extraction skipped: ${llmResult.fallbackReason}`);
        }
      } catch (e) {
        if (!aborted(options)) {
          errors.push(`LLM extraction failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (aborted(options)) break;

    // --- Generic Candidate Path (fallback or supplement) ---
    emit(options, { stage: 'TEXT_EXTRACT', message: 'Extracting text', pct: 48 });
    const ocrCandidates: number[] = [];
    const candidatePageNums = candidates.map((c) => c.page);

    for (const candidate of candidates) {
      if (aborted(options)) break;

      const pageNum = candidate.page;
      const items = pdfResult.positionedItems.get(pageNum) || [];
      const lines = pageLines.get(pageNum) || [];
      const pageText = pdfResult.pageTexts[pageNum - 1] || '';

      emit(options, {
        stage: 'TABLE_RECON',
        message: `Parsing page ${pageNum}`,
        pct: 48 + (candidatePageNums.indexOf(pageNum) / Math.max(candidatePageNums.length, 1)) * 12,
        currentPage: pageNum,
        totalPages: candidatePageNums.length,
      });

      const tables = reconstructTables(items, pageNum);
      allTables.push(...tables);

      let pageRecords: UnitRecord[] = [];
      let headerDetected = false;
      let headerMappedColumns = 0;

      for (const table of tables) {
        const mapping = inferColumnMapping(table.headerRow.cells);
        const mappedCount = Object.keys(mapping).filter(
          (k) => mapping[k as keyof typeof mapping] !== undefined
        ).length;
        headerDetected = true;
        headerMappedColumns = Math.max(headerMappedColumns, mappedCount);
        for (const row of table.dataRows) {
          const record = parseUnitRow(row.cells, mapping, pageNum, 'TEXT_TABLE');
          if (record) pageRecords.push(record);
        }
      }

      if (pageRecords.length === 0 && lines.length > 0) {
        for (const line of lines) {
          const record = parseUnitRowPositional(line.text, pageNum, 'TEXT_REGEX');
          if (record) pageRecords.push(record);
        }
      }

      if (candidate.tags.includes('far') && !far) {
        far = extractFarFromLines(lines, pageNum);
      }

      const allRows = tables.flatMap((t) => [t.headerRow, ...t.dataRows]);
      const totalsRow = extractTotalsRow(allRows);
      const totalRowConsistent = totalsRow
        ? Math.abs(totalsRow.totalUnits - pageRecords.length) <= 2
        : false;

      const pageConf = scorePageConfidence({
        page: pageNum,
        headerMappedColumns,
        totalRowFound: !!totalsRow,
        totalRowConsistent,
        unitRowCount: pageRecords.length,
        ocrUsed: false,
        ocrConfidence: 0,
        totalsConflict: false,
      });

      pageConfScores.push({
        page: pageNum,
        score: pageConf,
        weight: pageRecords.length > 0 ? pageRecords.length : 1,
      });

      if (
        options.enableOcr !== false &&
        shouldOcrPage(pageText.length, headerDetected, pageConf)
      ) {
        ocrCandidates.push(pageNum);
      }

      allRecords.push(...pageRecords);
      if (pageRecords.length > 0) pagesUsed.add(pageNum);
    }

    if (aborted(options)) break;

    // --- OCR Fallback ---
    if (ocrCandidates.length > 0 && options.enableOcr !== false) {
      const providerLabel = resolvedProvider === 'google_document_ai' ? 'Cloud OCR' : 'OCR';
      emit(options, { stage: 'OCR_FALLBACK', message: `Running ${providerLabel}`, pct: 62 });
      ocrUsed = true;

      try {
        const pagesToOcr = ocrCandidates.slice(0, options.maxOcrPages ?? 8);
        const ocrResults = await ocrEngine.ocrPages(file, pagesToOcr);

        for (const ocrPage of ocrResults) {
          if (ocrPage.text.trim().length === 0) continue;
          const ocrLines = ocrPage.lines.filter((l) => l.trim().length > 3);
          for (const line of ocrLines) {
            const record = parseUnitRowPositional(line, ocrPage.page, 'OCR');
            if (record) allRecords.push(record);
          }
          pagesUsed.add(ocrPage.page);
        }

        if (ocrResults.length > 0) {
          const ocrUnitMix = extractUnitMix(
            pdfResult.positionedItems,
            pdfResult.pageTexts,
            ocrResults
          );
          if (ocrUnitMix.unitRecords.length > allRecords.length) {
            allRecords.length = 0;
            allRecords.push(...ocrUnitMix.unitRecords);
          }
        }
      } catch (e) {
        if (!aborted(options)) {
          errors.push(e instanceof Error ? e.message : 'OCR failed');
        }
      }
    }

    if (aborted(options)) break;

    // --- LLM Normalization ---
    if (recipeResults.length > 0 && options.enableLlmNormalization !== false) {
      emit(options, { stage: 'LLM_NORMALIZE', message: 'Normalizing extracted data', pct: 75 });
      try {
        const normalizeResult = await normalizePlanExtract(recipeResults, {
          signal: options.signal,
        });
        normalizedExtract = normalizeResult.extract;
        normalizationSource = normalizeResult.source;
        normalizationReason = normalizeResult.fallbackReason;
      } catch (e) {
        if (!aborted(options)) {
          errors.push(`Normalization failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (aborted(options)) break;

    // --- Validation ---
    if (normalizedExtract) {
      emit(options, { stage: 'VALIDATE', message: 'Validating extraction', pct: 82 });
      validationResult = validateExtraction(normalizedExtract, options.plutoData);
      if (validationResult.warnings.length > 0) {
        normalizedExtract = {
          ...normalizedExtract,
          confidence: {
            ...normalizedExtract.confidence,
            overall: validationResult.adjustedConfidence,
            warnings: [
              ...normalizedExtract.confidence.warnings,
              ...validationResult.warnings,
            ],
          },
        };
      }
    }

    emit(options, { stage: 'PARSE_ROWS', message: 'Finalizing unit records', pct: 85 });

    if (allRecords.length === 0 && bestExtraction?.unitMix) {
      allRecords.push(...bestExtraction.unitMix.unitRecords);
    }

    if (fileHash && allRecords.length > 0) {
      const result = buildResult(
        allRecords, allTables, far, ocrUsed, pagesUsed,
        pageConfScores, bestExtraction!, errors, fileHash, options,
        sheetIndex, normalizedExtract, validationResult,
        resolvedProvider, normalizationSource, normalizationReason,
        llmExtraction, llmExtractionUsed, coverSheet
      );
      try {
        await setCachedResult(fileHash, result);
      } catch {
        // non-fatal
      }
    }
  }

  emit(options, { stage: 'PLUTO_CHECK', message: 'Running cross-checks', pct: 92 });

  const result = buildResult(
    allRecords, allTables, far, ocrUsed, pagesUsed,
    pageConfScores, bestExtraction ?? emptyExtraction(), errors, undefined, options,
    sheetIndex, normalizedExtract, validationResult,
    resolvedProvider, normalizationSource, normalizationReason,
    llmExtraction, llmExtractionUsed, coverSheet
  );

  emit(options, { stage: 'DONE', message: 'Complete', pct: 100 });
  return result;
}

function mapLlmBedroomType(raw: string): BedroomType {
  const u = raw.toUpperCase().replace(/[- ]/g, '');
  if (u.includes('STUDIO') || u === 'S') return 'STUDIO';
  if (u === '1BR' || u.includes('ONEBEDROOM')) return '1BR';
  if (u === '2BR' || u.includes('TWOBEDROOM')) return '2BR';
  if (u === '3BR' || u.includes('THREEBEDROOM')) return '3BR';
  if (u === '4BR' || u === '4BRPLUS' || u === '4BR_PLUS' || u.includes('FOURBEDROOM')) return '4BR_PLUS';
  return 'UNKNOWN';
}

function convertLlmRecords(llmData: LlmExtractedPlanData): UnitRecord[] {
  return llmData.unitRecords.map((r) => ({
    unitId: r.unitId,
    floor: r.floor ?? undefined,
    bedroomType: mapLlmBedroomType(r.bedroomType),
    allocation: 'UNKNOWN',
    areaSf: r.areaSf,
    source: {
      page: 0,
      method: 'TEXT_REGEX' as const,
      evidence: `LLM: ${r.unitId} ${r.areaSf}SF ${r.bedroomType}`,
    },
  }));
}

function buildResult(
  allRecords: UnitRecord[],
  allTables: TableRegion[],
  far: FarExtraction | null,
  ocrUsed: boolean,
  pagesUsed: Set<number>,
  pageConfScores: Array<{ page: number; score: number; weight: number }>,
  extraction: PdfExtraction,
  errors: string[],
  fileHash: string | undefined,
  options: PipelineOptions,
  sheetIndex?: SheetIndex,
  normalizedExtract?: NormalizedPlanExtract,
  validationResult?: ValidationResult,
  ocrProviderUsed?: OcrProvider,
  normSource?: NormalizationSource,
  normReason?: string,
  llmExtr?: LlmExtractedPlanData,
  llmUsed?: boolean,
  coverSh?: CoverSheetExtraction,
): ExtractedPdfData {
  const dedupedRaw = deduplicateRecords(allRecords);

  const zoneDistrict = extraction.zoningAnalysis.zoneDistrict?.value as string | undefined;
  const { records: deduped, inferredCount } = applyBedroomInference(dedupedRaw, zoneDistrict);
  if (inferredCount > 0) {
    errors.push(`${inferredCount} unit bedroom types inferred from area; verify manually`);
  }

  const totals = computeTotalsFromRecords(deduped);

  const affordableUnits = deduped.filter(
    (r) => r.allocation === 'AFFORDABLE' || r.allocation === 'MIH_RESTRICTED'
  ).length;
  const marketUnits = deduped.filter((r) => r.allocation === 'MARKET').length;

  const overall = pageConfScores.length > 0
    ? scoreOverallConfidence(pageConfScores)
    : extraction.overallConfidence;

  const totalsConflict = false;
  const warnings = generateWarnings(deduped, allTables, totalsConflict, ocrUsed, !!far);

  const result: ExtractedPdfData = {
    status: errors.length > 0 ? 'partial' : 'complete',
    totals: {
      totalUnits: totals.totalUnits,
      affordableUnits,
      marketUnits,
    },
    unitMix: {
      studio: totals.byBedroomType['STUDIO'] || 0,
      br1: totals.byBedroomType['1BR'] || 0,
      br2: totals.byBedroomType['2BR'] || 0,
      br3: totals.byBedroomType['3BR'] || 0,
      br4plus: totals.byBedroomType['4BR_PLUS'] || 0,
    },
    unitRecords: deduped,
    far,
    confidence: { overall, warnings },
    evidence: {
      pagesUsed: Array.from(pagesUsed).sort((a, b) => a - b),
      tablesFound: allTables.length,
    },
    extraction: {
      ...extraction,
      unitMix: {
        unitRecords: deduped,
        totals,
        confidence: {
          overall,
          byPage: Object.fromEntries(
            pageConfScores.map((p) => [String(p.page), p.score])
          ),
          warnings,
        },
      },
    },
    errors,
    fileHash,
    sheetIndex,
    normalizedExtract,
    validationResult,
    ocrProviderUsed: ocrProviderUsed ?? 'none',
    normalizationSource: normSource ?? 'none',
    normalizationReason: normReason,
    llmExtractionUsed: llmUsed ?? false,
    llmExtraction: llmExtr,
    coverSheet: coverSh,
  };

  if (normalizedExtract?.unitSizes) {
    result.unitSizes = normalizedExtract.unitSizes;
  }

  if (options.plutoData) {
    result.plutoCheck = crossCheckWithPluto(result, options.plutoData);
    result.confidence.warnings.push(...result.plutoCheck.warnings);
  }

  if (options.bbl) {
    result.bbl = options.bbl;
  }

  return result;
}

function emptyExtraction(): PdfExtraction {
  return {
    unitSchedule: [],
    zoningAnalysis: {
      lotArea: null,
      far: null,
      zoningFloorArea: null,
      proposedFloorArea: null,
      residFar: null,
      totalUnits: null,
      zoneDistrict: null,
      buildingArea: null,
      floors: null,
      bin: null,
    },
    conversion: null,
    overallConfidence: 0,
    textYield: 'none',
    needsOcr: true,
    pageCount: 0,
    rawSnippets: [],
  };
}
