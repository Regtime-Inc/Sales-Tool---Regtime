import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UNIT_TYPE_KEYS = ["studio", "br1", "br2", "br3", "br4plus"] as const;
const NULLABLE_NUMBER = { anyOf: [{ type: "number" }, { type: "null" }] };
const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] };

const SCHEMA = {
  type: "object",
  properties: {
    totals: {
      type: "object",
      properties: {
        totalUnits: NULLABLE_NUMBER,
        affordableUnits: NULLABLE_NUMBER,
        marketUnits: NULLABLE_NUMBER,
      },
      required: ["totalUnits", "affordableUnits", "marketUnits"],
      additionalProperties: false,
    },
    unitMix: {
      type: "object",
      properties: Object.fromEntries(
        UNIT_TYPE_KEYS.map((k) => [k, NULLABLE_NUMBER])
      ),
      required: [...UNIT_TYPE_KEYS],
      additionalProperties: false,
    },
    unitRecords: {
      type: "array",
      items: {
        type: "object",
        properties: {
          unitId: { type: "string" },
          areaSf: { type: "number" },
          bedroomType: { type: "string" },
          floor: NULLABLE_STRING,
        },
        required: ["unitId", "areaSf", "bedroomType", "floor"],
        additionalProperties: false,
      },
    },
    zoning: {
      type: "object",
      properties: {
        lotAreaSf: NULLABLE_NUMBER,
        zoningFloorAreaSf: NULLABLE_NUMBER,
        far: NULLABLE_NUMBER,
        zone: NULLABLE_STRING,
        maxFar: NULLABLE_NUMBER,
      },
      required: ["lotAreaSf", "zoningFloorAreaSf", "far", "zone", "maxFar"],
      additionalProperties: false,
    },
    building: {
      type: "object",
      properties: {
        floors: NULLABLE_NUMBER,
        buildingAreaSf: NULLABLE_NUMBER,
        block: NULLABLE_STRING,
        lot: NULLABLE_STRING,
        bin: NULLABLE_STRING,
        occupancyGroup: NULLABLE_STRING,
        constructionClass: NULLABLE_STRING,
        scopeOfWork: NULLABLE_STRING,
      },
      required: [
        "floors",
        "buildingAreaSf",
        "block",
        "lot",
        "bin",
        "occupancyGroup",
        "constructionClass",
        "scopeOfWork",
      ],
      additionalProperties: false,
    },
    confidence: {
      type: "object",
      properties: {
        overall: { type: "number" },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["overall", "warnings"],
      additionalProperties: false,
    },
  },
  required: [
    "totals",
    "unitMix",
    "unitRecords",
    "zoning",
    "building",
    "confidence",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a structured data extraction assistant for NYC architectural plan documents (DOB filings).

Your task: Given raw text extracted from architectural plan PDF pages, extract ALL project data into a structured JSON object.

Page types you may receive:
- COVER_SHEET: Title page with project stats (lot area, FAR, units, floors, zone, block/lot, BIN)
- ZONING: Zoning compliance/analysis tables (lot area, FAR calculations, floor area breakdowns)
- OCCUPANT_LOAD: Occupant load tables listing individual units with their areas in SF
- FLOOR_PLAN: Floor plan pages with unit labels and area callouts
- GENERAL: Other pages that may contain relevant data

Extraction rules:
- Extract EVERY individual unit you can find. Each unit should have: unitId (e.g. "1A", "2B"), areaSf (net area in square feet), bedroomType (STUDIO, 1BR, 2BR, 3BR, 4BR_PLUS, or UNKNOWN), floor (if determinable from unitId or context, e.g. "2" for Unit 2A).
- For bedroomType: infer from unit area if not explicitly stated. Typical NYC ranges: Studio < 500 SF, 1BR 500-700 SF, 2BR 700-1000 SF, 3BR 1000-1300 SF, 4BR+ > 1300 SF.
- For unit mix counts: count how many of each bedroom type appear in unitRecords.
- For zoning: extract lot area (SF), zoning floor area (SF), FAR, zone district, max FAR.
- For building: extract floors, total building area, block, lot, BIN, occupancy group, construction class, scope of work.
- Set any field to null if no evidence exists.
- NEVER invent or hallucinate values. Only extract what the text supports.
- Confidence should be 0.0-1.0 based on how much data you found vs expected.
- Add warnings for missing expected data, inconsistencies, or ambiguities.`;

interface PageInput {
  page: number;
  type: string;
  text: string;
}

interface RequestBody {
  pages: PageInput[];
  cityContext?: string;
}

interface UnitRecord {
  unitId: string;
  areaSf: number;
  bedroomType: string;
  floor: string | null;
}

interface Extraction {
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

function extractDeclaredUnits(pages: PageInput[]): number | null {
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

function sanitizeExtraction(parsed: Extraction, declaredUnits: number | null): Extraction {
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

async function callOpenAI(
  apiKey: string,
  pages: PageInput[],
  declaredUnits: number | null,
  cityContext?: string,
): Promise<Response> {
  const pageBlocks = pages
    .map(
      (p) =>
        `=== PAGE ${p.page} [${p.type}] ===\n${p.text.substring(0, 4000)}`
    )
    .join("\n\n");

  let preamble = "";
  if (declaredUnits !== null) {
    preamble = `Cover sheet indicates approximately ${declaredUnits} dwelling units. Do NOT return more than ${declaredUnits} unitRecords unless the pages explicitly list more dwelling units. Never treat TOTAL OCCUPANCY as a unit count.\n\n`;
  }
  if (cityContext) {
    preamble += `CITY DATA CONTEXT:\n${cityContext}\n\n`;
  }

  const userMessage = `${preamble}Extract all project data from these architectural plan pages:\n\n${pageBlocks}`;

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "plan_extraction",
          strict: true,
          schema: SCHEMA,
        },
      },
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "no_api_key",
          reason: "OPENAI_API_KEY secret is not configured",
          fallback: true,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: RequestBody = await req.json();
    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      return new Response(
        JSON.stringify({ error: "pages array is required and must be non-empty" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const declaredUnits = extractDeclaredUnits(body.pages);

    let openaiResp = await callOpenAI(apiKey, body.pages, declaredUnits, body.cityContext);

    if (openaiResp.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      openaiResp = await callOpenAI(apiKey, body.pages, declaredUnits, body.cityContext);
    }

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenAI error:", openaiResp.status, errText);
      const reason =
        openaiResp.status === 401
          ? "Invalid OpenAI API key"
          : openaiResp.status === 429
          ? "OpenAI rate limit exceeded after retry"
          : `OpenAI API error (${openaiResp.status})`;
      return new Response(
        JSON.stringify({ error: "llm_error", reason, fallback: true }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiData = await openaiResp.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({
          error: "empty_response",
          reason: "LLM returned empty content",
          fallback: true,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const parsed = JSON.parse(content);
    const sanitized = sanitizeExtraction(parsed, declaredUnits);

    return new Response(JSON.stringify({ extraction: sanitized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("llm-extract-plans error:", e);
    return new Response(
      JSON.stringify({
        error: "internal_error",
        reason: String(e),
        fallback: true,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
