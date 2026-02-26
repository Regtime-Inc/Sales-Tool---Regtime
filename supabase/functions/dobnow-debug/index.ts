import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";
const DOB_NOW_FILINGS_ID = "w9ak-ipjd";
const DOB_NOW_APPROVED_ID = "rbx6-tga4";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const job = url.searchParams.get("job");

    if (!job) {
      return new Response(
        JSON.stringify({ error: "Missing ?job= parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseJob = job.split("-")[0];

    const filingsUrl = `${NYC_DATA_BASE}/${DOB_NOW_FILINGS_ID}.json?$where=job_filing_number='${encodeURIComponent(job)}' OR job_filing_number like '${encodeURIComponent(baseJob)}%25'&$limit=5`;
    const approvedUrl = `${NYC_DATA_BASE}/${DOB_NOW_APPROVED_ID}.json?$where=job_filing_number like '${encodeURIComponent(baseJob)}%25'&$limit=5`;

    const [filingsRes, approvedRes] = await Promise.all([
      fetch(filingsUrl),
      fetch(approvedUrl),
    ]);

    const filingsRaw = await filingsRes.json();
    const approvedRaw = await approvedRes.json();

    const ownerFieldsInFilings = (filingsRaw || []).map((r: any) => {
      const keys = Object.keys(r).filter(
        (k) =>
          k.includes("owner") ||
          k.includes("email") ||
          k.includes("phone") ||
          k.includes("telephone") ||
          k === "city" ||
          k === "state" ||
          k === "zip"
      );
      const subset: Record<string, any> = {};
      for (const k of keys) subset[k] = r[k];
      return {
        job_filing_number: r.job_filing_number,
        all_owner_fields: subset,
        all_field_names: Object.keys(r).sort(),
      };
    });

    const ownerFieldsInApproved = (approvedRaw || []).map((r: any) => {
      const keys = Object.keys(r).filter(
        (k) =>
          k.includes("owner") ||
          k.includes("email") ||
          k.includes("phone")
      );
      const subset: Record<string, any> = {};
      for (const k of keys) subset[k] = r[k];
      return {
        job_filing_number: r.job_filing_number,
        owner_fields: subset,
      };
    });

    const result = {
      job,
      baseJob,
      filings: {
        count: filingsRaw.length,
        ownerFields: ownerFieldsInFilings,
        raw: filingsRaw,
      },
      approvedPermits: {
        count: approvedRaw.length,
        ownerFields: ownerFieldsInApproved,
        raw: approvedRaw,
      },
      conclusion:
        ownerFieldsInFilings.some(
          (f: any) => f.all_owner_fields.email || f.all_owner_fields.telephone
        )
          ? "OWNER_EMAIL_PHONE_PRESENT_IN_PAYLOAD"
          : "OWNER_EMAIL_PHONE_REDACTED_FROM_PAYLOAD",
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
