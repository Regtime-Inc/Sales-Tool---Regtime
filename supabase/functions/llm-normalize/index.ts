import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NULLABLE_NUMBER = { anyOf: [{ type: "number" }, { type: "null" }] };
const UNIT_SIZE_ARRAY = { type: "array", items: { type: "number" } };

const UNIT_TYPE_KEYS = ["studio", "br1", "br2", "br3", "br4plus"] as const;

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
      properties: {
        studio: NULLABLE_NUMBER,
        br1: NULLABLE_NUMBER,
        br2: NULLABLE_NUMBER,
        br3: NULLABLE_NUMBER,
        br4plus: NULLABLE_NUMBER,
      },
      required: ["studio", "br1", "br2", "br3", "br4plus"],
      additionalProperties: false,
    },
    unitSizes: {
      type: "object",
      properties: {
        byType: {
          type: "object",
          properties: Object.fromEntries(
            UNIT_TYPE_KEYS.map((k) => [k, UNIT_SIZE_ARRAY])
          ),
          required: [...UNIT_TYPE_KEYS],
          additionalProperties: false,
        },
        avgByType: {
          type: "object",
          properties: Object.fromEntries(
            UNIT_TYPE_KEYS.map((k) => [k, NULLABLE_NUMBER])
          ),
          required: [...UNIT_TYPE_KEYS],
          additionalProperties: false,
        },
      },
      required: ["byType", "avgByType"],
      additionalProperties: false,
    },
    zoning: {
      type: "object",
      properties: {
        lotAreaSf: NULLABLE_NUMBER,
        zoningFloorAreaSf: NULLABLE_NUMBER,
        far: NULLABLE_NUMBER,
      },
      required: ["lotAreaSf", "zoningFloorAreaSf", "far"],
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
  required: ["totals", "unitMix", "unitSizes", "zoning", "confidence"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a structured data extraction assistant for NYC real estate development documents.

Your task: Given extracted text fragments from architectural plan sheets, normalize them into a single structured JSON object.

Rules:
- Extract ONLY values supported by the provided evidence snippets.
- Set any field to null if no evidence exists for it.
- NEVER invent or hallucinate numeric values.
- For unit sizes, map bedroom types to these exact keys: studio, br1, br2, br3, br4plus.
  - byType: array of individual unit areas in SF for each key (empty array if none).
  - avgByType: average area in SF for each key (null if none).
- For zoning metrics, extract lot area in SF, zoning floor area in SF, and FAR.
- Compute confidence.overall between 0.0 and 1.0 based on how much evidence supports the output.
- Add warnings for any inconsistencies or missing data.`;

interface RequestBody {
  context: string;
  evidence: Array<{ field: string; page: number; method: string; snippet: string }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "no_api_key", reason: "OPENAI_API_KEY secret is not configured", fallback: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();
    if (!body.context) {
      return new Response(
        JSON.stringify({ error: "context is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userMessage = `Here is the extracted data from architectural plan sheets:\n\n${body.context}\n\nNormalize this into the required JSON structure.`;

    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "normalized_plan_extract",
              strict: true,
              schema: SCHEMA,
            },
          },
          temperature: 0.1,
          max_tokens: 2000,
        }),
      }
    );

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenAI error:", openaiResp.status, errText);
      const reason = openaiResp.status === 401
        ? "Invalid OpenAI API key"
        : openaiResp.status === 429
        ? "OpenAI rate limit exceeded"
        : `OpenAI API error (${openaiResp.status})`;
      return new Response(
        JSON.stringify({ error: "llm_error", reason, fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResp.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "empty_response", reason: "LLM returned empty content", fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(content);

    const normalized = {
      ...parsed,
      evidence: body.evidence || [],
    };

    return new Response(JSON.stringify({ normalized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("llm-normalize error:", e);
    return new Response(JSON.stringify({ error: "internal_error", reason: String(e), fallback: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
