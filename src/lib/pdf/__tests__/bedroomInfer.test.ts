import { describe, it, expect } from 'vitest';
import {
  getThresholds,
  inferBedroomFromArea,
  inferFloorFromUnitId,
  applyBedroomInference,
} from '../bedroomInfer';
import type { UnitRecord } from '../../../types/pdf';

describe('getThresholds', () => {
  it('returns default thresholds when no zone provided', () => {
    const t = getThresholds();
    expect(t.studioMax).toBe(450);
    expect(t.oneBrMax).toBe(650);
    expect(t.twoBrMax).toBe(950);
    expect(t.threeBrMax).toBe(1300);
  });

  it('returns R6 thresholds for R6 zone', () => {
    const t = getThresholds('R6');
    expect(t.studioMax).toBe(400);
    expect(t.oneBrMax).toBe(600);
  });

  it('returns R7 thresholds for R7-2 zone', () => {
    const t = getThresholds('R7-2');
    expect(t.studioMax).toBe(425);
  });

  it('returns R10 thresholds for R10A zone', () => {
    const t = getThresholds('R10A');
    expect(t.studioMax).toBe(500);
  });

  it('returns C6 thresholds for C6-4 zone', () => {
    const t = getThresholds('C6-4');
    expect(t.studioMax).toBe(475);
  });

  it('returns defaults for unknown zone prefix', () => {
    const t = getThresholds('X99');
    expect(t.studioMax).toBe(450);
  });
});

describe('inferBedroomFromArea', () => {
  const defaults = getThresholds();

  it('infers STUDIO for small areas', () => {
    const result = inferBedroomFromArea(400, defaults);
    expect(result.type).toBe('STUDIO');
    expect(result.count).toBe(0);
    expect(result.confidence).toBe(0.65);
  });

  it('infers 1BR for mid-small areas', () => {
    const result = inferBedroomFromArea(550, defaults);
    expect(result.type).toBe('1BR');
    expect(result.count).toBe(1);
    expect(result.confidence).toBe(0.6);
  });

  it('infers 2BR for mid areas', () => {
    const result = inferBedroomFromArea(800, defaults);
    expect(result.type).toBe('2BR');
    expect(result.count).toBe(2);
    expect(result.confidence).toBe(0.55);
  });

  it('infers 3BR for larger areas', () => {
    const result = inferBedroomFromArea(1100, defaults);
    expect(result.type).toBe('3BR');
    expect(result.count).toBe(3);
    expect(result.confidence).toBe(0.5);
  });

  it('infers 4BR_PLUS for very large areas', () => {
    const result = inferBedroomFromArea(1500, defaults);
    expect(result.type).toBe('4BR_PLUS');
    expect(result.count).toBe(4);
    expect(result.confidence).toBe(0.45);
  });

  it('uses exact boundary correctly (studioMax)', () => {
    const result = inferBedroomFromArea(450, defaults);
    expect(result.type).toBe('STUDIO');
  });

  it('transitions at boundary + 1', () => {
    const result = inferBedroomFromArea(451, defaults);
    expect(result.type).toBe('1BR');
  });
});

describe('inferFloorFromUnitId', () => {
  it('extracts floor from numeric prefix', () => {
    expect(inferFloorFromUnitId('1A')).toBe('1');
    expect(inferFloorFromUnitId('12B')).toBe('12');
    expect(inferFloorFromUnitId('3C')).toBe('3');
  });

  it('returns PH for penthouse units', () => {
    expect(inferFloorFromUnitId('PH1')).toBe('PH');
    expect(inferFloorFromUnitId('PH02')).toBe('PH');
  });

  it('returns undefined for non-numeric prefix', () => {
    expect(inferFloorFromUnitId('ABC')).toBeUndefined();
  });
});

describe('applyBedroomInference', () => {
  const source = { page: 1, method: 'TEXT_TABLE' as const, evidence: 'test' };

  it('infers bedroom type for UNKNOWN records with areaSf', () => {
    const records: UnitRecord[] = [
      { unitId: '1A', bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: 400, source },
    ];
    const { records: updated, inferredCount } = applyBedroomInference(records);
    expect(inferredCount).toBe(1);
    expect(updated[0].bedroomType).toBe('STUDIO');
    expect(updated[0].bedroomCount).toBe(0);
    expect(updated[0].notes).toContain('inferred from 400 SF');
  });

  it('does not override known bedroom types', () => {
    const records: UnitRecord[] = [
      { unitId: '2A', bedroomType: '2BR', bedroomCount: 2, allocation: 'MARKET', areaSf: 400, source },
    ];
    const { records: updated, inferredCount } = applyBedroomInference(records);
    expect(inferredCount).toBe(0);
    expect(updated[0].bedroomType).toBe('2BR');
  });

  it('does not infer when areaSf is missing', () => {
    const records: UnitRecord[] = [
      { unitId: '3A', bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', source },
    ];
    const { records: updated, inferredCount } = applyBedroomInference(records);
    expect(inferredCount).toBe(0);
    expect(updated[0].bedroomType).toBe('UNKNOWN');
  });

  it('uses zone-specific thresholds', () => {
    const records: UnitRecord[] = [
      { unitId: '1A', bedroomType: 'UNKNOWN', allocation: 'UNKNOWN', areaSf: 420, source },
    ];
    const r6Result = applyBedroomInference(records, 'R6');
    expect(r6Result.records[0].bedroomType).toBe('1BR');

    const defaultResult = applyBedroomInference(records);
    expect(defaultResult.records[0].bedroomType).toBe('STUDIO');
  });

  it('infers floor from unitId', () => {
    const records: UnitRecord[] = [
      { unitId: '5B', bedroomType: '1BR', allocation: 'MARKET', source },
    ];
    const { records: updated } = applyBedroomInference(records);
    expect(updated[0].floor).toBe('5');
  });
});
