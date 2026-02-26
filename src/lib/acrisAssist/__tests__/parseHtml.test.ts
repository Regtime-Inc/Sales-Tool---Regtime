// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAcrisHtml } from '../parseHtml';

function buildHtml(rows: string[], hiddenDocType = 'DEED'): string {
  const header = `
    <html><body>
    <form>
      <input type="hidden" name="hid_doctype" value="${hiddenDocType}">
    </form>
    <table>
      <tr bgcolor="#99CCFF">
        <td><b>View</b></td><td><b>Borough</b></td><td><b>Block</b></td>
        <td><b>Reel/Pg/File</b></td><td><b>CRFN</b></td><td><b>Lot</b></td>
        <td><b>Partial</b></td><td><b>Doc Date</b></td><td><b>Recorded/Filed</b></td>
        <td><b>Pages</b></td><td><b>Party1</b></td><td><b>Party2</b></td>
        <td><b>Party3</b></td><td><b>More</b></td><td><b>Corrected</b></td>
        <td><b>Doc Amount</b></td>
      </tr>
      ${rows.join('\n')}
    </table>
    </body></html>
  `;
  return header;
}

function makeRow(opts: {
  bg?: string;
  docId?: string;
  borough?: string;
  block?: string;
  reelPg?: string;
  crfn?: string;
  lot?: string;
  partial?: string;
  docDate?: string;
  recordedDate?: string;
  pages?: string;
  party1?: string;
  party2?: string;
  party3?: string;
  moreParty?: boolean;
  corrected?: boolean;
  amount?: string;
} = {}): string {
  const bg = opts.bg || '#FFFFFF';
  const onclick = opts.docId ? `onclick="JavaScript:go_detail('${opts.docId}')"` : '';
  const moreImg = opts.moreParty ? '<img src="check.gif">' : '';
  const corrImg = opts.corrected ? '<img src="check.gif">' : '';
  return `<tr bgcolor="${bg}">
    <td><a ${onclick}>View</a></td>
    <td>${opts.borough || 'BROOKLYN'}</td>
    <td>${opts.block || '01234'}</td>
    <td>${opts.reelPg || ''}</td>
    <td>${opts.crfn || ''}</td>
    <td>${opts.lot || '0056'}</td>
    <td>${opts.partial || 'ENTIRE LOT'}</td>
    <td>${opts.docDate || '02/15/2026'}</td>
    <td>${opts.recordedDate || '02/19/2026'}</td>
    <td>${opts.pages || '3'}</td>
    <td>${opts.party1 || 'SMITH, JOHN'}</td>
    <td>${opts.party2 || 'DOE, JANE'}</td>
    <td>${opts.party3 || ''}</td>
    <td>${moreImg}</td>
    <td>${corrImg}</td>
    <td>${opts.amount || '1,500,000'}</td>
  </tr>`;
}

