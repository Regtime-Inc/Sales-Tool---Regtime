import type { ParsedTxn, ParseResult } from '../../types/acrisAssist';
import { normalizeName, normalizeDocType, normalizeBorough, toISODate, makeBBL } from './normalize';

const COLUMN_KEYWORDS: Record<string, string[]> = {
  crfn: ['crfn', 'city register filing number'],
  documentId: ['document id', 'doc id', 'document_id', 'docid', 'document #'],
  recordedDate: ['recorded', 'filed', 'date recorded', 'date filed', 'recording date', 'file date', 'recorded / filed'],
  docType: ['doc type', 'document type', 'type', 'doc_type', 'instrument'],
  borough: ['borough', 'boro', 'county'],
  block: ['block', 'blk'],
  lot: ['lot'],
  party1: ['party 1', 'party1', 'grantor', 'seller', 'party name/address 1', 'party name 1'],
  party2: ['party 2', 'party2', 'grantee', 'buyer', 'party name/address 2', 'party name 2'],
  amount: ['amount', 'consideration', 'price', 'sale price', 'doc amount'],
};

function detectDelimiter(lines: string[]): 'tab' | 'pipe' | 'space' {
  let tabCount = 0;
  let pipeCount = 0;
  const sample = lines.slice(0, Math.min(5, lines.length));
  for (const line of sample) {
    tabCount += (line.match(/\t/g) || []).length;
    pipeCount += (line.match(/\|/g) || []).length;
  }
  if (tabCount >= sample.length) return 'tab';
  if (pipeCount >= sample.length) return 'pipe';
  return 'space';
}

function splitLine(line: string, delim: 'tab' | 'pipe' | 'space'): string[] {
  if (delim === 'tab') return line.split('\t').map((s) => s.trim());
  if (delim === 'pipe') return line.split('|').map((s) => s.trim());
  return line.split(/\s{2,}/).map((s) => s.trim());
}

function matchColumn(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    for (const kw of keywords) {
      if (h === kw || h.includes(kw)) return field;
    }
  }
  return null;
}

function detectHeaderRow(rows: string[][], maxScan: number = 5): { index: number; mapping: Record<number, string> } | null {
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const row = rows[i];
    const mapping: Record<number, string> = {};
    let matchCount = 0;
    for (let c = 0; c < row.length; c++) {
      const field = matchColumn(row[c]);
      if (field) {
        mapping[c] = field;
        matchCount++;
      }
    }
    if (matchCount >= 2) {
      return { index: i, mapping };
    }
  }
  return null;
}

function hashRow(row: Partial<ParsedTxn>): string {
  const parts = [
    row.recordedDate ?? '',
    row.docType ?? '',
    row.block ?? '',
    row.lot ?? '',
    row.party1 ?? '',
    row.party2 ?? '',
  ].join('|');
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) - hash + parts.charCodeAt(i)) | 0;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}

function makeDedupeKey(txn: Partial<ParsedTxn>): string {
  if (txn.crfn) return `crfn_${txn.crfn}`;
  if (txn.documentId) return `docid_${txn.documentId}`;
  return hashRow(txn);
}

function cleanAmount(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[$,\s]/g, '');
}

function rowToTxn(cells: string[], mapping: Record<number, string>, rawLine: string): ParsedTxn {
  const raw: Partial<ParsedTxn> = {};
  for (const [colIdx, field] of Object.entries(mapping)) {
    const val = cells[+colIdx] ?? '';
    if (!val) continue;
    switch (field) {
      case 'crfn': raw.crfn = val; break;
      case 'documentId': raw.documentId = val; break;
      case 'recordedDate': raw.recordedDate = toISODate(val) ?? val; break;
      case 'docType': raw.docType = normalizeDocType(val); break;
      case 'borough': raw.borough = normalizeBorough(val) || val; break;
      case 'block': raw.block = val.replace(/\D/g, ''); break;
      case 'lot': raw.lot = val.replace(/\D/g, ''); break;
      case 'party1': raw.party1 = normalizeName(val); break;
      case 'party2': raw.party2 = normalizeName(val); break;
      case 'amount': raw.amount = cleanAmount(val); break;
    }
  }

  return {
    ...raw,
    rawLine,
    dedupeKey: makeDedupeKey(raw),
  } as ParsedTxn;
}

export function parseClipboard(text: string): ParseResult {
  const warnings: string[] = [];

  if (!text || !text.trim()) {
    return { transactions: [], warnings: ['Empty input'] };
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return { transactions: [], warnings: ['No non-empty lines found'] };
  }

  const delim = detectDelimiter(lines);
  const rows = lines.map((l) => splitLine(l, delim));

  const headerDetect = detectHeaderRow(rows);
  if (!headerDetect) {
    warnings.push('Could not detect a header row. Returning raw lines.');
    return {
      transactions: lines.map((l) => ({
        rawLine: l,
        dedupeKey: `raw_${hashRow({})}`,
      })),
      warnings,
    };
  }

  const { index: headerIdx, mapping } = headerDetect;
  const dataRows = rows.slice(headerIdx + 1);
  const dataLines = lines.slice(headerIdx + 1);

  if (dataRows.length === 0) {
    return { transactions: [], warnings: ['Header detected but no data rows found'] };
  }

  const seen = new Set<string>();
  const transactions: ParsedTxn[] = [];
  let dupeCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const nonEmpty = cells.filter((c) => c.length > 0).length;
    if (nonEmpty < 2) continue;

    const txn = rowToTxn(cells, mapping, dataLines[i]);
    if (seen.has(txn.dedupeKey)) {
      dupeCount++;
      continue;
    }
    seen.add(txn.dedupeKey);
    transactions.push(txn);
  }

  if (dupeCount > 0) {
    warnings.push(`${dupeCount} duplicate row(s) removed`);
  }

  const noIdCount = transactions.filter((t) => !t.crfn && !t.documentId).length;
  if (noIdCount > 0) {
    warnings.push(`${noIdCount} row(s) have no CRFN or Document ID`);
  }

  return { transactions, warnings };
}
