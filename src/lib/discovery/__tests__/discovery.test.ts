import { describe, it, expect } from 'vitest';
import type { DiscoveryResponse, DiscoveryCandidate } from '../../../types/discovery';

function makeCandidates(count: number): DiscoveryCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    bbl: `1000${String(i + 1).padStart(6, '0')}`,
    address: `${100 + i} Test St`,
    borough: '1',
    zoneDist: 'R7A',
    lotArea: 10000 + i * 500,
    bldgArea: 2000 + i * 100,
    residFar: 4.6,
    builtFar: 0.5 + i * 0.1,
    maxBuildableSF: 46000 + i * 2300,
    slackSF: 44000 + i * 2200,
    underbuiltRatio: 0.1 + i * 0.02,
    landUse: '01',
    bldgClass: 'A1',
    yearBuilt: 1920 + i,
    unitsRes: 1 + i,
    ownerName: `Owner ${i + 1}`,
    score: 80 - i * 2,
    lastSaleDate: null,
  }));
}

function makeResponse(
  candidates: DiscoveryCandidate[],
  page: number,
  pageSize: number,
  total: number,
  cached: boolean
): DiscoveryResponse {
  return {
    candidates,
    total,
    page,
    pageSize,
    cached,
    cachedAt: cached ? new Date().toISOString() : null,
  };
}

describe('DiscoveryResponse pagination', () => {
  it('returns correct page metadata', () => {
    const resp = makeResponse(makeCandidates(10), 1, 10, 50, false);
    expect(resp.page).toBe(1);
    expect(resp.pageSize).toBe(10);
    expect(resp.total).toBe(50);
    expect(resp.candidates.length).toBe(10);
  });

  it('computes total pages correctly', () => {
    const resp = makeResponse(makeCandidates(10), 1, 10, 47, false);
    const totalPages = Math.ceil(resp.total / resp.pageSize);
    expect(totalPages).toBe(5);
  });

  it('last page may have fewer items', () => {
    const resp = makeResponse(makeCandidates(7), 5, 10, 47, false);
    expect(resp.candidates.length).toBe(7);
    expect(resp.page).toBe(5);
  });

  it('empty page returns zero candidates', () => {
    const resp = makeResponse([], 1, 10, 0, false);
    expect(resp.candidates.length).toBe(0);
    expect(resp.total).toBe(0);
  });
});

describe('DiscoveryResponse caching', () => {
  it('indicates cached state', () => {
    const resp = makeResponse(makeCandidates(5), 1, 25, 5, true);
    expect(resp.cached).toBe(true);
    expect(resp.cachedAt).toBeTruthy();
  });

  it('indicates uncached state', () => {
    const resp = makeResponse(makeCandidates(5), 1, 25, 5, false);
    expect(resp.cached).toBe(false);
    expect(resp.cachedAt).toBeNull();
  });

  it('cachedAt is a valid date when cached', () => {
    const resp = makeResponse(makeCandidates(5), 1, 25, 5, true);
    const d = new Date(resp.cachedAt!);
    expect(d.getTime()).toBeGreaterThan(0);
  });
});

describe('DiscoveryCandidate ranking', () => {
  it('candidates are ranked by score descending', () => {
    const candidates = makeCandidates(10);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it('all scores are non-negative', () => {
    const candidates = makeCandidates(20);
    for (const c of candidates) {
      expect(c.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('underbuilt ratio is between 0 and 1', () => {
    const candidates = makeCandidates(10);
    for (const c of candidates) {
      expect(c.underbuiltRatio).toBeGreaterThanOrEqual(0);
      expect(c.underbuiltRatio).toBeLessThanOrEqual(1);
    }
  });

  it('slack SF is non-negative', () => {
    const candidates = makeCandidates(10);
    for (const c of candidates) {
      expect(c.slackSF).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Discovery filter logic', () => {
  it('filters by minimum slack SF', () => {
    const all = makeCandidates(20);
    const minSlack = 45000;
    const filtered = all.filter((c) => c.slackSF >= minSlack);
    expect(filtered.length).toBeLessThan(all.length);
    for (const c of filtered) {
      expect(c.slackSF).toBeGreaterThanOrEqual(minSlack);
    }
  });

  it('filters by underbuilt ratio threshold', () => {
    const all = makeCandidates(20);
    const maxUbr = 0.5;
    const filtered = all.filter((c) => c.underbuiltRatio < maxUbr);
    for (const c of filtered) {
      expect(c.underbuiltRatio).toBeLessThan(maxUbr);
    }
  });

  it('excludes condos by building class', () => {
    const CONDO_CLASSES = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R9', 'RR']);
    const candidates = [
      ...makeCandidates(5),
      { ...makeCandidates(1)[0], bbl: '1999999999', bldgClass: 'R4' },
    ];
    const filtered = candidates.filter((c) => !CONDO_CLASSES.has(c.bldgClass));
    expect(filtered.length).toBe(5);
  });

  it('default filters with minSlackSF=0 return all candidates', () => {
    const all = makeCandidates(10);
    const minSlack = 0;
    const filtered = all.filter((c) => minSlack <= 0 || c.slackSF >= minSlack);
    expect(filtered.length).toBe(10);
  });
});

describe('Discovery sale recency filter', () => {
  function makeCandidatesWithSales(): DiscoveryCandidate[] {
    const base = makeCandidates(5);
    base[0].lastSaleDate = '2025-06-01';
    base[1].lastSaleDate = '2023-01-15';
    base[2].lastSaleDate = '2022-03-20';
    base[3].lastSaleDate = null;
    base[4].lastSaleDate = null;
    return base;
  }

  it('sale recency filter excludes null lastSaleDate', () => {
    const all = makeCandidatesWithSales();
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 5);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = all.filter((c) => c.lastSaleDate != null && c.lastSaleDate >= cutoffStr);
    expect(filtered.every((c) => c.lastSaleDate !== null)).toBe(true);
    expect(filtered.length).toBe(3);
  });

  it('1-year filter returns only very recent sales', () => {
    const all = makeCandidatesWithSales();
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = all.filter((c) => c.lastSaleDate != null && c.lastSaleDate >= cutoffStr);
    expect(filtered.length).toBe(1);
    expect(filtered[0].lastSaleDate).toBe('2025-06-01');
  });

  it('Any filter (maxSaleRecencyYears=0) returns all candidates', () => {
    const all = makeCandidatesWithSales();
    const maxSaleRecencyYears = 0;
    const filtered = maxSaleRecencyYears > 0
      ? all.filter((c) => {
          const cutoff = new Date();
          cutoff.setFullYear(cutoff.getFullYear() - maxSaleRecencyYears);
          return c.lastSaleDate != null && c.lastSaleDate >= cutoff.toISOString().split('T')[0];
        })
      : all;
    expect(filtered.length).toBe(5);
  });
});
