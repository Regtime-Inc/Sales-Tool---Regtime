import { describe, it, expect, vi } from 'vitest';

vi.mock('../ocr', () => ({
  ocrPages: vi.fn().mockResolvedValue([]),
}));

vi.mock('../extractPdfText', () => ({
  renderPageCrop: vi.fn(),
}));

const { createOcrEngine } = await import('../ocrProvider');

describe('createOcrEngine', () => {
  it('returns a GoogleDocAiEngine with table support for google_document_ai', () => {
    const engine = createOcrEngine('google_document_ai');
    expect(engine.supportsTables).toBe(true);
  });

  it('returns a TesseractCropEngine without table support for tesseract_crop', () => {
    const engine = createOcrEngine('tesseract_crop');
    expect(engine.supportsTables).toBe(false);
  });

  it('returns a NoOpEngine for none', () => {
    const engine = createOcrEngine('none');
    expect(engine.supportsTables).toBe(false);
  });

  it('NoOpEngine.ocrPages returns empty array', async () => {
    const engine = createOcrEngine('none');
    const result = await engine.ocrPages(new File([], 'test.pdf'), [1]);
    expect(result).toEqual([]);
  });

  it('NoOpEngine.ocrCrop returns empty result', async () => {
    const engine = createOcrEngine('none');
    const result = await engine.ocrCrop(
      new File([], 'test.pdf'),
      1,
      { xPct: 0, yPct: 0, wPct: 100, hPct: 100 }
    );
    expect(result).toEqual({ page: 1, text: '', confidence: 0, lines: [] });
  });
});
