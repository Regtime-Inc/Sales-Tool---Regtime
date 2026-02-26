interface PageInput {
  page: number;
  type: string;
  text: string;
}

interface UnitRecord {
  unitId: string;
  areaSf: number;
  bedroomType: string;
  floor: string | null;
}

export interface Extraction {
  totals: { totalUnits: number | null; affordableUnits: number | null; marketUnits: number | null };
  unitMix: { studio: number | null; br1: number | null; br2: number | null; br3: number | null; br4plus: number | null };
  unitRecords: UnitRecord[];
  zoning: Record<string, unknown>;
  building: Record<string, unknown>;
  confidence: { overall: number; warnings: string[] };
}

const DECLARED_UNIT_PATTERNS = [
  /#?\s*(?:OF\s+)?UNITS[:\s]+(\d{1,4})/i,
  /PROPOSED\s+(\d{1,4})\s*[-]?\s*UNIT/i,
  /(\d{1,4})\s*[-]?\s*UNIT\s+(?:APARTMENT|RESIDENTIAL|DWELLING)\s+(?:BUILDING|PROJECT)/i,
  /TOTAL\s+(?:DWELLING\s+)?UNITS[:\s]*(\d{1,4})/i,
  /(\d{1,4})\s+DWELLING\s+UNITS/i,
];

export function extractDeclaredUnits(pages: PageInput[]): number | null {
  const coverPages = pages.filter((p) => p.type === "COVER_SHEET");
  const searchPages = coverPages.length > 0 ? coverPages : pages;

  for (const pattern of DECLARED_UNIT_PATTERNS) {
    for (const page of searchPages) {
      const m = page.text.match(pattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 500) return n;
      }
    }
  }
  return null;
}

const NOISE_IDS = new Set([
  "BLOCK", "LOT", "BIN", "DATE", "TOTAL", "BUILDING", "FLOOR", "PROJECT",
  "ZONE", "ZONING", "FAR", "OCCUPANCY", "EGRESS", "CORRIDOR", "STAIRS",
  "STAIR", "HALLWAY", "LOBBY", "MECHANICAL", "STORAGE", "LAUNDRY",
  "CELLAR", "ROOF", "SUSTAINABLE", "COMMON", "COMMUNITY",
]);

const VALID_BEDROOM_TYPES = new Set(["STUDIO", "1BR", "2BR", "3BR", "4BR_PLUS", "UNKNOWN"]);

function deriveFloor(unitId: string): number {
  const upper = unitId.trim().toUpperCase();
  if (upper.startsWith("PH")) return 9999;
  const leadDigits = upper.match(/^(\d+)/);
  if (leadDigits) return parseInt(leadDigits[1], 10);
  return 5000;
}

export function sanitizeExtraction(parsed: Extraction, declaredUnits: number | null): Extraction {
  let records: UnitRecord[] = Array.isArray(parsed.unitRecords) ? parsed.unitRecords : [];

  const seen = new Set<string>();
  records = records.filter((r) => {
    const key = r.unitId.trim().toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  records = records.filter((r) => {
    if (r.areaSf < 150 || r.areaSf > 5000) return false;
    const key = r.unitId.trim().toUpperCase();
    if (NOISE_IDS.has(key)) return false;
    return true;
  });

  const before = records.length;
  let capped = false;

  if (declaredUnits !== null && records.length > declaredUnits * 1.5) {
    records.sort((a, b) => {
      const fa = deriveFloor(a.unitId);
      const fb = deriveFloor(b.unitId);
      if (fa !== fb) return fa - fb;
      return a.unitId.trim().toUpperCase().localeCompare(b.unitId.trim().toUpperCase());
    });
    records = records.slice(0, declaredUnits);
    capped = true;
  }

  const result: Extraction = {
    totals: { ...parsed.totals },
    unitMix: { ...parsed.unitMix },
    unitRecords: records,
    zoning: parsed.zoning,
    building: parsed.building,
    confidence: {
      overall: parsed.confidence?.overall ?? 0.5,
      warnings: [...(parsed.confidence?.warnings ?? [])],
    },
  };

  if (capped) {
    result.totals.totalUnits = declaredUnits;

    const counts: Record<string, number> = { studio: 0, br1: 0, br2: 0, br3: 0, br4plus: 0 };
    for (const r of records) {
      const bt = r.bedroomType?.toUpperCase() ?? "UNKNOWN";
      if (bt === "STUDIO") counts.studio++;
      else if (bt === "1BR") counts.br1++;
      else if (bt === "2BR") counts.br2++;
      else if (bt === "3BR") counts.br3++;
      else if (bt === "4BR_PLUS") counts.br4plus++;
    }
    result.unitMix = {
      studio: counts.studio || null,
      br1: counts.br1 || null,
      br2: counts.br2 || null,
      br3: counts.br3 || null,
      br4plus: counts.br4plus || null,
    };

    result.confidence.warnings.push(
      `LLM unitRecords (${before}) exceeded cover-sheet units (${declaredUnits}); capped to ${declaredUnits}. Verify schedule.`
    );
    result.confidence.overall = Math.min(result.confidence.overall, 0.6);
  }

  for (const r of result.unitRecords) {
    if (!VALID_BEDROOM_TYPES.has(r.bedroomType)) {
      r.bedroomType = "UNKNOWN";
    }
  }

  return result;
}
