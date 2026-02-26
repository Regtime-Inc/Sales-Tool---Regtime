import { describe, it, expect } from 'vitest';
import { computeRedundancyScore } from '../resolve';
import type { UnitCountMention } from '../types';

function makeMention(value: number, page: number, sourceType: UnitCountMention['sourceType']): UnitCountMention {
  return { value, page, sourceType, snippet: `${value} units`, confidence: 0.8 };
}

describe('computeRedundancyScore', () => {
  it('returns 0 for empty mentions', () => {
    expect(computeRedundancyScore([], 14)).toBe(0);
  });

  it('returns 0.6 for single source agreeing', () => {
    const mentions = [makeMention(14, 1, 'cover_sheet')];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.6);
  });

  it('returns 0.85 for two independent sources agreeing', () => {
    const mentions = [
      makeMention(14, 1, 'cover_sheet'),
      makeMention(14, 3, 'zoning_text'),
    ];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.85);
  });

  it('returns 0.95 for three or more independent sources agreeing', () => {
    const mentions = [
      makeMention(14, 1, 'cover_sheet'),
      makeMention(14, 3, 'zoning_text'),
      makeMention(14, 5, 'unit_schedule_table'),
    ];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.95);
  });

  it('considers values within ±2 as agreeing', () => {
    const mentions = [
      makeMention(14, 1, 'cover_sheet'),
      makeMention(15, 3, 'zoning_text'),
    ];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.85);
  });

  it('returns 0.3 when no mentions agree with resolved value', () => {
    const mentions = [
      makeMention(100, 1, 'cover_sheet'),
      makeMention(200, 3, 'zoning_text'),
    ];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.3);
  });

  it('counts same source on different pages as separate', () => {
    const mentions = [
      makeMention(14, 1, 'cover_sheet'),
      makeMention(14, 2, 'cover_sheet'),
    ];
    expect(computeRedundancyScore(mentions, 14)).toBe(0.85);
  });
});
