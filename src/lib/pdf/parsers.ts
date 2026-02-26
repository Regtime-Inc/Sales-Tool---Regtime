import type {
  ExtractedField,
  UnitScheduleRow,
  ZoningExtraction,
  ConversionExtraction,
  PdfExtraction,
  PositionedTextItem,
  UnitMixExtraction,
} from '../../types/pdf';
import { extractUnitMix } from './unitMixExtractor';

function field<T>(value: T, confidence: number, source: string, page: number | null = null): ExtractedField<T> {
  return { value, confidence, source, pageNumber: page };
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').replace(/\s/g, '').replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

const UNIT_TYPE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\bstudio\b/i, label: 'Studio' },
  { regex: /\b(?:1[- ]?br|1[- ]?bed(?:room)?|one[- ]?bed(?:room)?)\b/i, label: '1BR' },
  { regex: /\b(?:2[- ]?br|2[- ]?bed(?:room)?|two[- ]?bed(?:room)?)\b/i, label: '2BR' },
  { regex: /\b(?:3[- ]?br|3[- ]?bed(?:room)?|three[- ]?bed(?:room)?)\b/i, label: '3BR' },
  { regex: /\b(?:4[- ]?br|4[- ]?bed(?:room)?|four[- ]?bed(?:room)?)\b/i, label: '4BR' },
];

const NUMBER_REGEX = /[\d,]+(?:\.\d+)?/g;

const HEADER_KEYWORDS: Record<string, string> = {
  'nsf': 'nsf', 'net sf': 'nsf', 'net sq': 'nsf', 'net area': 'nsf',
  'gsf': 'gsf', 'gross sf': 'gsf', 'gross sq': 'gsf', 'gross area': 'gsf',
  'count': 'count', 'units': 'count', 'qty': 'count', '# units': 'count', 'no.': 'count',
  'rent': 'rent', 'monthly': 'rent', '$/mo': 'rent',
  'ami': 'ami', '% ami': 'ami',
};

interface ColumnMap {
  count?: number;
  nsf?: number;
  gsf?: number;
}

function detectHeaderColumns(lines: string[]): ColumnMap | null {
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasCount = /\b(count|units|qty|# ?units|no\.\s*of)\b/i.test(lower);
    const hasSf = /\b(nsf|gsf|net\s*sf|gross\s*sf|net\s*sq|gross\s*sq|net\s*area|gross\s*area)\b/i.test(lower);
    if (!hasCount && !hasSf) continue;

    const colMap: ColumnMap = {};
    for (const [keyword, role] of Object.entries(HEADER_KEYWORDS)) {
      const idx = lower.indexOf(keyword);
      if (idx === -1) continue;
      if (role === 'count' && colMap.count === undefined) colMap.count = idx;
      else if (role === 'nsf' && colMap.nsf === undefined) colMap.nsf = idx;
      else if (role === 'gsf' && colMap.gsf === undefined) colMap.gsf = idx;
    }
    if (colMap.count !== undefined || colMap.nsf !== undefined || colMap.gsf !== undefined) {
      return colMap;
    }
  }
  return null;
}

function classifyNumbers(parsedNums: number[]): { count: number; nsf: number | null; gsf: number | null } {
  if (parsedNums.length === 0) return { count: 1, nsf: null, gsf: null };

  const countCandidates = parsedNums.filter((n) => n >= 1 && n <= 500 && Number.isInteger(n));
  const sfCandidates = parsedNums.filter((n) => n >= 200 && n <= 3000);

  let count = 1;
  let nsf: number | null = null;
  let gsf: number | null = null;

  if (countCandidates.length > 0) {
    count = countCandidates[0];
  } else if (parsedNums[0] <= 500) {
    count = parsedNums[0];
  }

  const remainingSf = sfCandidates.filter((n) => n !== count);
  if (remainingSf.length >= 2) {
    const sorted = [...remainingSf].sort((a, b) => a - b);
    nsf = sorted[0];
    gsf = sorted[1];
  } else if (remainingSf.length === 1) {
    nsf = remainingSf[0];
  } else if (parsedNums.length > 1) {
    const afterCount = parsedNums.slice(parsedNums.indexOf(count) + 1);
    if (afterCount.length >= 1 && afterCount[0] >= 100) nsf = afterCount[0];
    if (afterCount.length >= 2 && afterCount[1] >= 100) gsf = afterCount[1];
  }

  if (nsf !== null && gsf !== null && nsf > gsf) {
    [nsf, gsf] = [gsf, nsf];
  }

  return { count, nsf, gsf };
}

