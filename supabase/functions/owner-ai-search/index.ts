import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AiExpansion {
  expanded_names: string[];
  entity_type_guess: "person" | "org" | "unknown";
  must_include_tokens: string[];
  must_exclude_tokens: string[];
}

async function expandQueryWithAI(query: string): Promise<AiExpansion> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      expanded_names: [query],
      entity_type_guess: "unknown",
      must_include_tokens: [],
      must_exclude_tokens: [],
    };
  }

  const systemPrompt = `You are an NYC real estate entity name resolver. Given a search query for an owner or developer, expand it into likely name variants. Consider:
- LLC/Corp/Inc suffixes and their absence
- Common abbreviations (Assoc, Mgmt, Dev, Props, etc.)
- First/Last name order swaps for people
- "The" prefix presence/absence
- Spelling out abbreviations and vice versa (e.g., "NY" <-> "NEW YORK")
- Common DBA (doing business as) patterns

Return ONLY a JSON object with this exact structure:
{
  "expanded_names": ["VARIANT 1", "VARIANT 2", ...],
  "entity_type_guess": "person" | "org" | "unknown",
  "must_include_tokens": ["TOKEN1"],
  "must_exclude_tokens": []
}

IMPORTANT: Only suggest plausible name variants. Do NOT invent company names that don't relate to the query. Keep expanded_names under 8 entries.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("OpenAI API error:", res.status, await res.text());
      return {
        expanded_names: [query],
        entity_type_guess: "unknown",
        must_include_tokens: [],
        must_exclude_tokens: [],
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");

    const parsed = JSON.parse(content) as AiExpansion;
    if (!Array.isArray(parsed.expanded_names)) {
      parsed.expanded_names = [query];
    }
    if (!parsed.expanded_names.includes(query.toUpperCase())) {
      parsed.expanded_names.unshift(query.toUpperCase());
    }
    return parsed;
  } catch (err) {
    console.error("AI expansion failed:", err);
    return {
      expanded_names: [query],
      entity_type_guess: "unknown",
      must_include_tokens: [],
      must_exclude_tokens: [],
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const query = (body.query || "").trim();

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ owners: [], expansion: null, error: "Query too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expansion = await expandQueryWithAI(query);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const allResults = new Map<string, { owner: Record<string, unknown>; score: number }>();

    for (const name of expansion.expanded_names) {
      const { data: results } = await db.rpc("search_owner_entities", {
        query_text: name,
        max_results: 15,
      });

      if (results) {
        for (const row of results) {
          const existing = allResults.get(row.id);
          if (!existing || row.match_score > existing.score) {
            allResults.set(row.id, { owner: row, score: row.match_score });
          }
        }
      }
    }

    if (allResults.size === 0) {
      for (const name of expansion.expanded_names) {
        const { data: fallback } = await db
          .from("owner_entities")
          .select("id, canonical_name, entity_type, aliases, emails, phones, addresses")
          .or(`canonical_name.ilike.%${name}%`)
          .limit(10);

        if (fallback) {
          for (const row of fallback) {
            if (!allResults.has(row.id)) {
              allResults.set(row.id, {
                owner: { ...row, match_score: 0.3, property_count: 0 },
                score: 0.3,
              });
            }
          }
        }
      }
    }

    let owners = [...allResults.values()]
      .sort((a, b) => b.score - a.score)
      .map((r) => r.owner);

    if (expansion.must_include_tokens.length > 0) {
      const upper = expansion.must_include_tokens.map((t) => t.toUpperCase());
      owners = owners.filter((o) => {
        const name = ((o.canonical_name as string) || "").toUpperCase();
        return upper.every((t) => name.includes(t));
      });
    }

    if (expansion.must_exclude_tokens.length > 0) {
      const upper = expansion.must_exclude_tokens.map((t) => t.toUpperCase());
      owners = owners.filter((o) => {
        const name = ((o.canonical_name as string) || "").toUpperCase();
        return !upper.some((t) => name.includes(t));
      });
    }

    return new Response(
      JSON.stringify({
        owners: owners.slice(0, 25),
        expansion: {
          expanded_names: expansion.expanded_names,
          entity_type_guess: expansion.entity_type_guess,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-ai-search error:", message);
    return new Response(
      JSON.stringify({ owners: [], expansion: null, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
