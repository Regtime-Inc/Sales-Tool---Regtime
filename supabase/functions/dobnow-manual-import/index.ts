import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function normalize(val: string): string {
  const trimmed = val.trim();
  if (/^not\s+applicable$/i.test(trimmed)) return "";
  if (/^n\/?a$/i.test(trimmed)) return "";
  return trimmed;
}

const LABEL_MAP: Record<string, string> = {
  "owner type": "owner_type",
  "type of owner": "owner_type",
  "first name": "first_name",
  "middle initial": "middle_initial",
  "middle name": "middle_initial",
  "last name": "last_name",
  "business name": "business_name",
  "owner business name": "business_name",
  "title": "title",
  "email": "email",
  "email address": "email",
  "telephone number": "phone",
  "telephone": "phone",
  "phone": "phone",
  "phone number": "phone",
  "street address": "address_line1",
  "address": "address_line1",
  "owner street address": "address_line1",
  "city": "city",
  "state": "state",
  "zip": "zip",
  "zip code": "zip",
  "zipcode": "zip",
};

function parseOwnerBlock(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t/g, "  ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const colonMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (colonMatch) {
      const rawLabel = colonMatch[1].replace(/\*+/g, "").trim().toLowerCase();
      const rawValue = colonMatch[2].trim();
      const field = LABEL_MAP[rawLabel];
      if (field) {
        const val = normalize(rawValue);
        if (val) result[field] = field === "phone" ? val.replace(/\D/g, "") : val;
        continue;
      }
    }

    const tabSplit = line.split(/\s{2,}/);
    if (tabSplit.length >= 2) {
      for (let i = 0; i < tabSplit.length - 1; i += 2) {
        const rawLabel = tabSplit[i].replace(/\*+/g, "").trim().toLowerCase();
        const rawValue = (tabSplit[i + 1] || "").trim();
        const field = LABEL_MAP[rawLabel];
        if (field) {
          const val = normalize(rawValue);
          if (val) result[field] = field === "phone" ? val.replace(/\D/g, "") : val;
        }
      }
    }
  }

  if (!result.email) {
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/i);
    if (emailMatch) result.email = emailMatch[0];
  }

  if (!result.phone) {
    const phoneMatch = text.match(/\b(\d[\d\s().-]{8,}\d)\b/);
    if (phoneMatch) {
      const digits = phoneMatch[1].replace(/\D/g, "");
      if (digits.length >= 10) result.phone = digits;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { jobNumber, bbl, text } = await req.json();

    if (!jobNumber || !bbl || !text) {
      return new Response(
        JSON.stringify({ error: "jobNumber, bbl, and text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = parseOwnerBlock(text);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const row = {
      bbl,
      job_number: jobNumber,
      owner_type: parsed.owner_type || "",
      first_name: parsed.first_name || "",
      middle_initial: parsed.middle_initial || "",
      last_name: parsed.last_name || "",
      business_name: parsed.business_name || "",
      title: parsed.title || "",
      email: parsed.email || "",
      phone: parsed.phone || "",
      address_line1: parsed.address_line1 || "",
      city: parsed.city || "",
      state: parsed.state || "",
      zip: parsed.zip || "",
      source: "dobnow_manual_import",
      evidence_snippet: text.slice(0, 500),
    };

    const { data, error } = await supabase
      .from("dobnow_owner_contacts")
      .upsert(row, { onConflict: "bbl,job_number" })
      .select()
      .maybeSingle();

    if (error) throw error;

    await supabase
      .from("stakeholder_cache")
      .update({ expires_at: new Date().toISOString() })
      .eq("bbl", bbl);

    await supabase
      .from("analysis_cache")
      .update({ expires_at: new Date().toISOString() })
      .eq("bbl", bbl);

    return new Response(
      JSON.stringify({ success: true, parsed: row, record: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
