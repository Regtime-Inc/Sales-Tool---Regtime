import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10), 100);

    if (!q || q.length < 2) {
      return new Response(
        JSON.stringify({ owners: [], error: "Query must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: rpcResults, error: rpcErr } = await db.rpc(
      "search_owner_entities",
      { query_text: q, max_results: limit }
    );

    if (rpcErr) {
      console.error("search_owner_entities RPC error:", rpcErr);

      const upperQ = q.toUpperCase();
      const { data: fallback } = await db
        .from("owner_entities")
        .select("id, canonical_name, entity_type, aliases, emails, phones, addresses")
        .or(`canonical_name.ilike.%${q}%`)
        .limit(limit);

      const owners = (fallback || []).map((row: Record<string, unknown>) => ({
        ...row,
        match_score: (row.canonical_name as string).toUpperCase().includes(upperQ) ? 0.8 : 0.4,
        property_count: 0,
      }));

      return new Response(
        JSON.stringify({ owners, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let owners = rpcResults || [];

    if (owners.length === 0) {
      const { data: discoverHits } = await db
        .from("discovery_cache")
        .select("bbl, owner_name, address, borough, zone_dist, lot_area, units_res")
        .ilike("owner_name", `%${q}%`)
        .limit(limit);

      if (discoverHits && discoverHits.length > 0) {
        const grouped = new Map<string, { name: string; bbls: string[]; addresses: string[] }>();
        for (const row of discoverHits) {
          const key = (row.owner_name as string).toUpperCase().trim();
          let entry = grouped.get(key);
          if (!entry) {
            entry = { name: row.owner_name as string, bbls: [], addresses: [] };
            grouped.set(key, entry);
          }
          entry.bbls.push(row.bbl as string);
          if (row.address) entry.addresses.push(row.address as string);
        }

        owners = [...grouped.values()].map((g) => ({
          id: `discovery_${g.bbls[0]}`,
          canonical_name: g.name,
          entity_type: /\b(LLC|LP|INC|CORP|TRUST|REALTY|HOLDINGS)\b/i.test(g.name) ? "org" : "unknown",
          aliases: [],
          emails: [],
          phones: [],
          addresses: g.addresses.length > 0
            ? [{ value: g.addresses[0], source: "discovery_cache", confidence: 0.6 }]
            : [],
          match_score: 0.7,
          property_count: g.bbls.length,
          source: "discovery_cache",
        }));
      }
    }

    return new Response(
      JSON.stringify({ owners }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-search error:", message);
    return new Response(
      JSON.stringify({ owners: [], error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
