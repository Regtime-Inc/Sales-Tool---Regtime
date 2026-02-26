import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";
const DOB_NOW_FILINGS_ID = "w9ak-ipjd";

const BOROUGH_NAMES: Record<string, string> = {
  "1": "MANHATTAN",
  "2": "BRONX",
  "3": "BROOKLYN",
  "4": "QUEENS",
  "5": "STATEN ISLAND",
};

function parseBbl(bbl: string): { borough: string; block: string; lot: string } | null {
  if (bbl.length !== 10) return null;
  return {
    borough: bbl[0],
    block: bbl.substring(1, 6),
    lot: bbl.substring(6, 10),
  };
}

interface FilingRecord {
  job_filing_number?: string;
  borough?: string;
  block?: string;
  lot?: string;
  owner_s_first_name?: string;
  owner_s_last_name?: string;
  owner_s_business_name?: string;
  owner_s_phone_number?: string;
  owner_s_street_name?: string;
  owner_s_city?: string;
  owner_s_state?: string;
  owner_s_zip_code?: string;
  filing_date?: string;
  [key: string]: unknown;
}

async function fetchFilingsForBbl(
  borough: string,
  block: string,
  lot: string
): Promise<FilingRecord[]> {
  const boroughName = BOROUGH_NAMES[borough];
  if (!boroughName) return [];

  const blockNum = String(parseInt(block, 10));
  const lotNum = String(parseInt(lot, 10));

  const where = `borough='${boroughName}' AND block='${blockNum}' AND lot='${lotNum}'`;
  const url = `${NYC_DATA_BASE}/${DOB_NOW_FILINGS_ID}.json?$where=${encodeURIComponent(where)}&$limit=50&$order=filing_date DESC`;

  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

function parseFilingDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedBbls = body.bbls as string[] | undefined;
    const ownerEntityId = body.owner_entity_id as string | undefined;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let bbls: string[];

    if (requestedBbls && requestedBbls.length > 0) {
      bbls = requestedBbls.slice(0, 50);
    } else {
      const { data: props } = await db
        .from("owner_entity_properties")
        .select("bbl")
        .limit(200);

      const uniqueBbls = new Set<string>();
      for (const p of props || []) {
        uniqueBbls.add(p.bbl);
      }
      bbls = [...uniqueBbls].slice(0, 100);
    }

    let totalInserted = 0;
    let totalFilings = 0;
    let eventsCreated = 0;
    const errors: string[] = [];
    const allFilingsByBbl: { bbl: string; filings: FilingRecord[] }[] = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < bbls.length; i += BATCH_SIZE) {
      const batch = bbls.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (bbl) => {
          const parsed = parseBbl(bbl);
          if (!parsed) return { bbl, filings: [] as FilingRecord[] };

          const filings = await fetchFilingsForBbl(
            parsed.borough,
            parsed.block,
            parsed.lot
          );
          return { bbl, filings };
        })
      );

      for (const { bbl, filings } of results) {
        totalFilings += filings.length;
        allFilingsByBbl.push({ bbl, filings });

        const rows = filings
          .filter((f) => f.job_filing_number)
          .map((f) => ({
            bbl,
            job_number: f.job_filing_number!,
            owner_type: "",
            first_name: (f.owner_s_first_name || "").trim(),
            middle_initial: "",
            last_name: (f.owner_s_last_name || "").trim(),
            business_name: (f.owner_s_business_name || "").trim(),
            title: "",
            email: "",
            phone: (f.owner_s_phone_number || "").replace(/\D/g, ""),
            address_line1: (f.owner_s_street_name || "").trim(),
            city: (f.owner_s_city || "").trim(),
            state: (f.owner_s_state || "").trim(),
            zip: (f.owner_s_zip_code || "").trim(),
            source: "dobnow_api_ingest",
            evidence_snippet: JSON.stringify({
              filing_date: f.filing_date,
              job_type: f.job_type,
              work_type: f.work_type,
            }).slice(0, 500),
          }));

        if (rows.length > 0) {
          const { error } = await db
            .from("dobnow_owner_contacts")
            .upsert(rows, { onConflict: "bbl,job_number" });

          if (error) {
            errors.push(`BBL ${bbl}: ${error.message}`);
          } else {
            totalInserted += rows.length;
          }
        }
      }
    }

    if (ownerEntityId) {
      const eventRows: {
        owner_entity_id: string;
        event_type: string;
        bbl: string;
        occurred_at: string;
        payload: Record<string, unknown>;
      }[] = [];

      for (const { bbl, filings } of allFilingsByBbl) {
        for (const f of filings) {
          if (!f.job_filing_number) continue;
          const filingDate = parseFilingDate(f.filing_date) || "1900-01-01";
          eventRows.push({
            owner_entity_id: ownerEntityId,
            event_type: "dobnow_job",
            bbl,
            occurred_at: filingDate,
            payload: {
              jobNumber: f.job_filing_number,
              source: "dobnow_api_ingest",
              jobType: f.job_type || undefined,
              workType: f.work_type || undefined,
              ownerName: f.owner_s_business_name ||
                [f.owner_s_first_name, f.owner_s_last_name].filter(Boolean).join(" "),
            },
          });
        }
      }

      const seen = new Map<string, (typeof eventRows)[number]>();
      for (const r of eventRows) {
        const key = `${r.bbl}|${r.occurred_at}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, r);
        } else {
          const prev = (existing.payload.jobNumber as string) || "";
          const cur = (r.payload.jobNumber as string) || "";
          if (cur && cur !== prev) {
            existing.payload = { ...existing.payload, jobNumber: prev, additionalJobs: cur };
          }
        }
      }
      const deduped = [...seen.values()];

      const CHUNK = 200;
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const { error } = await db
          .from("owner_entity_events")
          .upsert(deduped.slice(i, i + CHUNK), {
            onConflict: "owner_entity_id,event_type,bbl,occurred_at",
          });
        if (!error) eventsCreated += Math.min(CHUNK, deduped.length - i);
        else errors.push(`Events chunk: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        bbls_processed: bbls.length,
        filings_found: totalFilings,
        records_upserted: totalInserted,
        events_created: eventsCreated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("dobnow-ingest error:", message);
    return new Response(
      JSON.stringify({ status: "error", error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
