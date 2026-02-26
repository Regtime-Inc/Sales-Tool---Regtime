import type { PageText, CoverSheetSignals, Signal, Evidence, UnitCountMention } from '../types';

const COVER_KEYWORDS = [
  'COVER SHEET', 'PROJECT INFORMATION', 'TITLE SHEET',
  'PROJECT SUMMARY', 'PROJECT DATA',
];

const DECLARED_UNIT_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /PROPOSED\s+(\d{1,4})\s+(?:NEW\s+)?(?:RESIDENTIAL\s+)?(?:DWELLING\s+)?UNITS?\b/i, group: 1 },
  { re: /(\d{1,4})\s+PROPOSED\s+(?:DWELLING\s+)?UNITS?\b/i, group: 1 },
  { re: /(\d{1,4})\s*[-]?\s*UNIT\s+(?:APARTMENT|RESIDENTIAL|DWELLING)\s+(?:BUILDING|PROJECT)/i, group: 1 },
  { re: /TOTAL\s+(?:NUMBER\s+OF\s+)?(?:RESIDENTIAL\s+)?(?:DWELLING\s+)?UNITS[:\s]*(\d{1,4})/i, group: 1 },
  { re: /(\d{1,4})\s+(?:NEW\s+)?(?:RESIDENTIAL\s+)?DWELLING\s+UNITS/i, group: 1 },
  { re: /(\d{1,4})\s+(?:NEW\s+)?RESIDENTIAL\s+UNITS/i, group: 1 },
  { re: /#?\s*(?:OF\s+)?UNITS[:\s]+(\d{1,4})/i, group: 1 },
  { re: /NUMBER\s+OF\s+UNITS[:\s]*(\d{1,4})/i, group: 1 },
  { re: /(?:CONTAINS|CONSISTING\s+OF|COMPRISING)\s+(\d{1,4})\s+(?:DWELLING\s+)?UNITS/i, group: 1 },
  { re: /DU[:\s]+(\d{1,4})/i, group: 1 },
  { re: /(\d{1,4})\s+DUs?\b/i, group: 1 },
];

const FLOORS_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /(\d{1,3})\s*(?:STORIES|STORY|FLOORS?)\s+(?:ABOVE|PLUS)/i, group: 1 },
  { re: /(?:STORIES|FLOORS?)[:\s]*(\d{1,3})/i, group: 1 },
  { re: /(\d{1,3})\s*[-]?\s*STORY/i, group: 1 },
];

const ZONE_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /ZONING\s*(?:DISTRICT)?[:\s]*((?:R|C|M)\d[\w-]*)/i, group: 1 },
  { re: /ZONE[:\s]*((?:R|C|M)\d[\w-]*)/i, group: 1 },
];

const LOT_AREA_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /(?:LOT|SITE|LAND)\s+(?:AREA|SIZE)[:\s]*([\d,]+)\s*(?:SF|SQ\.?\s*(?:FT)?|SQUARE\s+FEET)/i, group: 1 },
  { re: /(?:TAX\s+)?LOT\s+(?:AREA|SIZE)\s*(?:\(SF\))?[:\s]*([\d,]+)/i, group: 1 },
  { re: /LOT\s+AREA[:\s]*([\d,]+)/i, group: 1 },
];

const BLDG_AREA_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /(?:BUILDING|BLDG)\s+AREA[:\s]*([\d,]+)\s*(?:SF|SQ|SQFT)/i, group: 1 },
  { re: /GROSS\s+(?:FLOOR|BUILDING)\s+AREA[:\s]*([\d,]+)/i, group: 1 },
];

const FAR_PATTERNS: Array<{ re: RegExp; group: number }> = [
  { re: /(?:PROPOSED\s+)?(?:RESIDENTIAL\s+)?(?:FAR|FLOOR\s+AREA\s+RATIO)[:\s]*([\d.]+)/i, group: 1 },
  { re: /(?:MAX|MAXIMUM)\s+(?:ALLOWABLE\s+)?FAR[:\s]*([\d.]+)/i, group: 1 },
  { re: /FAR\s*=\s*([\d.]+)/i, group: 1 },
  { re: /BULK\s+(?:FAR|FLOOR\s+AREA\s+RATIO)[:\s]*([\d.]+)/i, group: 1 },
];

