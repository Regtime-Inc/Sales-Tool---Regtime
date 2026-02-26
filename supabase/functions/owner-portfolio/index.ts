import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PLUTO_ENDPOINT = "https://data.cityofnewyork.us/resource/64uk-42ks.json";

const BOROUGH_NAMES: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
};

function bblFallbackLabel(bbl: string): string {
  if (bbl.length !== 10) return bbl;
  const boro = BOROUGH_NAMES[bbl[0]] || `Boro ${bbl[0]}`;
  const block = parseInt(bbl.substring(1, 6), 10);
  const lot = parseInt(bbl.substring(6, 10), 10);
  return `${boro}, Block ${block}, Lot ${lot}`;
}

async function resolvePlutoAddresses(
  bbls: string[],
  db: ReturnType<typeof createClient>
): Promise<Map<string, { address: string; borough: string }>> {
  const result = new Map<string, { address: string; borough: string }>();
  if (bbls.length === 0) return result;

  const BATCH = 20;
  for (let i = 0; i < bbls.length; i += BATCH) {
    const batch = bbls.slice(i, i + BATCH);
    const whereClauses = batch.map((bbl) => {
      const borocode = bbl[0];
      const block = String(parseInt(bbl.substring(1, 6), 10)).padStart(5, "0");
      const lot = String(parseInt(bbl.substring(6, 10), 10)).padStart(4, "0");
      return `(borocode='${borocode}' AND block='${block}' AND lot='${lot}')`;
    });

    const where = whereClauses.join(" OR ");
    const url = `${PLUTO_ENDPOINT}?$where=${encodeURIComponent(where)}&$select=borocode,block,lot,address,borough&$limit=${BATCH}`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = (await res.json()) as {
        borocode: string;
        block: string;
        lot: string;
        address?: string;
        borough?: string;
      }[];

      const cacheRows: { bbl: string; address: string; borough: string }[] = [];

      for (const row of rows) {
        if (!row.address) continue;
        const block = row.block.padStart(5, "0");
        const lot = row.lot.padStart(4, "0");
        const bbl = `${row.borocode}${block}${lot}`;
        const borough = row.borough || BOROUGH_NAMES[row.borocode] || "";
        result.set(bbl, { address: row.address, borough });
        cacheRows.push({ bbl, address: row.address, borough });
      }

      if (cacheRows.length > 0) {
        await db
          .from("discovery_cache")
          .upsert(
            cacheRows.map((r) => ({
              bbl: r.bbl,
              address: r.address,
              borough: r.borough,
              fetched_at: new Date().toISOString(),
            })),
            { onConflict: "bbl" }
          )
          .then(() => {});
      }
    } catch {
      // PLUTO lookup failed for this batch, continue
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ownerId = url.searchParams.get("id");

    if (!ownerId) {
      return new Response(
        JSON.stringify({ error: "Missing owner id parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: owner, error: ownerErr } = await db
      .from("owner_entities")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerErr || !owner) {
      return new Response(
        JSON.stringify({ error: ownerErr?.message || "Owner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: propLinks } = await db
      .from("owner_entity_properties")
      .select("*")
      .eq("owner_entity_id", ownerId)
      .order("confidence", { ascending: false });

    const bblSet = new Set<string>();
    const propMap = new Map<string, {
      relationship_types: string[];
      confidence: number;
      evidence_count: number;
    }>();

    for (const link of propLinks || []) {
      bblSet.add(link.bbl);
      const existing = propMap.get(link.bbl);
      if (existing) {
        if (!existing.relationship_types.includes(link.relationship_type)) {
          existing.relationship_types.push(link.relationship_type);
        }
        existing.confidence = Math.max(existing.confidence, link.confidence);
        existing.evidence_count++;
      } else {
        propMap.set(link.bbl, {
          relationship_types: [link.relationship_type],
          confidence: link.confidence,
          evidence_count: 1,
        });
      }
    }

    const addressMap = new Map<string, string>();
    const boroughMap = new Map<string, string>();
    if (bblSet.size > 0) {
      const { data: cached } = await db
        .from("discovery_cache")
        .select("bbl, address, borough")
        .in("bbl", [...bblSet]);

      if (cached) {
        for (const row of cached) {
          if (row.address) addressMap.set(row.bbl, row.address);
          if (row.borough) boroughMap.set(row.bbl, row.borough);
        }
      }

      const missingBbls = [...bblSet].filter((b) => !addressMap.has(b));
      if (missingBbls.length > 0) {
        const plutoResults = await resolvePlutoAddresses(missingBbls, db);
        for (const [bbl, info] of plutoResults) {
          addressMap.set(bbl, info.address);
          boroughMap.set(bbl, info.borough);
        }
      }
    }

    const { data: allEvents } = await db
      .from("owner_entity_events")
      .select("*")
      .eq("owner_entity_id", ownerId)
      .order("occurred_at", { ascending: false })
      .limit(100);

    const events = allEvents || [];

    let purchaseEvents = events.filter((e) => e.event_type === "purchase");
    const dobEvents = events.filter((e) => e.event_type === "dobnow_job");

    if (purchaseEvents.length < 3 && bblSet.size > 0) {
      const existingKeys = new Set(
        purchaseEvents.map((e) => `${e.bbl}|${e.occurred_at}`)
      );

      const { data: bblPurchases } = await db
        .from("owner_entity_events")
        .select("*")
        .in("bbl", [...bblSet])
        .eq("event_type", "purchase")
        .order("occurred_at", { ascending: false })
        .limit(50);

      for (const ev of bblPurchases || []) {
        const key = `${ev.bbl}|${ev.occurred_at}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          purchaseEvents.push({
            ...ev,
            payload: { ...ev.payload, via_bbl: true },
          });
        }
      }

      purchaseEvents.sort((a, b) => {
        const da = a.occurred_at || "";
        const db2 = b.occurred_at || "";
        return db2.localeCompare(da);
      });
    }

    const purchaseByBbl = new Map<string, { date?: string; price?: number }>();
    for (const ev of purchaseEvents) {
      if (!purchaseByBbl.has(ev.bbl)) {
        purchaseByBbl.set(ev.bbl, {
          date: ev.occurred_at,
          price: ev.payload?.amount || undefined,
        });
      }
    }

    const dobContactMap = new Map<
      string,
      {
        ownerName: string;
        businessName: string;
        phone: string;
        email: string;
        address: string;
        jobType: string;
        workType: string;
      }
    >();

    if (bblSet.size > 0) {
      const { data: dobContacts } = await db
        .from("dobnow_owner_contacts")
        .select(
          "bbl, job_number, first_name, last_name, business_name, phone, email, address_line1, city, state, zip, evidence_snippet"
        )
        .in("bbl", [...bblSet])
        .order("created_at", { ascending: false });

      for (const c of dobContacts || []) {
        const key = `${c.bbl}|${c.job_number}`;
        if (dobContactMap.has(key)) continue;

        const ownerParts = [c.first_name, c.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();

        let jobType = "";
        let workType = "";
        if (c.evidence_snippet) {
          try {
            const snippet =
              typeof c.evidence_snippet === "string"
                ? JSON.parse(c.evidence_snippet)
                : c.evidence_snippet;
            jobType = snippet.job_type || "";
            workType = snippet.work_type || "";
          } catch {
            /* ignore */
          }
        }

        const addressParts = [c.address_line1, c.city, c.state, c.zip]
          .filter(Boolean)
          .join(", ");

        dobContactMap.set(key, {
          ownerName: ownerParts,
          businessName: c.business_name || "",
          phone: c.phone || "",
          email: c.email || "",
          address: addressParts,
          jobType,
          workType,
        });
      }
    }

    const enrichedDobEvents = dobEvents.map((ev) => {
      const jobNum = (ev.payload?.jobNumber as string) || "";
      const contact = dobContactMap.get(`${ev.bbl}|${jobNum}`);
      return {
        ...ev,
        payload: {
          ...ev.payload,
          ownerName:
            ev.payload?.ownerName ||
            contact?.ownerName ||
            "",
          businessName:
            ev.payload?.businessName ||
            contact?.businessName ||
            "",
          phone: ev.payload?.phone || contact?.phone || "",
          email: ev.payload?.email || contact?.email || "",
          ownerAddress:
            ev.payload?.ownerAddress || contact?.address || "",
          jobType:
            ev.payload?.jobType || contact?.jobType || "",
          workType:
            ev.payload?.workType || contact?.workType || "",
        },
      };
    });

    const dobByBbl = new Map<string, { jobNumber?: string; jobType?: string }>();
    for (const ev of enrichedDobEvents) {
      if (!dobByBbl.has(ev.bbl)) {
        dobByBbl.set(ev.bbl, {
          jobNumber: ev.payload?.jobNumber as string || undefined,
          jobType: ev.payload?.jobType as string || undefined,
        });
      }
    }

    const properties = [...propMap.entries()].map(([bbl, info]) => {
      const purchase = purchaseByBbl.get(bbl);
      const dob = dobByBbl.get(bbl);
      return {
        bbl,
        address: addressMap.get(bbl) || bblFallbackLabel(bbl),
        borough: boroughMap.get(bbl) || BOROUGH_NAMES[bbl[0]] || undefined,
        relationship_types: info.relationship_types,
        confidence: info.confidence,
        evidence_count: info.evidence_count,
        last_purchase_date: purchase?.date || undefined,
        last_purchase_price: purchase?.price || undefined,
        last_dob_job: dob?.jobNumber || undefined,
        last_dob_job_type: dob?.jobType || undefined,
      };
    });

    properties.sort((a, b) => b.confidence - a.confidence);

    let associatedEntities: {
      id: string;
      canonical_name: string;
      entity_type: string;
      relationship_types: string[];
      shared_bbls: string[];
      shared_bbl_count: number;
      property_count: number;
    }[] = [];

    if (bblSet.size > 0) {
      const { data: coLinks } = await db
        .from("owner_entity_properties")
        .select("owner_entity_id, bbl, relationship_type")
        .in("bbl", [...bblSet])
        .neq("owner_entity_id", ownerId);

      if (coLinks && coLinks.length > 0) {
        const entityMap = new Map<
          string,
          { bbls: Set<string>; relTypes: Set<string> }
        >();

        for (const link of coLinks) {
          let entry = entityMap.get(link.owner_entity_id);
          if (!entry) {
            entry = { bbls: new Set(), relTypes: new Set() };
            entityMap.set(link.owner_entity_id, entry);
          }
          entry.bbls.add(link.bbl);
          entry.relTypes.add(link.relationship_type);
        }

        const entityIds = [...entityMap.keys()];
        const { data: entities } = await db
          .from("owner_entities")
          .select("id, canonical_name, entity_type")
          .in("id", entityIds);

        const { data: propCounts } = await db
          .from("owner_entity_properties")
          .select("owner_entity_id")
          .in("owner_entity_id", entityIds);

        const countMap = new Map<string, number>();
        for (const row of propCounts || []) {
          countMap.set(
            row.owner_entity_id,
            (countMap.get(row.owner_entity_id) || 0) + 1
          );
        }

        for (const ent of entities || []) {
          const info = entityMap.get(ent.id);
          if (!info) continue;
          associatedEntities.push({
            id: ent.id,
            canonical_name: ent.canonical_name,
            entity_type: ent.entity_type,
            relationship_types: [...info.relTypes],
            shared_bbls: [...info.bbls],
            shared_bbl_count: info.bbls.size,
            property_count: countMap.get(ent.id) || 0,
          });
        }

        associatedEntities.sort((a, b) => b.shared_bbl_count - a.shared_bbl_count);
        associatedEntities = associatedEntities.slice(0, 50);
      }
    }

    const warnings: string[] = [];
    if (owner.aliases && owner.aliases.length > 5) {
      warnings.push("This entity has many aliases - verify matches are accurate");
    }

    return new Response(
      JSON.stringify({
        owner,
        properties,
        recent_purchases: purchaseEvents.slice(0, 30),
        recent_dob_jobs: enrichedDobEvents.slice(0, 20),
        associated_entities: associatedEntities,
        warnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-portfolio error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
