import { extractPdfText } from '../pdf/extractPdfText';
import type { PdfTextResult } from '../pdf/extractPdfText';
import type { PageText } from './types';

const SCANNED_CHAR_THRESHOLD = 100;
const PRINTABLE_RATIO_THRESHOLD = 0.5;

function computePrintableRatio(text: string): number {
  if (text.length === 0) return 0;
  const printable = text.replace(/[^a-zA-Z0-9.,;:!?()[\]{}\-+=/\\@#$%&*'"<> ]/g, '');
  return printable.length / text.length;
}

export interface PdfTextExtractionResult {
  pages: PageText[];
  raw: PdfTextResult;
}

export async function extractPageTexts(file: File): Promise<PdfTextExtractionResult> {
  const raw = await extractPdfText(file);
  const pages: PageText[] = [];

  for (let i = 0; i < raw.pageTexts.length; i++) {
    const text = raw.pageTexts[i];
    const charCount = text.length;
    const printableRatio = computePrintableRatio(text);
    const isLikelyScanned =
      charCount < SCANNED_CHAR_THRESHOLD || printableRatio < PRINTABLE_RATIO_THRESHOLD;

    pages.push({
      pageIndex: i + 1,
      text,
      charCount,
      isLikelyScanned,
    });
  }

  return { pages, raw };
}
