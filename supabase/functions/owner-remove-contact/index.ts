import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ContactEntry {
  value: string;
  source: string;
  confidence: number;
  updatedAt: string;
  evidence?: string;
}

function normalizeForDedup(value: string, type: string): string {
  if (type === "phone") return value.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  if (type === "email") return value.toLowerCase().trim();
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ownerId, contactType, value } = body as {
      ownerId: string;
      contactType: "phone" | "email" | "address";
      value: string;
    };

    if (!ownerId || !contactType || !value) {
      return new Response(
        JSON.stringify({ error: "ownerId, contactType, and value are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const columnMap: Record<string, string> = {
      phone: "phones",
      email: "emails",
      address: "addresses",
    };
    const column = columnMap[contactType];
    if (!column) {
      return new Response(
        JSON.stringify({ error: "contactType must be phone, email, or address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: owner, error: fetchErr } = await db
      .from("owner_entities")
      .select("id, phones, emails, addresses")
      .eq("id", ownerId)
      .maybeSingle();

    if (fetchErr || !owner) {
      return new Response(
        JSON.stringify({ error: fetchErr?.message || "Owner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existing: ContactEntry[] = (owner as Record<string, ContactEntry[]>)[column] || [];
    const normalizedTarget = normalizeForDedup(value, contactType);
    const filtered = existing.filter(
      (c) => normalizeForDedup(c.value, contactType) !== normalizedTarget
    );

    if (filtered.length === existing.length) {
      return new Response(
        JSON.stringify({ ok: true, message: "Contact not found, nothing removed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await db
      .from("owner_entities")
      .update({ [column]: filtered, updated_at: new Date().toISOString() })
      .eq("id", ownerId);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Contact removed", removed: existing.length - filtered.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-remove-contact error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