describe('parseAcrisHtml', () => {
  it('extracts rows from well-formed ACRIS HTML', () => {
    const html = buildHtml([
      makeRow({ docId: '2026021900786001', crfn: 'CRFN0001' }),
      makeRow({ bg: '#C6E2FF', docId: '2026021900786002', crfn: 'CRFN0002', borough: 'QUEENS', block: '05678', lot: '0099', amount: '2,000,000' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].documentId).toBe('2026021900786001');
    expect(result.transactions[0].crfn).toBe('CRFN0001');
    expect(result.transactions[1].borough).toBe('4');
    expect(result.transactions[1].block).toBe('05678');
    expect(result.transactions[1].lot).toBe('0099');
    expect(result.transactions[1].amount).toBe('2000000');
  });

  it('normalizes borough names to codes', () => {
    const html = buildHtml([
      makeRow({ borough: 'MANHATTAN', docId: '001' }),
      makeRow({ bg: '#C6E2FF', borough: 'BRONX', docId: '002' }),
      makeRow({ borough: 'BROOKLYN', docId: '003' }),
      makeRow({ bg: '#C6E2FF', borough: 'QUEENS', docId: '004' }),
      makeRow({ borough: 'STATEN ISLAND', docId: '005' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions.map(t => t.borough)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('converts US date format to ISO', () => {
    const html = buildHtml([
      makeRow({ docId: '001', docDate: '01/15/2026', recordedDate: '02/19/2026' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].docDate).toBe('2026-01-15');
    expect(result.transactions[0].recordedDate).toBe('2026-02-19');
  });

  it('strips commas and dollar signs from amounts', () => {
    const html = buildHtml([
      makeRow({ docId: '001', amount: '143,000,000' }),
      makeRow({ bg: '#C6E2FF', docId: '002', amount: '$500,000' }),
      makeRow({ docId: '003', amount: '0' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].amount).toBe('143000000');
    expect(result.transactions[1].amount).toBe('500000');
    expect(result.transactions[2].amount).toBe('0');
  });

  it('extracts doc type from hidden form field', () => {
    const html = buildHtml([makeRow({ docId: '001' })], 'MTGE');
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].docType).toBe('MTGE');
    expect(result.warnings.some(w => w.includes('MTGE'))).toBe(true);
  });

  it('extracts documentId from onclick attribute', () => {
    const html = buildHtml([
      makeRow({ docId: '2026021900786003' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].documentId).toBe('2026021900786003');
  });

  it('detects corrected flag from check.gif', () => {
    const html = buildHtml([
      makeRow({ docId: '001', corrected: false }),
      makeRow({ bg: '#C6E2FF', docId: '002', corrected: true }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].corrected).toBe(false);
    expect(result.transactions[1].corrected).toBe(true);
  });

  it('computes BBL from borough/block/lot', () => {
    const html = buildHtml([
      makeRow({ docId: '001', borough: 'BROOKLYN', block: '1234', lot: '56' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].bbl).toBe('3012340056');
  });

  it('generates dedupeKey from CRFN+BBL when available', () => {
    const html = buildHtml([
      makeRow({ docId: '001', crfn: 'CRFN_ABC123', borough: 'BROOKLYN', block: '01234', lot: '0056' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].dedupeKey).toBe('CRFN_ABC123|3012340056');
  });

  it('generates dedupeKey from documentId when CRFN missing', () => {
    const html = buildHtml([
      makeRow({ docId: '2026021900786099' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].dedupeKey).toBe('2026021900786099');
  });

  it('deduplicates rows with same CRFN', () => {
    const html = buildHtml([
      makeRow({ docId: '001', crfn: 'DUP_CRFN' }),
      makeRow({ bg: '#C6E2FF', docId: '002', crfn: 'DUP_CRFN' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(1);
  });

  it('deduplicates rows with same CRFN and same BBL but different docIds', () => {
    const html = buildHtml([
      makeRow({ docId: '001', crfn: 'CRFN_SAME', borough: 'BROOKLYN', block: '01234', lot: '0056' }),
      makeRow({ bg: '#C6E2FF', docId: '002', crfn: 'CRFN_SAME', borough: 'BROOKLYN', block: '01234', lot: '0056' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].documentId).toBe('001');
  });

  it('preserves rows with same CRFN but different BBLs', () => {
    const html = buildHtml([
      makeRow({ docId: '001', crfn: 'CRFN_MULTI', borough: 'BROOKLYN', block: '01234', lot: '0056' }),
      makeRow({ bg: '#C6E2FF', docId: '002', crfn: 'CRFN_MULTI', borough: 'BROOKLYN', block: '01234', lot: '0099' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].lot).toBe('0056');
    expect(result.transactions[1].lot).toBe('0099');
  });

  it('handles empty HTML with no data rows', () => {
    const html = '<html><body><table><tr><td>No results</td></tr></table></body></html>';
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('No data rows'))).toBe(true);
  });

  it('normalizes party names to title case', () => {
    const html = buildHtml([
      makeRow({ docId: '001', party1: 'SMITH, JOHN Q', party2: 'doe, jane r' }),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.transactions[0].party1).toBe('Smith, John Q');
    expect(result.transactions[0].party2).toBe('Doe, Jane R');
  });

  it('warns about rows missing CRFN and document ID', () => {
    const html = buildHtml([
      makeRow({}),
    ]);
    const result = parseAcrisHtml(html);
    expect(result.warnings.some(w => w.includes('no CRFN or Document ID'))).toBe(true);
  });

  it('ignores non-data rows (header rows, etc)', () => {
    const html = `
      <html><body>
      <input type="hidden" name="hid_doctype" value="DEED">
      <table>
        <tr bgcolor="#99CCFF"><td>Header</td></tr>
        ${makeRow({ docId: '001' })}
        <tr><td colspan="16">Footer</td></tr>
      </table>
      </body></html>
    `;
    const result = parseAcrisHtml(html);
    expect(result.transactions).toHaveLength(1);
  });

  it('handles multiple files by merging results', () => {
    const html1 = buildHtml([makeRow({ docId: '001', crfn: 'A' })]);
    const html2 = buildHtml([makeRow({ docId: '002', crfn: 'B' })]);
    const r1 = parseAcrisHtml(html1);
    const r2 = parseAcrisHtml(html2);
    expect(r1.transactions).toHaveLength(1);
    expect(r2.transactions).toHaveLength(1);
    expect(r1.transactions[0].dedupeKey).not.toBe(r2.transactions[0].dedupeKey);
  });
});
