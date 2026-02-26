import type { OcrPageResult, OcrProvider, CropRegion } from '../../types/pdf';
import { ocrPages } from './ocr';
import { renderPageCrop } from './extractPdfText';

export interface OcrEngine {
  ocrPages(file: File, pages: number[]): Promise<OcrPageResult[]>;
  ocrCrop(file: File, page: number, region: CropRegion): Promise<OcrPageResult>;
  supportsTables: boolean;
}

class NoOpEngine implements OcrEngine {
  supportsTables = false;
  async ocrPages(): Promise<OcrPageResult[]> {
    return [];
  }
  async ocrCrop(_file: File, page: number): Promise<OcrPageResult> {
    return { page, text: '', confidence: 0, lines: [] };
  }
}

class TesseractCropEngine implements OcrEngine {
  supportsTables = false;

  async ocrPages(file: File, pages: number[]): Promise<OcrPageResult[]> {
    return ocrPages(file, { pages, scale: 2.0, maxPages: pages.length });
  }

  async ocrCrop(file: File, page: number, region: CropRegion): Promise<OcrPageResult> {
    const canvas = await renderPageCrop(file, page, region, 2.0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const tempFile = new File([blob], `crop_p${page}.png`, { type: 'image/png' });
    const results = await ocrPages(tempFile, { pages: [1], scale: 1.0, maxPages: 1 });
    if (results.length > 0) {
      return { ...results[0], page };
    }
    return { page, text: '', confidence: 0, lines: [] };
  }
}

class GoogleDocAiEngine implements OcrEngine {
  supportsTables = true;

  async ocrPages(file: File, pages: number[]): Promise<OcrPageResult[]> {
    const bytes = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(bytes).reduce((s, b) => s + String.fromCharCode(b), '')
    );

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-ocr`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileBase64: base64, pages }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Cloud OCR failed: ${resp.status}`);
    }

    const data = await resp.json();
    return (data.pages || []) as OcrPageResult[];
  }

  async ocrCrop(file: File, page: number, region: CropRegion): Promise<OcrPageResult> {
    const bytes = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(bytes).reduce((s, b) => s + String.fromCharCode(b), '')
    );

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-ocr`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileBase64: base64,
        pages: [page],
        cropRegions: [{ page, region }],
      }),
    });

    if (!resp.ok) {
      return { page, text: '', confidence: 0, lines: [] };
    }

    const data = await resp.json();
    return (data.pages?.[0]) || { page, text: '', confidence: 0, lines: [] };
  }
}

export function createOcrEngine(provider: OcrProvider): OcrEngine {
  switch (provider) {
    case 'google_document_ai':
      return new GoogleDocAiEngine();
    case 'tesseract_crop':
      return new TesseractCropEngine();
    default:
      return new NoOpEngine();
  }
}

export async function detectAvailableProvider(): Promise<OcrProvider> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-ocr?check=1`;
    const resp = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.available) return 'google_document_ai';
    }
  } catch {
    // Fall through to tesseract
  }
  return 'tesseract_crop';
}
