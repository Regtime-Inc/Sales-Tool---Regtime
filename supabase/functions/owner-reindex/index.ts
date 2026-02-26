import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ENTITY_SUFFIXES_TAIL =
  /\s*,?\s*\b(LLC|L\.?L\.?C\.?|LP|L\.?P\.?|INC\.?|CORP\.?|CORPORATION|CO\.?|LTD\.?|PLLC|P\.?L\.?L\.?C\.?|LLP|L\.?L\.?P\.?)\b\.?\s*,?\s*$/gi;

function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^\w\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSuffixes(name: string): string {
  let result = name;
  let prev = "";
  while (result !== prev) {
    prev = result;
    result = result.replace(ENTITY_SUFFIXES_TAIL, "").trim();
  }
  return result.replace(/,\s*$/, "").trim();
}

function guessEntityType(name: string): "person" | "org" | "unknown" {
  const upper = name.toUpperCase();
  if (
    /\b(LLC|LP|INC|CORP|CORPORATION|LTD|PLLC|LLP|TRUST|ASSOCIATES|REALTY|HOLDINGS|ENTERPRISES|PROPERTIES|GROUP|PARTNERS|DEVELOPMENT|MGMT|MANAGEMENT)\b/i.test(
      upper
    )
  ) {
    return "org";
  }
  const stripped = stripSuffixes(normalizeName(name));
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (
    tokens.length >= 2 &&
    tokens.length <= 4 &&
    tokens.every((t) => /^[A-Z][A-Z]+$/.test(t))
  ) {
    return "person";
  }
  return "unknown";
}

function nameVariants(name: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeName(name);
  variants.add(normalized);
  const stripped = stripSuffixes(normalized);
  if (stripped !== normalized && stripped.length > 2) variants.add(stripped);
  const parts = normalized.split(",").map((s) => s.trim());
  if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
    variants.add(`${parts[1]} ${parts[0]}`);
  }
  return [...variants].filter((v) => v.length > 2);
}

interface OwnerRecord {
  canonicalName: string;
  entityType: "person" | "org" | "unknown";
  aliases: string[];
  emails: { value: string; source: string; confidence: number; updatedAt: string }[];
  phones: { value: string; source: string; confidence: number; updatedAt: string }[];
  addresses: { value: string; source: string; confidence: number; updatedAt: string }[];
  properties: {
    bbl: string;
    relationshipType: string;
    confidence: number;
    evidence: Record<string, unknown>;
  }[];
  events: {
    eventType: string;
    bbl: string;
    occurredAt: string | null;
    payload: Record<string, unknown>;
  }[];
}

function mergeInto(
  map: Map<string, OwnerRecord>,
  name: string,
  data: Partial<Omit<OwnerRecord, "canonicalName" | "entityType">> & {
    entityType?: "person" | "org" | "unknown";
  }
) {
  const normalized = normalizeName(name);
  const key = stripSuffixes(normalized).replace(/^(THE|A|AN)\s+/i, "").trim();
  if (key.length < 3) return;

  let record = map.get(key);
  if (!record) {
    record = {
      canonicalName: name.trim(),
      entityType: data.entityType || guessEntityType(name),
      aliases: [],
      emails: [],
      phones: [],
      addresses: [],
      properties: [],
      events: [],
    };
    map.set(key, record);
  }

  const allAliases = nameVariants(name);
  const existingNorm = new Set(record.aliases.map((a) => normalizeName(a)));
  existingNorm.add(normalizeName(record.canonicalName));
  for (const alias of allAliases) {
    if (!existingNorm.has(normalizeName(alias))) {
      record.aliases.push(alias);
      existingNorm.add(normalizeName(alias));
    }
  }

  if (data.emails) {
    for (const e of data.emails) {
      if (
        e.value &&
        !record.emails.some(
          (x) => x.value.toLowerCase() === e.value.toLowerCase()
        )
      ) {
        record.emails.push(e);
      }
    }
  }
  if (data.phones) {
    for (const p of data.phones) {
      if (
        p.value &&
        !record.phones.some(
          (x) => x.value.replace(/\D/g, "") === p.value.replace(/\D/g, "")
        )
      ) {
        record.phones.push(p);
      }
    }
  }
  if (data.addresses) {
    for (const a of data.addresses) {
      if (a.value && !record.addresses.some((x) => x.value === a.value)) {
        record.addresses.push(a);
      }
    }
  }
  if (data.properties) {
    for (const p of data.properties) {
      if (
        !record.properties.some(
          (x) =>
            x.bbl === p.bbl && x.relationshipType === p.relationshipType
        )
      ) {
        record.properties.push(p);
      }
    }
  }
  if (data.events) {
    for (const ev of data.events) {
      if (
        !record.events.some(
          (x) =>
            x.eventType === ev.eventType &&
            x.bbl === ev.bbl &&
            x.occurredAt === ev.occurredAt
        )
      ) {
        record.events.push(ev);
      }
    }
  }
}