export function extractUnitSchedule(
  text: string,
  pageTexts: string[]
): { rows: UnitScheduleRow[]; snippets: Array<{ page: number; text: string; target: string }> } {
  const rows: UnitScheduleRow[] = [];
  const snippets: Array<{ page: number; text: string; target: string }> = [];
  const lines = text.split('\n');

  detectHeaderColumns(lines);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (const utp of UNIT_TYPE_PATTERNS) {
      const typeMatch = utp.regex.exec(line);
      if (!typeMatch) continue;

      const afterType = line.substring(typeMatch.index + typeMatch[0].length);
      const nums = afterType.match(NUMBER_REGEX);
      if (!nums || nums.length === 0) continue;

      const pageNum = findPageForLine(line, pageTexts);
      const parsedNums = nums.map((n) => parseNumber(n)).filter((n): n is number => n !== null);

      if (parsedNums.length === 0) continue;

      const classified = classifyNumbers(parsedNums);

      const isAffordable = /\baffordable\b/i.test(line);
      const isMarket = /\bmarket\b/i.test(line);
      const tenure = isAffordable ? 'Affordable' : isMarket ? 'Market' : null;

      const conf = parsedNums.length >= 2 ? 0.85 : 0.65;

      rows.push({
        unitType: field(utp.label, 0.95, line.trim(), pageNum),
        count: field(Math.round(classified.count), conf, line.trim(), pageNum),
        nsf: classified.nsf !== null ? field(Math.round(classified.nsf), conf, line.trim(), pageNum) : null,
        gsf: classified.gsf !== null ? field(Math.round(classified.gsf), conf - 0.1, line.trim(), pageNum) : null,
        affordableOrMarket: tenure ? field(tenure, 0.8, line.trim(), pageNum) : null,
      });

      snippets.push({ page: pageNum ?? 0, text: line.trim(), target: 'unitSchedule' });
      break;
    }
  }

  return { rows, snippets };
}

const FAR_MIN = 0.1;
const FAR_MAX = 15.0;

type ZoningPatternConfig = {
  key: keyof ZoningExtraction;
  regex: RegExp;
  fieldType?: 'string';
};

