import { describe, it, expect } from 'vitest';
import { classifyTable, classifyDocAiTables } from '../tableClassifier';

describe('classifyTable', () => {
  it('classifies light & ventilation schedule by headers', () => {
    const result = classifyTable(
      ['ROOM ID', 'NATURAL LIGHT', 'VENTILATION', "REQ'D", 'PROVIDED'],
      [['BEDROOM', '8', '12', '8', '12']],
    );
    expect(result.tableType).toBe('light_ventilation_schedule');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies unit schedule by headers', () => {
    const result = classifyTable(
      ['UNIT', 'BEDROOM', 'TYPE', 'SF'],
      [['1A', '1BR', 'Market', '650']],
    );
    expect(result.tableType).toBe('unit_schedule');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies zoning table by headers', () => {
    const result = classifyTable(
      ['ZONING', 'FAR', 'LOT AREA', 'USE GROUP'],
      [['R7A', '4.0', '5000', '2']],
    );
    expect(result.tableType).toBe('zoning_table');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('forces light_ventilation_schedule when data rows contain room names', () => {
    const result = classifyTable(
      ['UNIT', 'TYPE', 'AREA'],
      [
        ['BEDROOM', 'R1', '120'],
        ['LIVING ROOM', 'R1', '200'],
        ['KITCHEN', 'R1', '80'],
      ],
    );
    expect(result.tableType).toBe('light_ventilation_schedule');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns unknown for unrecognized headers', () => {
    const result = classifyTable(
      ['X', 'Y', 'Z'],
      [['1', '2', '3']],
    );
    expect(result.tableType).toBe('unknown');
  });

  it('is case insensitive', () => {
    const result = classifyTable(
      ['unit', 'bedroom', 'type'],
      [['1A', 'Studio', 'Market']],
    );
    expect(result.tableType).toBe('unit_schedule');
  });

  it('classifies occupancy load table', () => {
    const result = classifyTable(
      ['OCCUPANCY', 'CAPACITY', 'PERSONS', 'AREA'],
      [['Assembly', '200', '200', '2000']],
    );
    expect(result.tableType).toBe('occupancy_load');
  });
});

describe('classifyDocAiTables', () => {
  it('classifies multiple tables', () => {
    const tables = [
      {
        pageIndex: 1,
        tableIndex: 0,
        headerRows: [['UNIT', 'BEDROOM', 'SF']],
        bodyRows: [['1A', '1BR', '650']],
      },
      {
        pageIndex: 2,
        tableIndex: 1,
        headerRows: [['ROOM ID', 'NATURAL LIGHT', 'VENTILATION']],
        bodyRows: [['BEDROOM', '8', '12']],
      },
    ];
    const result = classifyDocAiTables(tables);
    expect(result).toHaveLength(2);
    expect(result[0].tableType).toBe('unit_schedule');
    expect(result[1].tableType).toBe('light_ventilation_schedule');
  });
});