function processAcrisDocs(
  ownerMap: Map<string, OwnerRecord>,
  docs: Record<string, unknown>[]
) {
  for (const doc of docs) {
    const docType = doc.doc_type as string;
    const isDeed = /deed|rptt/i.test(docType);
    const isMortgage = /mortgage|mtge|assgn/i.test(docType);
    const party1 = doc.party1 as string | null;
    const party2 = doc.party2 as string | null;
    const bbl = doc.bbl as string;

    if (party1 && party1.trim().length > 2) {
      const relType = isDeed ? "owner" : isMortgage ? "borrower" : "other";
      mergeInto(ownerMap, party1, {
        properties: [
          {
            bbl,
            relationshipType: relType,
            confidence: 0.7,
            evidence: {
              source: "acris_documents",
              documentId: doc.document_id,
              recordedDate: doc.recorded_date,
            },
          },
        ],
        events: [
          {
            eventType: isDeed ? "purchase" : "acris_doc",
            bbl,
            occurredAt: (doc.recorded_date as string) || null,
            payload: {
              documentId: doc.document_id,
              docType,
              amount: doc.amount,
              party1,
              party2,
            },
          },
        ],
      });
    }

    if (party2 && party2.trim().length > 2) {
      const relType = isDeed ? "owner" : isMortgage ? "lender" : "other";
      mergeInto(ownerMap, party2, {
        properties: [
          {
            bbl,
            relationshipType: relType,
            confidence: isDeed ? 0.85 : 0.6,
            evidence: {
              source: "acris_documents",
              documentId: doc.document_id,
              recordedDate: doc.recorded_date,
            },
          },
        ],
        events: isDeed
          ? [
              {
                eventType: "purchase",
                bbl,
                occurredAt: (doc.recorded_date as string) || null,
                payload: {
                  documentId: doc.document_id,
                  docType,
                  amount: doc.amount,
                  party1,
                  party2,
                },
              },
            ]
          : [],
      });
    }
  }
}

