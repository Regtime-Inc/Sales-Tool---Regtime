import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function extractDomain(urlOrDomain: string): string | null {
  let input = urlOrDomain.trim();
  if (!input) return null;
  if (!input.includes("://")) input = "https://" + input;
  try {
    let hostname = new URL(input).hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, "");
    if (!hostname.includes(".")) return null;
    return hostname;
  } catch {
    const cleaned = urlOrDomain.toLowerCase().replace(/^www\./, "").trim();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) return cleaned;
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const ownerId: string = body.ownerId || "";
    const website: string = body.website || "";

    if (!ownerId) {
      return new Response(
        JSON.stringify({ error: "ownerId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!website.trim()) {
      return new Response(
        JSON.stringify({ error: "website is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = extractDomain(website);
    if (!domain) {
      return new Response(
        JSON.stringify({ error: "Invalid website/domain format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: owner, error: fetchErr } = await db
      .from("owner_entities")
      .select("id")
      .eq("id", ownerId)
      .maybeSingle();

    if (fetchErr || !owner) {
      return new Response(
        JSON.stringify({ error: fetchErr?.message || "Owner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await db
      .from("owner_entities")
      .update({ website: domain, updated_at: new Date().toISOString() })
      .eq("id", ownerId);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, domain }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-update-website error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
