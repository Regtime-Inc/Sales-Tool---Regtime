import { describe, it, expect } from 'vitest';
import { scorePage, detectCandidatePages, isScheduleCandidatePage } from '../candidates';
import type { PageLine } from '../../../types/pdf';

function makeLine(text: string, page: number): PageLine {
  return { y: 100, items: [], text, page };
}

describe('scorePage', () => {
  it('scores APARTMENT UNIT SCHEDULE at +5', () => {
    const lines = [makeLine('APARTMENT UNIT SCHEDULE', 1)];
    const { score, tags } = scorePage(lines);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(tags.has('schedule')).toBe(true);
  });

  it('scores UNIT MIX at +4', () => {
    const { score } = scorePage([makeLine('UNIT MIX', 1)]);
    expect(score).toBeGreaterThanOrEqual(4);
  });

  it('scores FAR / ZFA pages with far tag', () => {
    const { score, tags } = scorePage([makeLine('ZONING FLOOR AREA: 95,000 SF', 1)]);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(tags.has('far')).toBe(true);
  });

  it('scores AFFORDABLE / MIH keywords', () => {
    const { score, tags } = scorePage([makeLine('MIH Inclusionary Housing', 1)]);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(tags.has('schedule')).toBe(true);
  });

  it('scores NET SF / GROSS AREA', () => {
    const { score } = scorePage([makeLine('NET SF', 1)]);
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('scores OCCUPANT LOAD at +4', () => {
    const { score, tags } = scorePage([makeLine('OCCUPANT LOAD', 1)]);
    expect(score).toBeGreaterThanOrEqual(4);
    expect(tags.has('schedule')).toBe(true);
  });

  it('scores BC 1004 at +3', () => {
    const { score } = scorePage([makeLine('BC 1004', 1)]);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it('scores AREA PER OCCUPANT at +3', () => {
    const { score } = scorePage([makeLine('AREA PER OCCUPANT', 1)]);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it('scores TOTAL OCCUPANCY at +2', () => {
    const { score } = scorePage([makeLine('TOTAL OCCUPANCY', 1)]);
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 for unrelated pages', () => {
    const { score } = scorePage([makeLine('General Notes and Symbols', 1)]);
    expect(score).toBe(0);
  });

  it('accumulates scores from multiple matching lines', () => {
    const lines = [
      makeLine('APARTMENT UNIT SCHEDULE', 1),
      makeLine('AFFORDABLE UNITS', 1),
      makeLine('NET SF', 1),
    ];
    const { score } = scorePage(lines);
    expect(score).toBeGreaterThanOrEqual(10);
  });
});

describe('detectCandidatePages', () => {
  it('returns top scored pages sorted by page number', () => {
    const pageLines = new Map<number, PageLine[]>();
    pageLines.set(1, [makeLine('Floor Plan', 1)]);
    pageLines.set(2, [makeLine('UNIT SCHEDULE', 2)]);
    pageLines.set(3, [makeLine('Elevations', 3)]);
    pageLines.set(4, [makeLine('ZONING FLOOR AREA', 4)]);

    const candidates = detectCandidatePages(pageLines);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const pages = candidates.map((c) => c.page);
    expect(pages).toContain(2);
    expect(pages).toContain(4);
  });

  it('ensures at least 1 schedule and 1 far page', () => {
    const pageLines = new Map<number, PageLine[]>();
    for (let i = 1; i <= 10; i++) {
      if (i === 8) {
        pageLines.set(i, [makeLine('UNIT SCHEDULE', i)]);
      } else if (i === 9) {
        pageLines.set(i, [makeLine('LOT AREA: 12000', i)]);
      } else {
        pageLines.set(i, [makeLine('Random content ' + i, i)]);
      }
    }

    const candidates = detectCandidatePages(pageLines);
    const hasSched = candidates.some((c) => c.tags.includes('schedule'));
    const hasFar = candidates.some((c) => c.tags.includes('far'));
    expect(hasSched).toBe(true);
    expect(hasFar).toBe(true);
  });

  it('returns empty for pages with no relevant content', () => {
    const pageLines = new Map<number, PageLine[]>();
    pageLines.set(1, [makeLine('Cover Sheet', 1)]);
    pageLines.set(2, [makeLine('Table of Contents', 2)]);
    expect(detectCandidatePages(pageLines)).toEqual([]);
  });

  it('limits to maxCandidates', () => {
    const pageLines = new Map<number, PageLine[]>();
    for (let i = 1; i <= 20; i++) {
      pageLines.set(i, [makeLine('UNIT MIX SCHEDULE', i)]);
    }
    const candidates = detectCandidatePages(pageLines, 3);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });
});

describe('isScheduleCandidatePage', () => {
  it('returns true for schedule pages', () => {
    expect(isScheduleCandidatePage([makeLine('UNIT SCHEDULE', 1)])).toBe(true);
  });

  it('returns true for affordable pages', () => {
    expect(isScheduleCandidatePage([makeLine('AFFORDABLE HOUSING PLAN', 1)])).toBe(true);
  });

  it('returns false for irrelevant pages', () => {
    expect(isScheduleCandidatePage([makeLine('Site Plan', 1)])).toBe(false);
  });
});
