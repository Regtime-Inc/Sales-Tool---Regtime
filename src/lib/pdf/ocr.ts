import { createWorker } from 'tesseract.js';
import type { OcrPageResult } from '../../types/pdf';
import { renderPageToCanvas } from './extractPdfText';

export interface OcrProgress {
  page: number;
  totalPages: number;
  status: string;
  progress: number;
}

export interface OcrOptions {
  pages: number[];
  scale?: number;
  onProgress?: (progress: OcrProgress) => void;
  abortSignal?: AbortSignal;
  maxPages?: number;
}

const SCALE_INITIAL = 2.0;
const SCALE_RETRY = 3.0;
const SCALE_MAX = 4.0;
const CONFIDENCE_THRESHOLD = 70;

export async function ocrPages(
  file: File,
  options: OcrOptions
): Promise<OcrPageResult[]> {
  const {
    pages: requestedPages,
    scale = SCALE_INITIAL,
    onProgress,
    abortSignal,
    maxPages = 8,
  } = options;

  const pages = requestedPages.slice(0, maxPages);
  const results: OcrPageResult[] = [];

  if (pages.length === 0) return results;

  const worker = await createWorker('eng');

  try {
    for (let i = 0; i < pages.length; i++) {
      if (abortSignal?.aborted) break;

      const pageNum = pages[i];
      onProgress?.({
        page: pageNum,
        totalPages: pages.length,
        status: `Rendering page ${pageNum}`,
        progress: i / pages.length,
      });

      let canvas: HTMLCanvasElement;
      try {
        canvas = await renderPageToCanvas(file, pageNum, scale);
      } catch {
        results.push({ page: pageNum, text: '', confidence: 0, lines: [] });
        continue;
      }

      if (abortSignal?.aborted) break;

      onProgress?.({
        page: pageNum,
        totalPages: pages.length,
        status: `OCR page ${pageNum}`,
        progress: (i + 0.5) / pages.length,
      });

      try {
        const { data } = await worker.recognize(canvas);
        let bestText = data.text;
        let bestConf = data.confidence;

        if (bestConf < CONFIDENCE_THRESHOLD && scale < SCALE_MAX) {
          if (abortSignal?.aborted) break;

          const retryScale = Math.min(scale * 1.5, SCALE_MAX);
          onProgress?.({
            page: pageNum,
            totalPages: pages.length,
            status: `Re-OCR page ${pageNum} at ${retryScale}x`,
            progress: (i + 0.75) / pages.length,
          });

          try {
            const hiResCanvas = await renderPageToCanvas(file, pageNum, retryScale);
            const hiRes = await worker.recognize(hiResCanvas);
            if (hiRes.data.confidence > bestConf) {
              bestText = hiRes.data.text;
              bestConf = hiRes.data.confidence;
            }

            if (bestConf < CONFIDENCE_THRESHOLD && retryScale < SCALE_MAX) {
              const finalScale = Math.min(retryScale * 1.5, SCALE_MAX);
              if (finalScale > retryScale) {
                const finalCanvas = await renderPageToCanvas(file, pageNum, finalScale);
                const finalRes = await worker.recognize(finalCanvas);
                if (finalRes.data.confidence > bestConf) {
                  bestText = finalRes.data.text;
                  bestConf = finalRes.data.confidence;
                }
              }
            }
          } catch {
            // Keep best result from initial pass
          }
        }

        const lines = bestText
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);

        results.push({
          page: pageNum,
          text: bestText,
          confidence: bestConf / 100,
          lines,
        });
      } catch {
        results.push({ page: pageNum, text: '', confidence: 0, lines: [] });
      }
    }
  } finally {
    await worker.terminate();
  }

  return results;
}

const SCHEDULE_KEYWORDS_OCR = [
  /UNIT\s+SCHEDULE/i,
  /UNIT\s+MIX/i,
  /DWELLING\s+UNIT/i,
  /RESIDENTIAL\s+SCHEDULE/i,
  /APARTMENT.*SCHEDULE/i,
];

export async function detectCandidatePagesViaOcr(
  file: File,
  totalPages: number,
  onProgress?: (progress: OcrProgress) => void,
  abortSignal?: AbortSignal
): Promise<number[]> {
  const maxScan = Math.min(totalPages, 10);
  const pagesToScan = Array.from({ length: maxScan }, (_, i) => i + 1);
  const candidates: number[] = [];

  const worker = await createWorker('eng');

  try {
    for (let i = 0; i < pagesToScan.length; i++) {
      if (abortSignal?.aborted) break;

      const pageNum = pagesToScan[i];
      onProgress?.({
        page: pageNum,
        totalPages: maxScan,
        status: `Quick scan page ${pageNum}`,
        progress: i / maxScan,
      });

      try {
        const canvas = await renderPageToCanvas(file, pageNum, 1.2);
        const { data } = await worker.recognize(canvas);
        for (const kw of SCHEDULE_KEYWORDS_OCR) {
          if (kw.test(data.text)) {
            candidates.push(pageNum);
            break;
          }
        }
      } catch {
        continue;
      }
    }
  } finally {
    await worker.terminate();
  }

  return candidates;
}

export function shouldOcrPage(
  textChars: number,
  headerDetected: boolean,
  tableParseConfidence: number
): boolean {
  if (textChars < 150) return true;
  if (!headerDetected) return true;
  if (tableParseConfidence < 0.55) return true;
  return false;
}
