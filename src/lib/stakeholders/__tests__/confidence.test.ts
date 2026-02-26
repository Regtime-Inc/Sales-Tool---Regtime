import { describe, it, expect } from 'vitest';
import { computeConfidence, enrichmentBoost, BASE_CONFIDENCE } from '../confidence';

describe('computeConfidence', () => {
  it('returns 0 for empty sources', () => {
    const { score } = computeConfidence([]);
    expect(score).toBe(0);
  });

  it('returns base confidence for a single DOB_LICENSE_INFO source', () => {
    const { score } = computeConfidence(['DOB_LICENSE_INFO']);
    expect(score).toBe(BASE_CONFIDENCE.DOB_LICENSE_INFO);
  });

  it('returns base confidence for a single HPD_CONTACTS source', () => {
    const { score } = computeConfidence(['HPD_CONTACTS']);
    expect(score).toBe(BASE_CONFIDENCE.HPD_CONTACTS);
  });

  it('increases score for multiple corroborating sources', () => {
    const single = computeConfidence(['HPD_CONTACTS']).score;
    const multi = computeConfidence(['HPD_CONTACTS', 'DOF_VALUATION']).score;
    expect(multi).toBeGreaterThan(single);
  });

  it('caps at 0.99', () => {
    const { score } = computeConfidence([
      'DOB_LICENSE_INFO', 'HPD_CONTACTS', 'DOF_VALUATION', 'ACRIS_GRANTEE', 'DOB_FILING',
    ]);
    expect(score).toBeLessThanOrEqual(0.99);
  });

  it('uses 0.50 for unknown source systems', () => {
    const { score } = computeConfidence(['UNKNOWN_SOURCE']);
    expect(score).toBe(0.50);
  });

  it('provides reasons for each source', () => {
    const { reasons } = computeConfidence(['HPD_CONTACTS', 'PLUTO']);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('enrichmentBoost', () => {
  it('adds 0.15 to current confidence', () => {
    expect(enrichmentBoost(0.75)).toBe(0.90);
  });

  it('caps at 0.95', () => {
    expect(enrichmentBoost(0.90)).toBe(0.95);
    expect(enrichmentBoost(0.95)).toBe(0.95);
  });
});