const ZONING_PATTERNS: ZoningPatternConfig[] = [
  { key: 'lotArea', regex: /lot\s*area[:\s]*(?:approx\.?\s*)?([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft|square\s*feet)?/i },
  { key: 'far', regex: /(?:max(?:imum)?\s+)?\b(?:f\.?a\.?r\.?(?![a-z])|floor\s*area\s*ratio)[:\s]*([0-9,]+(?:\.\d+)?)/gi },
  { key: 'residFar', regex: /resid(?:ential)?\s*\b(?:f\.?a\.?r\.?(?![a-z])|floor\s*area\s*ratio)[:\s]*([0-9,]+(?:\.\d+)?)/gi },
  { key: 'zoningFloorArea', regex: /(?:zoning|max(?:imum)?|allowable)\s*(?:floor\s*area|zfa|gfa)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { key: 'proposedFloorArea', regex: /proposed\s*(?:floor\s*area|gfa|gsf|total\s*area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { key: 'totalUnits', regex: /(?:#\s*(?:of\s+)?units|number\s*of\s*(?:dwelling\s*)?units|(?:dwelling\s*)?units|#\s*of\s*(?:dwelling\s*)?units)[:\s]*(\d{1,4})\b/i },
  { key: 'buildingArea', regex: /(?:bldg|building)\s*area[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { key: 'floors', regex: /(?:#\s*(?:of\s+)?floors|number\s*of\s*(?:floors|stories)|stories)[:\s]*(\d{1,3})\b/i },
  { key: 'zoneDistrict', regex: /\bzone[:\s]*((?:R|C|M)\d{1,2}-\d[A-Z]?)\b/i, fieldType: 'string' },
  { key: 'bin', regex: /\bbin[:\s]*(\d{7})\b/i, fieldType: 'string' },
];

export function extractZoningAnalysis(
  text: string,
  pageTexts: string[]
): { zoning: ZoningExtraction; snippets: Array<{ page: number; text: string; target: string }> } {
  const zoning: ZoningExtraction = {
    lotArea: null,
    far: null,
    zoningFloorArea: null,
    proposedFloorArea: null,
    residFar: null,
    totalUnits: null,
    zoneDistrict: null,
    buildingArea: null,
    floors: null,
    bin: null,
  };
  const snippets: Array<{ page: number; text: string; target: string }> = [];

  const isFarField = (key: string) => key === 'far' || key === 'residFar';

  for (const pat of ZONING_PATTERNS) {
    if (isFarField(pat.key)) {
      pat.regex.lastIndex = 0;
      let best: { val: number; context: string } | null = null;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(text)) !== null) {
        const v = parseNumber(m[1]);
        if (v !== null && v >= FAR_MIN && v <= FAR_MAX) {
          best = { val: v, context: m[0] };
          break;
        }
      }
      if (best) {
        const page = findPageForLine(best.context, pageTexts);
        (zoning as unknown as Record<string, unknown>)[pat.key] = field(best.val, 0.8, best.context, page);
        snippets.push({ page: page ?? 0, text: best.context, target: 'zoningAnalysis' });
      }
    } else if (pat.fieldType === 'string') {
      const match = text.match(pat.regex);
      if (match && match[1]) {
        const context = match[0];
        const page = findPageForLine(context, pageTexts);
        (zoning as unknown as Record<string, unknown>)[pat.key] = field(match[1].trim(), 0.85, context, page);
        snippets.push({ page: page ?? 0, text: context, target: 'zoningAnalysis' });
      }
    } else {
      const match = text.match(pat.regex);
      if (match && match[1]) {
        const val = parseNumber(match[1]);
        if (val !== null) {
          const context = match[0];
          const page = findPageForLine(context, pageTexts);
          (zoning as unknown as Record<string, unknown>)[pat.key] = field(val, 0.8, context, page);
          snippets.push({ page: page ?? 0, text: context, target: 'zoningAnalysis' });
        }
      }
    }
  }

  return { zoning, snippets };
}

const NON_RESIDENTIAL_QUALIFIER = /(?:commercial|retail|landscaping|amenity|parking|mechanical)\s+/i;

const CONVERSION_PATTERNS: Array<{ key: keyof ConversionExtraction; regex: RegExp }> = [
  { key: 'preExistingArea', regex: /(?:pre[- ]?existing|existing)\s*(?:floor\s*area|area|building)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { key: 'newArea', regex: /new\s+(?:construction\s+|building\s+)?(?:floor\s*area|gross\s*area|net\s*area|construction\s*area|area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)/i },
  { key: 'totalArea', regex: /(?:total|overall)\s+(?:(?:residential|project|building)\s+)?(?:floor\s*area|area|project\s*area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)/i },
];

export function extractConversion(
  text: string,
  pageTexts: string[]
): { conversion: ConversionExtraction | null; snippets: Array<{ page: number; text: string; target: string }> } {
  const conversion: ConversionExtraction = {
    preExistingArea: null,
    newArea: null,
    totalArea: null,
  };
  const snippets: Array<{ page: number; text: string; target: string }> = [];
  let found = false;

  for (const pat of CONVERSION_PATTERNS) {
    const match = text.match(pat.regex);
    if (match && match[1]) {
      const matchedLine = match[0];
      if (NON_RESIDENTIAL_QUALIFIER.test(matchedLine)) continue;

      const val = parseNumber(match[1]);
      if (val !== null) {
        const page = findPageForLine(matchedLine, pageTexts);
        (conversion as unknown as Record<string, unknown>)[pat.key] = field(val, 0.75, matchedLine, page);
        snippets.push({ page: page ?? 0, text: matchedLine, target: 'conversion' });
        found = true;
      }
    }
  }

  if (found) {
    crossValidateConversion(conversion, snippets);
  }

  return { conversion: found ? conversion : null, snippets };
}

function crossValidateConversion(
  conversion: ConversionExtraction,
  snippets: Array<{ page: number; text: string; target: string }>
) {
  const pre = conversion.preExistingArea?.value;
  const nw = conversion.newArea?.value;
  const total = conversion.totalArea?.value;

  if (pre != null && nw != null && total != null) {
    const sum = pre + nw;
    const tolerance = total * 0.05;
    if (Math.abs(sum - total) <= tolerance) {
      if (conversion.preExistingArea) {
        conversion.preExistingArea = field(pre, Math.min(1, conversion.preExistingArea.confidence + 0.10), conversion.preExistingArea.source, conversion.preExistingArea.pageNumber);
      }
      if (conversion.newArea) {
        conversion.newArea = field(nw, Math.min(1, conversion.newArea.confidence + 0.10), conversion.newArea.source, conversion.newArea.pageNumber);
      }
      if (conversion.totalArea) {
        conversion.totalArea = field(total, Math.min(1, conversion.totalArea.confidence + 0.10), conversion.totalArea.source, conversion.totalArea.pageNumber);
      }
    } else {
      const fields = [
        { key: 'preExistingArea' as const, f: conversion.preExistingArea },
        { key: 'newArea' as const, f: conversion.newArea },
        { key: 'totalArea' as const, f: conversion.totalArea },
      ].filter((x) => x.f !== null);

      const weakest = fields.reduce((min, x) => (x.f!.confidence < min.f!.confidence ? x : min));
      if (weakest.f) {
        (conversion as unknown as Record<string, unknown>)[weakest.key] = field(
          weakest.f.value,
          Math.max(0.3, weakest.f.confidence - 0.15),
          weakest.f.source,
          weakest.f.pageNumber,
        );
      }

      snippets.push({
        page: 0,
        text: `Area values do not reconcile: ${pre?.toLocaleString()} + ${nw?.toLocaleString()} != ${total?.toLocaleString()}`,
        target: 'conversion',
      });
    }
  }
}

function findPageForLine(line: string, pageTexts: string[]): number | null {
  const needle = line.trim().substring(0, 60);
  for (let i = 0; i < pageTexts.length; i++) {
    if (pageTexts[i].includes(needle)) return i + 1;
  }
  return null;
}

export function assessTextYield(
  pageTexts: string[]
): { yield: 'high' | 'low' | 'none'; avgCharsPerPage: number } {
  if (pageTexts.length === 0) return { yield: 'none', avgCharsPerPage: 0 };
  const total = pageTexts.reduce((sum, p) => sum + p.length, 0);
  const avg = total / pageTexts.length;
  if (avg < 50) return { yield: 'none', avgCharsPerPage: avg };
  if (avg < 200) return { yield: 'low', avgCharsPerPage: avg };
  return { yield: 'high', avgCharsPerPage: avg };
}

export function buildExtraction(
  fullText: string,
  pageTexts: string[],
  pageCount: number,
  positionedItems?: Map<number, PositionedTextItem[]>
): PdfExtraction {
  const yieldInfo = assessTextYield(pageTexts);

  const { rows: unitSchedule, snippets: unitSnippets } = extractUnitSchedule(fullText, pageTexts);
  const { zoning: zoningAnalysis, snippets: zoningSnippets } = extractZoningAnalysis(fullText, pageTexts);
  const { conversion, snippets: conversionSnippets } = extractConversion(fullText, pageTexts);

  let unitMix: UnitMixExtraction | undefined;
  if (positionedItems && positionedItems.size > 0) {
    unitMix = extractUnitMix(positionedItems, pageTexts);
  }

  const rawSnippets = [...unitSnippets, ...zoningSnippets, ...conversionSnippets];

  if (unitMix) {
    for (const rec of unitMix.unitRecords.slice(0, 50)) {
      rawSnippets.push({
        page: rec.source.page,
        text: rec.source.evidence,
        target: 'unitMix',
      });
    }
  }

  const confidenceValues: number[] = [];
  for (const row of unitSchedule) {
    confidenceValues.push(row.unitType.confidence, row.count.confidence);
    if (row.nsf) confidenceValues.push(row.nsf.confidence);
  }
  const zoningFields = [zoningAnalysis.lotArea, zoningAnalysis.far, zoningAnalysis.zoningFloorArea, zoningAnalysis.proposedFloorArea, zoningAnalysis.residFar, zoningAnalysis.totalUnits, zoningAnalysis.buildingArea, zoningAnalysis.floors];
  for (const f of zoningFields) {
    if (f) confidenceValues.push(f.confidence);
  }
  if (unitMix && unitMix.confidence.overall > 0) {
    confidenceValues.push(unitMix.confidence.overall);
  }

  const overallConfidence = confidenceValues.length > 0
    ? Math.round((confidenceValues.reduce((s, v) => s + v, 0) / confidenceValues.length) * 100) / 100
    : 0;

  return {
    unitSchedule,
    zoningAnalysis,
    conversion,
    unitMix,
    overallConfidence,
    textYield: yieldInfo.yield,
    needsOcr: yieldInfo.yield === 'low' || yieldInfo.yield === 'none',
    pageCount,
    rawSnippets,
  };
}
