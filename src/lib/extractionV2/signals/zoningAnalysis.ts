import type { PageText, ZoningSignals, Signal, UnitCountMention } from '../types';

const ZONING_GATE_KEYWORDS = [
  'FAR', 'LOT AREA', 'ZONING', 'FLOOR AREA RATIO', 'ZFA', 'USE GROUP',
  'ZONING FLOOR AREA', 'PERMITTED', 'PROPOSED',
];
const MIN_KEYWORD_MATCHES = 2;

const DU_PATTERNS = [
  /TOTAL\s+DWELLING\s+UNITS[:\s]*(\d{1,4})/i,
  /DU[:\s]+(\d{1,4})/i,
  /DWELLING\s+UNITS[:\s]*(\d{1,4})/i,
  /(?:TOTAL\s+)?(?:NO\.?\s+OF\s+)?UNITS[:\s]*(\d{1,4})/i,
  /RESIDENTIAL\s+UNITS[:\s]*(\d{1,4})/i,
  /(\d{1,4})\s+DUs?\b/i,
  /(?:TOTAL|MAX(?:IMUM)?)\s+(?:ALLOWABLE\s+)?UNITS[:\s]*(\d{1,4})/i,
  /PROPOSED\s+(\d{1,4})\s+(?:DWELLING\s+)?UNITS/i,
];

const LOT_AREA_PATTERNS = [
  /(?:LOT|SITE|LAND)\s+(?:AREA|SIZE)[:\s]*([\d,]+)\s*(?:SF|SQ\.?\s*(?:FT)?|SQUARE\s+FEET)?/i,
  /(?:TAX\s+)?LOT\s+(?:AREA|SIZE)\s*(?:\(SF\))?[:\s]*([\d,]+)/i,
  /SITE\s+AREA[:\s]*([\d,]+)/i,
];

const FAR_PATTERNS = [
  /(?:PROPOSED\s+)?(?:RESIDENTIAL\s+)?(?:FAR|FLOOR\s+AREA\s+RATIO)[:\s]*([\d.]+)/i,
  /(?:RESID(?:ENTIAL)?\.?\s+)?FAR[:\s]*([\d.]+)/i,
  /(?:MAX|MAXIMUM)\s+(?:ALLOWABLE\s+)?FAR[:\s]*([\d.]+)/i,
  /FAR\s*=\s*([\d.]+)/i,
  /BULK\s+(?:FAR|FLOOR\s+AREA\s+RATIO)[:\s]*([\d.]+)/i,
];

const ZFA_PATTERNS = [
  /(?:ZONING\s+)?FLOOR\s+AREA[:\s]*([\d,]+)\s*(?:SF|SQ|SQFT)?/i,
  /ZFA[:\s]*([\d,]+)/i,
  /TOTAL\s+(?:ZONING\s+)?FLOOR\s+AREA[:\s]*([\d,]+)/i,
];

const ZONE_PATTERNS = [
  /ZONING\s*(?:DISTRICT)?[:\s]*((?:R|C|M)\d[\w/-]*)/i,
  /(?:^|\s)ZONE[:\s]*((?:R|C|M)\d[\w/-]*)/i,
];

function isZoningPage(text: string): boolean {
  const upper = text.toUpperCase();
  let matches = 0;
  for (const kw of ZONING_GATE_KEYWORDS) {
    if (upper.includes(kw)) matches++;
    if (matches >= MIN_KEYWORD_MATCHES) return true;
  }
  return false;
}

function extractSnippet(text: string, match: RegExpExecArray, radius = 30): string {
  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  return text.substring(start, end).replace(/\n/g, ' ').trim();
}

function findNumeric(
  pages: PageText[],
  patterns: RegExp[],
): Signal<number> | null {
  for (const pattern of patterns) {
    for (const page of pages) {
      const m = pattern.exec(page.text);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          return {
            value: val,
            confidence: 0.85,
            evidence: [{
              page: page.pageIndex,
              snippet: extractSnippet(page.text, m),
              sourceType: 'zoning_text',
              confidence: 0.85,
            }],
          };
        }
      }
    }
  }
  return null;
}

export function collectZoningUnitMentions(pages: PageText[]): UnitCountMention[] {
  const zoningPages = pages.filter((p) => isZoningPage(p.text));
  if (zoningPages.length === 0) return [];

  const mentions: UnitCountMention[] = [];
  for (const pattern of DU_PATTERNS) {
    for (const page of zoningPages) {
      const matches = page.text.matchAll(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')));
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
            sourceType: 'zoning_text',
            snippet,
            confidence: 0.85,
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

export function extractZoningSignals(pages: PageText[]): ZoningSignals {
  const zoningPages = pages.filter((p) => isZoningPage(p.text));

  if (zoningPages.length === 0) {
    return {
      totalDwellingUnits: null,
      lotArea: null,
      far: null,
      zoningFloorArea: null,
      zone: null,
    };
  }

  const duSignal = findNumeric(zoningPages, DU_PATTERNS);
  const totalDwellingUnits =
    duSignal && duSignal.value >= 1 && duSignal.value <= 500 ? duSignal : null;

  const lotArea = findNumeric(zoningPages, LOT_AREA_PATTERNS);
  const farSignal = findNumeric(zoningPages, FAR_PATTERNS);
  const far = farSignal && farSignal.value >= 0.1 && farSignal.value <= 15 ? farSignal : null;
  const zoningFloorArea = findNumeric(zoningPages, ZFA_PATTERNS);

  let zone: Signal<string> | null = null;
  for (const pattern of ZONE_PATTERNS) {
    for (const page of zoningPages) {
      const m = pattern.exec(page.text);
      if (m && m[1]) {
        zone = {
          value: m[1].trim(),
          confidence: 0.85,
          evidence: [{
            page: page.pageIndex,
            snippet: extractSnippet(page.text, m),
            sourceType: 'zoning_text',
            confidence: 0.85,
          }],
        };
        break;
      }
    }
    if (zone) break;
  }

  return { totalDwellingUnits, lotArea, far, zoningFloorArea, zone };
}
