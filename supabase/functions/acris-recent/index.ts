import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOROUGH_CODES: Record<string, string> = {
  MN: "1", MANHATTAN: "1",
  BX: "2", BRONX: "2",
  BK: "3", BROOKLYN: "3",
  QN: "4", QUEENS: "4",
  SI: "5", "STATEN ISLAND": "5",
};

const VALID_SORT_COLUMNS = [
  "recorded_date", "amount", "doc_type", "borough", "party1", "party2", "bbl",
];

function resolveBoro(input: string): string | null {
  const upper = input.toUpperCase().trim();
  if (/^[1-5]$/.test(upper)) return upper;
  return BOROUGH_CODES[upper] ?? null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const boroRaw = url.searchParams.get("borough") || url.searchParams.get("boro") || "";
    const minAmount = parseFloat(url.searchParams.get("minAmount") || "0") || 0;
    const maxAmount = parseFloat(url.searchParams.get("maxAmount") || "0") || 0;
    const docTypesRaw = url.searchParams.get("docTypes") || "";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50") || 50, 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0") || 0, 0);
    const bbl = url.searchParams.get("bbl") || "";

    const dateFrom = url.searchParams.get("dateFrom") || "";
    const dateTo = url.searchParams.get("dateTo") || "";

    const sortByRaw = url.searchParams.get("sortBy") || "recorded_date";
    const sortDirRaw = url.searchParams.get("sortDir") || "desc";
    const sortBy = VALID_SORT_COLUMNS.includes(sortByRaw) ? sortByRaw : "recorded_date";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabase
      .from("acris_documents")
      .select("*", { count: "exact" });

    if (dateFrom && dateTo) {
      query = query.gte("recorded_date", dateFrom).lte("recorded_date", dateTo);
    } else if (dateFrom) {
      query = query.gte("recorded_date", dateFrom);
    } else if (dateTo) {
      query = query.lte("recorded_date", dateTo);
    } else {
      const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30") || 30, 1), 90);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.gte("recorded_date", cutoff.toISOString().split("T")[0]);
    }

    query = query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(offset, offset + limit - 1);

    if (boroRaw) {
      const boro = resolveBoro(boroRaw);
      if (!boro) {
        return jsonResponse({ error: `Invalid borough: ${boroRaw}` }, 400);
      }
      query = query.eq("borough", boro);
    }

    if (minAmount > 0) {
      query = query.gte("amount", minAmount);
    }

    if (maxAmount > 0) {
      query = query.lte("amount", maxAmount);
    }

    if (docTypesRaw) {
      const docTypes = docTypesRaw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0 && t.length <= 10);
      if (docTypes.length > 0) {
        query = query.in("doc_type", docTypes);
      }
    }

    if (bbl) {
      const cleanBbl = bbl.replace(/\D/g, "");
      if (cleanBbl.length === 10) {
        query = query.eq("bbl", cleanBbl);
      } else if (cleanBbl.length > 0) {
        query = query.like("bbl", `${cleanBbl}%`);
      }
    }

    const { data, count, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    const { data: syncLog } = await supabase
      .from("acris_sync_log")
      .select("completed_at")
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse({
      documents: data || [],
      total: count || 0,
      lastSyncAt: syncLog?.completed_at || null,
      query: { borough: boroRaw || null, minAmount, maxAmount, limit, offset, dateFrom, dateTo, sortBy, sortDir },
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
