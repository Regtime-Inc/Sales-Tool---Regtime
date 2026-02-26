import { describe, it, expect } from 'vitest';
import { parseClipboard } from '../parseClipboard';

describe('parseClipboard', () => {
  it('returns empty with warning for empty input', () => {
    const result = parseClipboard('');
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain('Empty input');
  });

  it('parses TSV format with header row', () => {
    const tsv = [
      'CRFN\tDocument ID\tRecorded\tDoc Type\tBorough\tBlock\tLot\tParty 1\tParty 2\tAmount',
      '2025000123456\tFT_1234\t01/15/2025\tDEED\tManhattan\t100\t50\tJOHN DOE\tJANE SMITH\t$1,500,000',
      '2025000123457\tFT_1235\t01/16/2025\tMTGE\tBrooklyn\t200\t75\tACME LLC\tBANK OF NY\t$2,000,000',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].crfn).toBe('2025000123456');
    expect(result.transactions[0].documentId).toBe('FT_1234');
    expect(result.transactions[0].recordedDate).toBe('2025-01-15');
    expect(result.transactions[0].docType).toBe('DEED');
    expect(result.transactions[0].borough).toBe('1');
    expect(result.transactions[0].block).toBe('100');
    expect(result.transactions[0].lot).toBe('50');
    expect(result.transactions[0].party1).toBe('John Doe');
    expect(result.transactions[0].party2).toBe('Jane Smith');
    expect(result.transactions[0].amount).toBe('1500000');
    expect(result.transactions[0].dedupeKey).toBe('crfn_2025000123456');
  });

  it('deduplicates rows with the same CRFN', () => {
    const tsv = [
      'CRFN\tDoc Type\tBlock\tLot',
      '2025000123456\tDEED\t100\t50',
      '2025000123456\tDEED\t100\t50',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('deduplicates by hash when no CRFN or docId', () => {
    const tsv = [
      'Recorded\tDoc Type\tBlock\tLot\tParty 1',
      '01/15/2025\tDEED\t100\t50\tJohn Doe',
      '01/15/2025\tDEED\t100\t50\tJohn Doe',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(1);
  });

  it('parses pipe-separated format', () => {
    const pipe = [
      'CRFN | Doc Type | Borough | Block | Lot',
      '2025000111 | DEED | 1 | 500 | 25',
      '2025000222 | MTGE | 3 | 600 | 30',
    ].join('\n');

    const result = parseClipboard(pipe);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].crfn).toBe('2025000111');
    expect(result.transactions[1].docType).toBe('MTGE');
  });

  it('parses space-separated format', () => {
    const spaced = [
      'CRFN          Doc Type    Block    Lot',
      '2025000333    DEED        100      50',
      '2025000444    MTGE        200      75',
    ].join('\n');

    const result = parseClipboard(spaced);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].crfn).toBe('2025000333');
  });

  it('warns when no header is detected', () => {
    const garbage = 'no headers here\njust random text\nmore stuff';
    const result = parseClipboard(garbage);
    expect(result.warnings.some((w) => w.includes('Could not detect'))).toBe(true);
  });

  it('warns about rows missing CRFN and document ID', () => {
    const tsv = [
      'Doc Type\tBlock\tLot\tParty 1',
      'DEED\t100\t50\tJohn Doe',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('no CRFN'))).toBe(true);
  });

  it('skips nearly-empty rows', () => {
    const tsv = [
      'CRFN\tDoc Type\tBlock\tLot',
      '2025000555\tDEED\t100\t50',
      '\t\t\t',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(1);
  });

  it('handles alternative header keywords', () => {
    const tsv = [
      'City Register Filing Number\tInstrument\tRecording Date\tGrantor\tGrantee',
      '2025000666\tDEED\t2025-03-01\tSELLER INC\tBUYER LLC',
    ].join('\n');

    const result = parseClipboard(tsv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].crfn).toBe('2025000666');
    expect(result.transactions[0].docType).toBe('DEED');
    expect(result.transactions[0].party1).toBe('Seller Inc');
    expect(result.transactions[0].party2).toBe('Buyer Llc');
  });
});
