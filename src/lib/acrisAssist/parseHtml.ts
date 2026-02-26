import type { ParsedTxn, ParseResult } from '../../types/acrisAssist';
import { normalizeBorough, normalizeName, normalizeDocType, toISODate, makeBBL } from './normalize';

const DATA_ROW_COLORS = new Set(['#FFFFFF', '#C6E2FF', '#ffffff', '#c6e2ff']);

function extractDocumentId(cell: Element): string | undefined {
  const anchors = cell.querySelectorAll('a, input, button');
  for (const el of anchors) {
    const onclick = el.getAttribute('onclick') || '';
    const match = onclick.match(/go_detail\s*\(\s*["'](\d+)["']\s*\)/i);
    if (match) return match[1];
  }
  const onclick = cell.getAttribute('onclick') || '';
  const match = onclick.match(/go_detail\s*\(\s*["'](\d+)["']\s*\)/i);
  if (match) return match[1];
  return undefined;
}

function cellText(cell: Element): string {
  return (cell.textContent || '').replace(/\s+/g, ' ').trim();
}

function hasCheckGif(cell: Element): boolean {
  const imgs = cell.querySelectorAll('img');
  for (const img of imgs) {
    const src = (img.getAttribute('src') || '').toLowerCase();
    if (src.includes('check')) return true;
  }
  return false;
}

function cleanAmount(raw: string): string {
  const stripped = raw.replace(/[$,\s]/g, '');
  if (!stripped || isNaN(Number(stripped))) return '';
  return stripped;
}

function extractDocTypeFromHtml(doc: Document): string {
  const hiddenField = doc.querySelector('input[name="hid_doctype"]') as HTMLInputElement | null;
  if (hiddenField?.value) return hiddenField.value.trim().toUpperCase();

  const hiddenField2 = doc.querySelector('input[name="hid_doctypeselection"]') as HTMLInputElement | null;
  if (hiddenField2?.value) return hiddenField2.value.trim().toUpperCase();

  const bolds = doc.querySelectorAll('b, strong');
  for (const b of bolds) {
    const text = (b.textContent || '').trim();
    if (text.length >= 2 && text.length <= 40 && !/search|result|criteria|document|date|borough/i.test(text)) {
      return normalizeDocType(text);
    }
  }
  return '';
}

function hashRow(txn: ParsedTxn): string {
  const parts = [
    txn.recordedDate || '',
    txn.docType || '',
    txn.block || '',
    txn.lot || '',
    txn.party1 || '',
    txn.party2 || '',
  ];
  return parts.join('|');
}

export function parseAcrisHtml(htmlString: string): ParseResult {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const globalDocType = extractDocTypeFromHtml(doc);
  if (globalDocType) {
    warnings.push(`Detected doc type: ${globalDocType}`);
  }

  const rows = doc.querySelectorAll('tr');
  const dataRows: Element[] = [];

  for (const row of rows) {
    const bg = (row.getAttribute('bgcolor') || '').trim();
    if (DATA_ROW_COLORS.has(bg)) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 10) {
        dataRows.push(row);
      }
    }
  }

  if (dataRows.length === 0) {
    warnings.push('No data rows found in the HTML file');
    return { transactions: [], warnings };
  }

  const transactions: ParsedTxn[] = [];
  const seenKeys = new Set<string>();
  let missingIdCount = 0;

  for (const row of dataRows) {
    const cells = row.querySelectorAll('td');
    const cellCount = cells.length;

    const documentId = extractDocumentId(cells[0]);
    const boroughRaw = cellText(cells[1]);
    const block = cellText(cells[2]);
    const reelPgFile = cellCount > 3 ? cellText(cells[3]) : '';
    const crfn = cellCount > 4 ? cellText(cells[4]) : '';
    const lot = cellCount > 5 ? cellText(cells[5]) : '';
    const partial = cellCount > 6 ? cellText(cells[6]) : '';
    const docDateRaw = cellCount > 7 ? cellText(cells[7]) : '';
    const recordedDateRaw = cellCount > 8 ? cellText(cells[8]) : '';
    const pages = cellCount > 9 ? cellText(cells[9]) : '';
    const party1Raw = cellCount > 10 ? cellText(cells[10]) : '';
    const party2Raw = cellCount > 11 ? cellText(cells[11]) : '';
    const party3Raw = cellCount > 12 ? cellText(cells[12]) : '';
    const corrected = cellCount > 14 ? hasCheckGif(cells[14]) : false;
    const amountRaw = cellCount > 15 ? cellText(cells[15]) : '';

    const borough = normalizeBorough(boroughRaw) || boroughRaw;
    const docDate = toISODate(docDateRaw);
    const recordedDate = toISODate(recordedDateRaw);
    const party1 = normalizeName(party1Raw);
    const party2 = normalizeName(party2Raw);
    const party3 = normalizeName(party3Raw);
    const amount = cleanAmount(amountRaw);
    const docType = globalDocType || '';
    const bbl = makeBBL(borough, block, lot);

    const dedupeKey = crfn
      ? (bbl ? `${crfn}|${bbl}` : crfn)
      : (documentId || hashRow({
          recordedDate: recordedDate || undefined,
          docType,
          block,
          lot,
          party1,
          party2,
        } as ParsedTxn));

    if (!crfn && !documentId) missingIdCount++;

    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const rawLine = [
      boroughRaw, block, reelPgFile, crfn, lot, partial,
      docDateRaw, recordedDateRaw, pages, party1Raw, party2Raw, party3Raw,
      amountRaw,
    ].join(' | ');

    transactions.push({
      crfn: crfn || undefined,
      documentId,
      reelPgFile: reelPgFile || undefined,
      recordedDate: recordedDate || undefined,
      docDate: docDate || undefined,
      docType,
      borough,
      block,
      lot,
      bbl: bbl || undefined,
      partial: partial || undefined,
      pages: pages || undefined,
      party1,
      party2,
      party3: party3 || undefined,
      amount: amount || undefined,
      corrected,
      rawLine,
      dedupeKey,
    });
  }

  warnings.push(`Extracted ${transactions.length} rows from HTML`);
  if (missingIdCount > 0) {
    warnings.push(`${missingIdCount} row(s) have no CRFN or Document ID`);
  }

  return { transactions, warnings };
}
