import { describe, it, expect } from 'vitest';
import { scorePageRelevance, classifyPages, getRelevantPagesForLlm } from '../pageRelevance';
import type { PageText } from '../types';

function makePage(pageIndex: number, text: string): PageText {
  return { pageIndex, text, charCount: text.length, isLikelyScanned: false };
}

describe('scorePageRelevance', () => {
  it('scores cover sheet page highly', () => {
    const page = makePage(0, 'COVER SHEET\nPROJECT INFORMATION\nSCOPE OF WORK\nPROPOSED 14-UNIT DWELLING');
    const { score, categories } = scorePageRelevance(page);
    expect(score).toBeGreaterThanOrEqual(10);
    expect(categories.get('COVER_SHEET')).toBeGreaterThan(0);
  });

  it('scores zoning page', () => {
    const page = makePage(1, 'ZONING ANALYSIS\nFLOOR AREA RATIO 4.0\nLOT AREA 5,000 SF\nPERMITTED FAR');
    const { score, categories } = scorePageRelevance(page);
    expect(score).toBeGreaterThanOrEqual(8);
    expect(categories.get('ZONING_ANALYSIS')).toBeGreaterThan(0);
  });

  it('scores unit schedule page', () => {
    const page = makePage(2, 'UNIT MIX SCHEDULE\nOCCUPANT LOAD\nNO. OF UNITS: 14\nNET SF');
    const { score, categories } = scorePageRelevance(page);
    expect(score).toBeGreaterThanOrEqual(8);
    expect(categories.get('UNIT_SCHEDULE')).toBeGreaterThan(0);
  });

  it('scores irrelevant page low', () => {
    const page = makePage(5, 'PLUMBING DIAGRAM\nISOMETRIC RISER\nHOT WATER SUPPLY');
    const { score } = scorePageRelevance(page);
    expect(score).toBeLessThan(3);
  });

  it('scores affordable housing keywords', () => {
    const page = makePage(3, 'MIH AFFORDABLE HOUSING\nAMI BAND 80%\nINCOME BAND\nRENT STABILIZED');
    const { categories } = scorePageRelevance(page);
    expect(categories.get('AFFORDABLE_HOUSING')).toBeGreaterThan(0);
  });
});

describe('classifyPages', () => {
  it('selects relevant pages and marks them for LLM', () => {
    const pages = [
      makePage(0, 'COVER SHEET\nPROJECT INFORMATION\nPROPOSED 14-UNIT'),
      makePage(1, 'ZONING ANALYSIS\nFLOOR AREA RATIO'),
      makePage(2, 'PLUMBING DIAGRAM'),
      makePage(3, 'UNIT MIX SCHEDULE\nOCCUPANT LOAD'),
    ];
    const results = classifyPages(pages);
    expect(results).toHaveLength(4);

    const selected = results.filter((r) => r.selectedForLlm);
    expect(selected.length).toBeGreaterThanOrEqual(2);

    const irrelevant = results.find((r) => r.pageIndex === 2);
    expect(irrelevant!.selectedForLlm).toBe(false);
  });

  it('limits LLM pages to 8 max', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      makePage(i, `UNIT MIX SCHEDULE\nOCCUPANT LOAD\nNO. OF UNITS: ${i}\nTOTAL UNITS`)
    );
    const results = classifyPages(pages);
    const selected = results.filter((r) => r.selectedForLlm);
    expect(selected.length).toBeLessThanOrEqual(11);
  });

  it('ensures at least one of each required category if available', () => {
    const pages = [
      makePage(0, 'COVER SHEET\nPROJECT INFORMATION'),
      makePage(1, 'ZONING ANALYSIS\nFLOOR AREA RATIO'),
      makePage(2, 'UNIT MIX SCHEDULE\nOCCUPANT LOAD'),
      ...Array.from({ length: 10 }, (_, i) =>
        makePage(i + 3, `FLOOR PLAN\nTYPICAL FLOOR ${i}`)
      ),
    ];
    const results = classifyPages(pages);
    const selected = results.filter((r) => r.selectedForLlm);
    const selectedCategories = new Set(selected.map((r) => r.category));
    expect(selectedCategories.has('COVER_SHEET')).toBe(true);
    expect(selectedCategories.has('ZONING_ANALYSIS')).toBe(true);
    expect(selectedCategories.has('UNIT_SCHEDULE')).toBe(true);
  });
});

describe('getRelevantPagesForLlm', () => {
  it('returns only pages marked for LLM in order', () => {
    const pages = [
      makePage(0, 'COVER SHEET\nPROJECT INFORMATION'),
      makePage(1, 'PLUMBING DIAGRAM'),
      makePage(2, 'ZONING ANALYSIS\nFLOOR AREA RATIO'),
    ];
    const relevance = classifyPages(pages);
    const llmPages = getRelevantPagesForLlm(pages, relevance);
    expect(llmPages.every((p) => p.text.includes('COVER') || p.text.includes('ZONING'))).toBe(true);
    for (let i = 1; i < llmPages.length; i++) {
      expect(llmPages[i].pageIndex).toBeGreaterThan(llmPages[i - 1].pageIndex);
    }
  });
});
