import { GlobalWorkerOptions, getDocument, version } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PositionedTextItem, DocumentAnalysis, CropRegion } from '../../types/pdf';

GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

export interface PdfTextResult {
  text: string;
  pageTexts: string[];
  pageCount: number;
  warnings: string[];
  positionedItems: Map<number, PositionedTextItem[]>;
  documentAnalysis: DocumentAnalysis;
}

const TEXT_RICH_THRESHOLD = 200;
const SCAN_SAMPLE_PAGES = 3;

export async function extractPdfText(file: File): Promise<PdfTextResult> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  let pdf;
  try {
    pdf = await getDocument({ data }).promise;
  } catch (err) {
    const msg = String(err);
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new Error(
        'This PDF appears to be password-protected. Please remove password protection and try again.'
      );
    }
    throw new Error(`PDF processing failed: ${msg}`);
  }

  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];
  const positionedItems = new Map<number, PositionedTextItem[]>();
  let totalChars = 0;

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = '';
      let lastY = -1;
      const items: PositionedTextItem[] = [];

      for (const item of content.items) {
        const textItem = item as TextItem;
        if (!textItem.str) continue;

        const x = textItem.transform?.[4] ?? 0;
        const y = textItem.transform?.[5] ?? 0;
        const w = textItem.width ?? 0;
        const h = textItem.height ?? 0;

        items.push({ str: textItem.str, x, y, width: w, height: h, page: i });

        if (lastY !== -1 && Math.abs(y - lastY) > 2) {
          pageText += '\n';
        }
        pageText += textItem.str;
        lastY = y;
      }

      pageTexts.push(pageText);
      positionedItems.set(i, items);
      totalChars += pageText.length;
    } catch (pageErr) {
      warnings.push(`Could not extract text from page ${i}: ${String(pageErr)}`);
      pageTexts.push('');
      positionedItems.set(i, []);
    }
  }

  const text = pageTexts.join('\n\n');

  const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;
  const sampleSize = Math.min(pageCount, SCAN_SAMPLE_PAGES);
  const sampleEmpty = pageTexts
    .slice(0, sampleSize)
    .filter((t) => t.trim().length < 20).length;
  const isLikelyScanned =
    avgCharsPerPage < TEXT_RICH_THRESHOLD || sampleEmpty >= sampleSize * 0.7;
  const textRichScore = Math.min(1, avgCharsPerPage / 1000);

  const documentAnalysis: DocumentAnalysis = {
    pageCount,
    textRichScore,
    isLikelyScanned,
    avgCharsPerPage,
    candidatePages: [],
  };

  if (text.trim().length === 0) {
    warnings.push(
      'No text could be extracted. This PDF may be image-based (scanned). OCR fallback available.'
    );
  }

  return { text, pageTexts, pageCount, warnings, positionedItems, documentAnalysis };
}

export async function renderPageToCanvas(
  file: File,
  pageNum: number,
  scale: number = 2.0
): Promise<HTMLCanvasElement> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas context');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function renderPageCrop(
  file: File,
  pageNum: number,
  cropRegion: CropRegion,
  scale: number = 2.0
): Promise<HTMLCanvasElement> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1.0 });

  const fullW = baseViewport.width;
  const fullH = baseViewport.height;
  const cropX = (cropRegion.xPct / 100) * fullW * scale;
  const cropY = (cropRegion.yPct / 100) * fullH * scale;
  const cropW = (cropRegion.wPct / 100) * fullW * scale;
  const cropH = (cropRegion.hPct / 100) * fullH * scale;

  const viewport = page.getViewport({ scale, offsetX: -cropX, offsetY: -cropY });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cropW);
  canvas.height = Math.ceil(cropH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas context');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
