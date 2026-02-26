const BOROUGH_NAMES: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

export function boroughName(code: string): string {
  return BOROUGH_NAMES[code] || code;
}

export function formatBbl(bbl: string): string {
  if (bbl.length !== 10) return bbl;
  return `${bbl[0]}-${bbl.slice(1, 6)}-${bbl.slice(6)}`;
}

export function isRealAcrisDocId(documentId: string): boolean {
  return /^\d{16}$/.test(documentId);
}

export function acrisPortalUrl(documentId: string): string {
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail/${encodeURIComponent(documentId)}`;
}

export const acrisDocumentUrl = acrisPortalUrl;

export function acrisImageUrl(documentId: string): string {
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentImageView?doc_id=${encodeURIComponent(documentId)}`;
}

export function acrisBblSearchUrl(bbl: string): string {
  if (bbl.length !== 10) return 'https://a836-acris.nyc.gov/DS/DocumentSearch/BBLSearch';
  const borough = bbl[0];
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6);
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/BBLResult?borough=${borough}&block=${block}&lot=${lot}`;
}

export function partyLabels(docType: string): [string, string] {
  const upper = docType.toUpperCase();
  if (['MTGE', 'AGMT', 'ASPM', 'SMTG'].includes(upper)) {
    return ['Borrower / Mortgagor', 'Lender / Mortgagee'];
  }
  if (['DEED', 'DEEDO', 'ADED', 'EXED', 'RDED', 'TORD'].includes(upper)) {
    return ['Grantor / Seller', 'Grantee / Buyer'];
  }
  return ['Party 1', 'Party 2'];
}

export function formatCurrency(amount: number | null): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}
