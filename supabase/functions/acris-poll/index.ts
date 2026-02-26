import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";
const ACRIS_MASTER_ID = "bnx9-e6tj";

const DEED_TYPES = ["DEED", "DEEDO", "ADED", "EXED", "RDED", "TORD"];
const MORTGAGE_TYPES = ["MTGE", "AGMT", "ASPM", "SMTG"];
const ALL_DOC_TYPES = [...DEED_TYPES, ...MORTGAGE_TYPES];

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const typeFilter = ALL_DOC_TYPES.map((t) => `'${t}'`).join(",");
    const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
    let url = `${NYC_DATA_BASE}/${ACRIS_MASTER_ID}.json?$select=${encodeURIComponent(`max(recorded_datetime) as max_dt`)}&$where=${encodeURIComponent(`doc_type in(${typeFilter})`)}`;
    if (appToken) url += `&$$app_token=${appToken}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return jsonResponse(
        { error: `Socrata returned ${res.status}`, newData: false },
        502
      );
    }

    const rows = await res.json();
    const latestSocrataDate =
      rows.length > 0 && rows[0].max_dt
        ? rows[0].max_dt.split("T")[0]
        : null;

    if (!latestSocrataDate) {
      return jsonResponse({
        newData: false,
        message: "Could not detect Socrata date",
      });
    }

    const { data: coverage } = await supabase
      .from("acris_data_coverage")
      .select("date_to")
      .eq("source", "socrata")
      .eq("borough", "all")
      .maybeSingle();

    const knownDate = coverage?.date_to || null;
    const hasNewData = !knownDate || latestSocrataDate > knownDate;

    if (hasNewData) {
      console.log(
        `[acris-poll] New data detected: Socrata=${latestSocrataDate}, known=${knownDate}. Triggering sync.`
      );

      const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/acris-sync`;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          mode: "socrata",
          source: "auto_poll",
        }),
      }).catch((err) =>
        console.error(`[acris-poll] Failed to trigger sync: ${err}`)
      );
    } else {
      console.log(
        `[acris-poll] No new data. Socrata=${latestSocrataDate}, known=${knownDate}`
      );
    }

    await supabase.from("acris_data_coverage").upsert(
      {
        source: "socrata",
        borough: "all",
        date_to: knownDate || latestSocrataDate,
        last_checked_at: new Date().toISOString(),
        metadata_json: {
          lastPollSocrataDate: latestSocrataDate,
          lastPollAt: new Date().toISOString(),
        },
      },
      { onConflict: "source,borough" }
    );

    return jsonResponse({
      newData: hasNewData,
      latestSocrataDate,
      knownDate,
      syncTriggered: hasNewData,
    });
  } catch (e) {
    console.error(`[acris-poll] Error: ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});
