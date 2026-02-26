const BOROUGH_MAP: Record<string, string> = {
  '1': '1', 'manhattan': '1', 'mn': '1', 'new york': '1',
  '2': '2', 'bronx': '2', 'bx': '2', 'the bronx': '2',
  '3': '3', 'brooklyn': '3', 'bk': '3', 'kings': '3',
  '4': '4', 'queens': '4', 'qn': '4',
  '5': '5', 'staten island': '5', 'si': '5', 'richmond': '5',
};

const DOC_TYPE_MAP: Record<string, string> = {
  deed: 'DEED',
  'warranty deed': 'DEED',
  mortgage: 'MTGE',
  mtge: 'MTGE',
  'satisfaction of mortgage': 'SAT',
  satisfaction: 'SAT',
  sat: 'SAT',
  assignment: 'ASST',
  asst: 'ASST',
  'ucc1': 'UCC1',
  'ucc3': 'UCC3',
  'lis pendens': 'LP',
  lp: 'LP',
  agreement: 'AGMT',
  agmt: 'AGMT',
  'memorandum of contract': 'MCON',
  mcon: 'MCON',
  'power of attorney': 'RPTT',
  rptt: 'RPTT',
  'real property transfer': 'RPTT',
  aded: 'ADED',
  'administrators deed': 'ADED',
  deedo: 'DEEDO',
  'deed, other': 'DEEDO',
  cdec: 'CDEC',
  'condo declaration': 'CDEC',
  al: 'AL&R',
  'al&r': 'AL&R',
  cntr: 'CNTR',
  contract: 'CNTR',
};

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export function normalizeName(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function normalizeDocType(raw: string): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  if (DOC_TYPE_MAP[key]) return DOC_TYPE_MAP[key];
  const upper = raw.trim().toUpperCase();
  if (Object.values(DOC_TYPE_MAP).includes(upper)) return upper;
  return upper;
}

export function normalizeBorough(raw: string): string {
  if (!raw) return '';
  const key = raw.trim().toLowerCase();
  return BOROUGH_MAP[key] ?? '';
}

function padDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function toISODate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, '').trim();

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return padDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  const usMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (usMatch) return padDate(+usMatch[3], +usMatch[1], +usMatch[2]);

  const namedMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (namedMatch) {
    const month = MONTH_MAP[namedMatch[1].toLowerCase()];
    if (month !== undefined) return padDate(+namedMatch[3], month + 1, +namedMatch[2]);
  }

  const dMonthY = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dMonthY) {
    const month = MONTH_MAP[dMonthY[2].toLowerCase()];
    if (month !== undefined) return padDate(+dMonthY[3], month + 1, +dMonthY[1]);
  }

  return null;
}

export function makeBBL(boro: string, block: string, lot: string): string {
  const b = normalizeBorough(boro);
  if (!b) return '';
  const blk = block?.trim().replace(/\D/g, '');
  const lt = lot?.trim().replace(/\D/g, '');
  if (!blk || !lt) return '';
  return `${b}${blk.padStart(5, '0')}${lt.padStart(4, '0')}`;
}