function isCoverPage(text: string): boolean {
  const upper = text.toUpperCase();
  return COVER_KEYWORDS.some((kw) => upper.includes(kw));
}

function extractSnippet(text: string, match: RegExpExecArray | RegExpMatchArray, radius = 30): string {
  const start = Math.max(0, match.index! - radius);
  const end = Math.min(text.length, match.index! + match[0].length + radius);
  return text.substring(start, end).replace(/\n/g, ' ').trim();
}

function runPatterns(
  pages: PageText[],
  patterns: Array<{ re: RegExp; group: number }>,
  sourceType: 'cover_sheet' | 'regex',
): Signal<number> | null {
  const coverPages = pages.filter((p) => isCoverPage(p.text));
  const searchPages = coverPages.length > 0 ? coverPages : pages;

  for (const { re, group } of patterns) {
    for (const page of searchPages) {
      const m = re.exec(page.text);
      if (m) {
        const val = parseFloat(m[group].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          return {
            value: val,
            confidence: coverPages.length > 0 ? 0.9 : 0.7,
            evidence: [{
              page: page.pageIndex,
              snippet: extractSnippet(page.text, m),
              sourceType,
              confidence: coverPages.length > 0 ? 0.9 : 0.7,
            }],
          };
        }
      }
    }
  }
  return null;
}

function runStringPatterns(
  pages: PageText[],
  patterns: Array<{ re: RegExp; group: number }>,
  sourceType: 'cover_sheet' | 'regex',
): Signal<string> | null {
  const coverPages = pages.filter((p) => isCoverPage(p.text));
  const searchPages = coverPages.length > 0 ? coverPages : pages;

  for (const { re, group } of patterns) {
    for (const page of searchPages) {
      const m = re.exec(page.text);
      if (m && m[group]) {
        return {
          value: m[group].trim(),
          confidence: coverPages.length > 0 ? 0.9 : 0.7,
          evidence: [{
            page: page.pageIndex,
            snippet: extractSnippet(page.text, m),
            sourceType,
            confidence: coverPages.length > 0 ? 0.9 : 0.7,
          }],
        };
      }
    }
  }
  return null;
}

export function collectUnitCountMentions(
  pages: PageText[],
  sourceType: 'cover_sheet' | 'regex',
): UnitCountMention[] {
  const mentions: UnitCountMention[] = [];
  const coverPages = pages.filter((p) => isCoverPage(p.text));
  const searchPages = coverPages.length > 0 ? coverPages : pages;
  const conf = coverPages.length > 0 ? 0.9 : 0.7;

  for (const { re } of DECLARED_UNIT_PATTERNS) {
    for (const page of searchPages) {
      const matches = page.text.matchAll(new RegExp(re.source, re.flags + (re.flags.includes('g') ? '' : 'g')));
      for (const m of matches) {
        const val = parseInt(m[1]?.replace(/,/g, '') ?? '', 10);
        if (!isNaN(val) && val >= 1 && val <= 500) {
          const snippet = page.text.substring(
            Math.max(0, m.index! - 30),
            Math.min(page.text.length, m.index! + m[0].length + 30),
          ).replace(/\n/g, ' ').trim();
          mentions.push({
            value: val,
            page: page.pageIndex,
            sourceType,
            snippet,
            confidence: conf,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.page}-${m.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractCoverSheetSignals(pages: PageText[]): CoverSheetSignals {
  const totalUnitsRaw = runPatterns(pages, DECLARED_UNIT_PATTERNS, 'cover_sheet');
  const totalUnits = totalUnitsRaw && totalUnitsRaw.value >= 1 && totalUnitsRaw.value <= 500
    ? totalUnitsRaw
    : null;

  return {
    totalUnits,
    floors: runPatterns(pages, FLOORS_PATTERNS, 'cover_sheet'),
    zone: runStringPatterns(pages, ZONE_PATTERNS, 'cover_sheet'),
    lotArea: runPatterns(pages, LOT_AREA_PATTERNS, 'cover_sheet'),
    buildingArea: runPatterns(pages, BLDG_AREA_PATTERNS, 'cover_sheet'),
    far: (() => {
      const sig = runPatterns(pages, FAR_PATTERNS, 'cover_sheet');
      return sig && sig.value >= 0.1 && sig.value <= 15 ? sig : null;
    })(),
  };
}
