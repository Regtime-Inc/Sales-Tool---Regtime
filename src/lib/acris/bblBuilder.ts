export function buildBbl(borough: number | string, block: string, lot: string): string {
  const boro = typeof borough === 'string' ? parseInt(borough, 10) : borough;
  if (isNaN(boro) || boro < 1 || boro > 5) return '';

  const blk = parseInt(block, 10);
  const lt = parseInt(lot, 10);
  if (isNaN(blk) || isNaN(lt)) return '';

  return `${boro}${blk.toString().padStart(5, '0')}${lt.toString().padStart(4, '0')}`;
}

export function parseBbl(bbl: string): { borough: string; block: string; lot: string } | null {
  const clean = bbl.replace(/\D/g, '').padStart(10, '0').slice(-10);
  if (clean.length !== 10) return null;

  const borough = clean.substring(0, 1);
  const block = clean.substring(1, 6);
  const lot = clean.substring(6, 10);

  if (parseInt(borough) < 1 || parseInt(borough) > 5) return null;
  return { borough, block, lot };
}

export const BOROUGH_NAMES: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

export const BOROUGH_CODES: Record<string, string> = {
  MN: '1', MANHATTAN: '1',
  BX: '2', BRONX: '2',
  BK: '3', BROOKLYN: '3',
  QN: '4', QUEENS: '4',
  SI: '5', 'STATEN ISLAND': '5',
};

export function resolveBoroughCode(input: string): string | null {
  const upper = input.toUpperCase().trim();
  if (/^[1-5]$/.test(upper)) return upper;
  return BOROUGH_CODES[upper] ?? null;
}