function processContacts(
  ownerMap: Map<string, OwnerRecord>,
  contacts: Record<string, unknown>[],
  now: string
) {
  for (const c of contacts) {
    const fullName = [c.first_name, c.middle_initial, c.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const bizName = c.business_name as string | null;
    const name = bizName && bizName.length > 2 ? bizName : fullName;
    if (!name || name.length < 3) continue;

    const addr = [c.address_line1, c.city, c.state, c.zip]
      .filter(Boolean)
      .join(", ");

    const email = c.email as string | null;
    const phone = c.phone as string | null;
    const bbl = c.bbl as string;

    mergeInto(ownerMap, name, {
      emails: email
        ? [{ value: email, source: "dobnow_owner_contacts", confidence: 0.8, updatedAt: now }]
        : [],
      phones: phone
        ? [{ value: phone, source: "dobnow_owner_contacts", confidence: 0.8, updatedAt: now }]
        : [],
      addresses: addr.length > 5
        ? [{ value: addr, source: "dobnow_owner_contacts", confidence: 0.7, updatedAt: now }]
        : [],
      properties: [
        {
          bbl,
          relationshipType: "owner",
          confidence: 0.8,
          evidence: {
            source: "dobnow_owner_contacts",
            jobNumber: c.job_number,
            snippet: typeof c.evidence_snippet === "string"
              ? c.evidence_snippet.slice(0, 200)
              : undefined,
          },
        },
      ],
      events: [
        {
          eventType: "dobnow_job",
          bbl,
          occurredAt: (() => {
            if (typeof c.evidence_snippet === "string") {
              try {
                const snippet = JSON.parse(c.evidence_snippet);
                if (snippet.filing_date) {
                  const match = String(snippet.filing_date).match(/^(\d{4}-\d{2}-\d{2})/);
                  if (match) return match[1];
                  const d = new Date(snippet.filing_date);
                  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
                }
              } catch { /* ignore parse errors */ }
            }
            if (typeof c.created_at === "string") {
              return c.created_at.split(/[T ]/)[0];
            }
            return null;
          })(),
          payload: { jobNumber: c.job_number, source: c.source },
        },
      ],
    });

    if (bizName && fullName.length > 2 && fullName !== name) {
      mergeInto(ownerMap, name, { aliases: [fullName] });
    }
  }
}

function processStakeholders(
  ownerMap: Map<string, OwnerRecord>,
  rows: { bbl: string; stakeholders: unknown }[],
  now: string
) {
  for (const row of rows) {
    const stakeholders = row.stakeholders as Array<{
      role: string;
      name: string;
      orgName?: string;
      contacts?: { phones?: { raw: string }[]; emails?: { email: string }[] };
      addresses?: { line1?: string; city?: string; state?: string; zip?: string }[];
      confidence?: number;
    }>;
    if (!Array.isArray(stakeholders)) continue;

    for (const s of stakeholders) {
      if (s.role !== "OWNER" && s.role !== "MANAGING_AGENT") continue;
      const name = s.orgName && s.orgName.length > 2 ? s.orgName : s.name;
      if (!name || name.length < 3) continue;

      const emails = (s.contacts?.emails || [])
        .filter((e) => e.email)
        .map((e) => ({
          value: e.email,
          source: "stakeholder_cache",
          confidence: 0.75,
          updatedAt: now,
        }));

      const phones = (s.contacts?.phones || [])
        .filter((p) => p.raw)
        .map((p) => ({
          value: p.raw,
          source: "stakeholder_cache",
          confidence: 0.75,
          updatedAt: now,
        }));

      const addresses = (s.addresses || [])
        .filter((a) => a.line1)
        .map((a) => ({
          value: [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", "),
          source: "stakeholder_cache",
          confidence: 0.7,
          updatedAt: now,
        }));

      mergeInto(ownerMap, name, {
        emails,
        phones,
        addresses,
        properties: [
          {
            bbl: row.bbl,
            relationshipType: s.role === "OWNER" ? "owner" : "other",
            confidence: s.confidence || 0.7,
            evidence: { source: "stakeholder_cache" },
          },
        ],
      });

      if (s.orgName && s.name && s.name.length > 2 && s.name !== s.orgName) {
        mergeInto(ownerMap, name, { aliases: [s.name] });
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ownerMap = new Map<string, OwnerRecord>();
    const now = new Date().toISOString();

    const discoverySync = db.rpc("sync_discovery_owners");

    const [acrisRes, contactsRes, stakeholderRes, discoveryRes] =
      await Promise.all([
        db
          .from("acris_documents")
          .select(
            "document_id, bbl, doc_type, party1, party2, amount, recorded_date"
          )
          .order("recorded_date", { ascending: false })
          .limit(5000),
        db.from("dobnow_owner_contacts").select("*").limit(5000),
        db.from("stakeholder_cache").select("bbl, stakeholders").limit(2000),
        discoverySync,
      ]);

    const discoverySyncResult = discoveryRes.data as {
      entities_created: number;
      links_created: number;
    } | null;

    if (acrisRes.data) processAcrisDocs(ownerMap, acrisRes.data);
    if (contactsRes.data) processContacts(ownerMap, contactsRes.data, now);
    if (stakeholderRes.data)
      processStakeholders(
        ownerMap,
        stakeholderRes.data as { bbl: string; stakeholders: unknown }[],
        now
      );

    const allExisting: {
      id: string;
      canonical_name: string;
      entity_type: string;
      aliases: string[];
      emails: { value: string }[];
      phones: { value: string }[];
      addresses: { value: string }[];
    }[] = [];

    const lookupNames = [...new Set(
      [...ownerMap.values()].map((r) => r.canonicalName)
    )];

    const NAME_BATCH = 200;
    for (let i = 0; i < lookupNames.length; i += NAME_BATCH) {
      const batch = lookupNames.slice(i, i + NAME_BATCH);
      const { data } = await db.rpc("lookup_owner_entities_by_names", {
        p_names: batch,
      });
      if (data) allExisting.push(...data);
    }

    const existingLookup = new Map<
      string,
      {
        id: string;
        canonical_name: string;
        entity_type: string;
        aliases: string[];
        emails: { value: string }[];
        phones: { value: string }[];
        addresses: { value: string }[];
      }
    >();
    for (const row of (allExisting || []) as {
      id: string;
      canonical_name: string;
      entity_type: string;
      aliases: string[];
      emails: { value: string }[];
      phones: { value: string }[];
      addresses: { value: string }[];
    }[]) {
      existingLookup.set(
        `${normalizeName(row.canonical_name)}|${row.entity_type}`,
        row
      );
    }

    const entityIdMap = new Map<string, string>();
    const insertRows: Record<string, unknown>[] = [];
    const updateRows: {
      id: string;
      aliases: string[];
      emails: unknown[];
      phones: unknown[];
      addresses: unknown[];
      updated_at: string;
    }[] = [];

    for (const [mapKey, record] of ownerMap.entries()) {
      if (record.properties.length === 0) continue;

      const lookupKey = `${normalizeName(record.canonicalName)}|${record.entityType}`;
      const existing = existingLookup.get(lookupKey);

      if (existing) {
        entityIdMap.set(mapKey, existing.id);

        const mergedAliases = [
          ...new Set(
            [...(existing.aliases || []), ...record.aliases]
              .map((a: string) => a.trim())
              .filter((a: string) => a.length > 2)
          ),
        ];

        const existingEmails = (existing.emails || []) as { value: string }[];
        const mergedEmails = [...existingEmails];
        for (const e of record.emails) {
          if (
            !mergedEmails.some(
              (x) => x.value.toLowerCase() === e.value.toLowerCase()
            )
          )
            mergedEmails.push(e);
        }

        const existingPhones = (existing.phones || []) as { value: string }[];
        const mergedPhones = [...existingPhones];
        for (const p of record.phones) {
          if (
            !mergedPhones.some(
              (x) =>
                x.value.replace(/\D/g, "") === p.value.replace(/\D/g, "")
            )
          )
            mergedPhones.push(p);
        }

        const existingAddresses = (existing.addresses || []) as {
          value: string;
        }[];
        const mergedAddresses = [...existingAddresses];
        for (const a of record.addresses) {
          if (!mergedAddresses.some((x) => x.value === a.value))
            mergedAddresses.push(a);
        }

        updateRows.push({
          id: existing.id,
          aliases: mergedAliases,
          emails: mergedEmails,
          phones: mergedPhones,
          addresses: mergedAddresses,
          updated_at: now,
        });
      } else {
        const id = crypto.randomUUID();
        entityIdMap.set(mapKey, id);
        insertRows.push({
          id,
          canonical_name: record.canonicalName,
          entity_type: record.entityType,
          aliases: record.aliases,
          emails: record.emails,
          phones: record.phones,
          addresses: record.addresses,
        });
      }
    }

    const propSet = new Set<string>();
    const allProps: Record<string, unknown>[] = [];
    const eventSet = new Set<string>();
    const allEvents: Record<string, unknown>[] = [];

    for (const [mapKey, record] of ownerMap.entries()) {
      const entityId = entityIdMap.get(mapKey);
      if (!entityId) continue;

      for (const p of record.properties) {
        const key = `${entityId}|${p.bbl}|${p.relationshipType}`;
        if (propSet.has(key)) continue;
        propSet.add(key);
        allProps.push({
          owner_entity_id: entityId,
          bbl: p.bbl,
          relationship_type: p.relationshipType,
          confidence: p.confidence,
          evidence: p.evidence,
        });
      }

      for (const ev of record.events) {
        const date = ev.occurredAt || "1900-01-01";
        const key = `${entityId}|${ev.eventType}|${ev.bbl}|${date}`;
        if (eventSet.has(key)) continue;
        eventSet.add(key);
        allEvents.push({
          owner_entity_id: entityId,
          event_type: ev.eventType,
          bbl: ev.bbl,
          occurred_at: date,
          payload: ev.payload,
        });
      }
    }

    const CHUNK = 200;
    const PARALLEL = 20;
    let created = 0;
    let updated = 0;
    let linksCreated = 0;
    let eventsCreated = 0;

    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await db
        .from("owner_entities")
        .insert(insertRows.slice(i, i + CHUNK));
      if (!error) created += Math.min(CHUNK, insertRows.length - i);
    }

    for (let i = 0; i < updateRows.length; i += PARALLEL) {
      const chunk = updateRows.slice(i, i + PARALLEL);
      const results = await Promise.all(
        chunk.map((row) =>
          db
            .from("owner_entities")
            .update({
              aliases: row.aliases,
              emails: row.emails,
              phones: row.phones,
              addresses: row.addresses,
              updated_at: row.updated_at,
            })
            .eq("id", row.id)
        )
      );
      updated += results.filter((r) => !r.error).length;
    }

    for (let i = 0; i < allProps.length; i += CHUNK) {
      const { error } = await db
        .from("owner_entity_properties")
        .upsert(allProps.slice(i, i + CHUNK), {
          onConflict: "owner_entity_id,bbl,relationship_type",
        });
      if (!error) linksCreated += Math.min(CHUNK, allProps.length - i);
    }

    for (let i = 0; i < allEvents.length; i += CHUNK) {
      const { error } = await db
        .from("owner_entity_events")
        .upsert(allEvents.slice(i, i + CHUNK), {
          onConflict: "owner_entity_id,event_type,bbl,occurred_at",
        });
      if (!error) eventsCreated += Math.min(CHUNK, allEvents.length - i);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        created,
        updated,
        linksCreated,
        eventsCreated,
        totalEntities: ownerMap.size,
        discoverySync: discoverySyncResult,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-reindex error:", message);
    return new Response(
      JSON.stringify({ status: "error", error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
