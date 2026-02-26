import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DossierContact {
  value: string;
  source: string;
  confidence: number;
  lastSeen: string;
  bbl?: string;
  evidence?: string;
}

interface AssociatedContact {
  name: string;
  role: string;
  entityType: "person" | "org" | "unknown";
  phones: DossierContact[];
  emails: DossierContact[];
  addresses: DossierContact[];
  linkedBbls: string[];
}

function dedupeContacts(contacts: DossierContact[], mode: "phone" | "email" | "address"): DossierContact[] {
  const seen = new Map<string, DossierContact>();
  for (const c of contacts) {
    let key: string;
    if (mode === "phone") {
      key = c.value.replace(/\D/g, "");
    } else if (mode === "email") {
      key = c.value.toLowerCase().trim();
    } else {
      key = c.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
    }
    if (!key || key.length < 3) continue;
    const existing = seen.get(key);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(key, c);
    }
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function normName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const tokensA = new Set(na.split(" ").filter(Boolean));
  const tokensB = new Set(nb.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

const BOROUGH_NAMES: Record<string, string> = {
  "1": "MANHATTAN",
  "2": "BRONX",
  "3": "BROOKLYN",
  "4": "QUEENS",
  "5": "STATEN ISLAND",
};

const DOB_NOW_FILINGS_ID = "w9ak-ipjd";

async function fetchLiveDobnow(bbl: string): Promise<{
  phones: DossierContact[];
  emails: DossierContact[];
  addresses: DossierContact[];
  names: string[];
}> {
  const result = { phones: [] as DossierContact[], emails: [] as DossierContact[], addresses: [] as DossierContact[], names: [] as string[] };
  if (bbl.length !== 10) return result;
  const borough = bbl[0];
  const block = String(parseInt(bbl.substring(1, 6), 10));
  const lot = String(parseInt(bbl.substring(6, 10), 10));
  const boroughName = BOROUGH_NAMES[borough];
  if (!boroughName) return result;

  const where = `borough='${boroughName}' AND block='${block}' AND lot='${lot}'`;
  const url = `https://data.cityofnewyork.us/resource/${DOB_NOW_FILINGS_ID}.json?$where=${encodeURIComponent(where)}&$limit=20&$order=filing_date DESC`;

  try {
    const res = await fetch(url);
    if (!res.ok) return result;
    const filings = await res.json() as Record<string, unknown>[];
    const now = new Date().toISOString();

    for (const f of filings) {
      const phone = ((f.owner_s_phone_number as string) || "").replace(/\D/g, "");
      if (phone.length >= 7) {
        result.phones.push({
          value: formatPhone(phone),
          source: "dobnow_api",
          confidence: 0.8,
          lastSeen: now,
          bbl,
          evidence: `DOB NOW filing ${f.job_filing_number || ""}`,
        });
      }

      const addr = [f.owner_s_street_name, f.owner_s_city, f.owner_s_state, f.owner_s_zip_code]
        .filter(Boolean)
        .join(", ")
        .trim();
      if (addr.length > 5) {
        result.addresses.push({
          value: addr,
          source: "dobnow_api",
          confidence: 0.75,
          lastSeen: now,
          bbl,
          evidence: `DOB NOW filing ${f.job_filing_number || ""}`,
        });
      }

      const biz = ((f.owner_s_business_name as string) || "").trim();
      const full = [f.owner_s_first_name, f.owner_s_last_name].filter(Boolean).join(" ").trim();
      if (biz) result.names.push(biz);
      if (full) result.names.push(full);
    }
  } catch {
    // skip
  }
  return result;
}

async function runOsintSearch(
  entityName: string,
  entityType: string,
  aliases: string[],
  knownAddresses: string[],
  knownPhones: string[]
): Promise<{
  query: string;
  findings: string;
  contacts: {
    phones: DossierContact[];
    emails: DossierContact[];
    addresses: DossierContact[];
    websites: string[];
    businessInfo: string[];
  };
  disclaimer: string;
} | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const knownContext = [];
  if (knownAddresses.length > 0) {
    knownContext.push(`Known addresses: ${knownAddresses.slice(0, 3).join("; ")}`);
  }
  if (knownPhones.length > 0) {
    knownContext.push(`Known phones: ${knownPhones.slice(0, 3).join(", ")}`);
  }
  if (aliases.length > 0) {
    knownContext.push(`Also known as: ${aliases.slice(0, 5).join(", ")}`);
  }

  const searchQuery = `${entityName} NYC real estate ${entityType === "org" ? "company LLC" : "owner developer"}`;

  const systemPrompt = `You are an NYC real estate contact information researcher. Given an entity name, find publicly available contact information from these sources:

1. NY Secretary of State business filings (DOS entity search)
2. NYC DOB BIS (Building Information System) owner records
3. HPD owner registration records
4. NYC ACRIS real property records
5. NYS corporate filings
6. Professional licensing databases (DCA, DOS)
7. Public business directories and listings

For each piece of contact information you find, assign a confidence score:
- 0.9: From official government registration (SOS, DOB, HPD)
- 0.7: From business directory or professional listing
- 0.5: From indirect association or inference

IMPORTANT: Only return information that would be in public government records or business directories. Do NOT fabricate information. If you cannot find real information, say so honestly.

Return ONLY a JSON object with this structure:
{
  "findings": "Brief narrative of what was found and from which sources",
  "phones": [{"value": "formatted phone", "confidence": 0.7, "evidence": "source description"}],
  "emails": [{"value": "email@example.com", "confidence": 0.7, "evidence": "source description"}],
  "addresses": [{"value": "full address", "confidence": 0.7, "evidence": "source description"}],
  "websites": ["https://example.com"],
  "businessInfo": ["NY DOS Entity #1234567 - Active LLC filed 2020-01-15", "Registered Agent: Name at Address"]
}`;

  const userMessage = `Search for contact information for: "${entityName}"
Entity type: ${entityType}
Context: NYC real estate ${entityType === "org" ? "company/LLC" : "individual owner/developer"}
${knownContext.length > 0 ? "\n" + knownContext.join("\n") : ""}

Find their best available phone numbers, email addresses, business addresses, website, and any NY Secretary of State or DOB registration details.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("OpenAI OSINT error:", res.status);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const now = new Date().toISOString();

    return {
      query: searchQuery,
      findings: parsed.findings || "No findings returned",
      contacts: {
        phones: (parsed.phones || []).map((p: { value: string; confidence: number; evidence: string }) => ({
          value: formatPhone(p.value || ""),
          source: "ai_enrichment",
          confidence: Math.min(p.confidence || 0.5, 0.7),
          lastSeen: now,
          evidence: p.evidence || "AI web search",
        })),
        emails: (parsed.emails || []).map((e: { value: string; confidence: number; evidence: string }) => ({
          value: e.value || "",
          source: "ai_enrichment",
          confidence: Math.min(e.confidence || 0.5, 0.7),
          lastSeen: now,
          evidence: e.evidence || "AI web search",
        })),
        addresses: (parsed.addresses || []).map((a: { value: string; confidence: number; evidence: string }) => ({
          value: a.value || "",
          source: "ai_enrichment",
          confidence: Math.min(a.confidence || 0.5, 0.6),
          lastSeen: now,
          evidence: a.evidence || "AI web search",
        })),
        websites: parsed.websites || [],
        businessInfo: parsed.businessInfo || [],
      },
      disclaimer: "AI-sourced results should be independently verified. Confidence scores are capped at 0.7 for AI-enriched data.",
    };
  } catch (err) {
    console.error("OSINT search failed:", err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ownerId = url.searchParams.get("id");
    const enrich = url.searchParams.get("enrich") === "true";

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
      .select("bbl")
      .eq("owner_entity_id", ownerId);

    const bbls = [...new Set((propLinks || []).map((p: { bbl: string }) => p.bbl))];

    const allPhones: DossierContact[] = [];
    const allEmails: DossierContact[] = [];
    const allAddresses: DossierContact[] = [];
    const associatedContacts: AssociatedContact[] = [];
    const assocMap = new Map<string, AssociatedContact>();
    const entityNames = new Set<string>([
      owner.canonical_name,
      ...(owner.aliases || []),
    ]);

    for (const c of owner.phones || []) {
      allPhones.push({
        value: formatPhone(c.value),
        source: c.source,
        confidence: c.confidence,
        lastSeen: c.updatedAt,
        evidence: c.evidence,
      });
    }
    for (const c of owner.emails || []) {
      allEmails.push({
        value: c.value,
        source: c.source,
        confidence: c.confidence,
        lastSeen: c.updatedAt,
        evidence: c.evidence,
      });
    }
    for (const c of owner.addresses || []) {
      allAddresses.push({
        value: c.value,
        source: c.source,
        confidence: c.confidence,
        lastSeen: c.updatedAt,
        evidence: c.evidence,
      });
    }

    if (bbls.length > 0) {
      const { data: dobContacts } = await db
        .from("dobnow_owner_contacts")
        .select("*")
        .in("bbl", bbls);

      for (const dc of dobContacts || []) {
        const fullName = [dc.first_name, dc.middle_initial, dc.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const name = dc.business_name || fullName;
        const isMatch = [...entityNames].some((en) => nameSimilarity(en, name) > 0.6);

        const phone = (dc.phone || "").replace(/\D/g, "");
        const email = (dc.email || "").trim();
        const addr = [dc.address_line1, dc.city, dc.state, dc.zip].filter(Boolean).join(", ");
        const now = dc.created_at || new Date().toISOString();

        if (isMatch) {
          if (phone.length >= 7) {
            allPhones.push({
              value: formatPhone(phone),
              source: "dobnow_owner_contacts",
              confidence: 0.8,
              lastSeen: now,
              bbl: dc.bbl,
              evidence: `DOB filing ${dc.job_number}`,
            });
          }
          if (email) {
            allEmails.push({
              value: email,
              source: "dobnow_owner_contacts",
              confidence: 0.8,
              lastSeen: now,
              bbl: dc.bbl,
              evidence: `DOB filing ${dc.job_number}`,
            });
          }
          if (addr.length > 5) {
            allAddresses.push({
              value: addr,
              source: "dobnow_owner_contacts",
              confidence: 0.7,
              lastSeen: now,
              bbl: dc.bbl,
              evidence: `DOB filing ${dc.job_number}`,
            });
          }
        } else if (name.length >= 2) {
          const key = normName(name);
          let assoc = assocMap.get(key);
          if (!assoc) {
            assoc = {
              name: name,
              role: "Filing Contact",
              entityType: dc.business_name ? "org" : "person",
              phones: [],
              emails: [],
              addresses: [],
              linkedBbls: [],
            };
            assocMap.set(key, assoc);
          }
          if (!assoc.linkedBbls.includes(dc.bbl)) assoc.linkedBbls.push(dc.bbl);
          if (phone.length >= 7) {
            assoc.phones.push({ value: formatPhone(phone), source: "dobnow_owner_contacts", confidence: 0.8, lastSeen: now, bbl: dc.bbl });
          }
          if (email) {
            assoc.emails.push({ value: email, source: "dobnow_owner_contacts", confidence: 0.8, lastSeen: now, bbl: dc.bbl });
          }
          if (addr.length > 5) {
            assoc.addresses.push({ value: addr, source: "dobnow_owner_contacts", confidence: 0.7, lastSeen: now, bbl: dc.bbl });
          }
        }
      }

      const { data: stakeholderRows } = await db
        .from("stakeholder_cache")
        .select("bbl, stakeholders")
        .in("bbl", bbls);

      for (const row of stakeholderRows || []) {
        const stakeholders = row.stakeholders as Array<{
          role: string;
          name: string;
          orgName?: string;
          contacts?: { phones?: { raw: string; confidence?: number }[]; emails?: { email: string; confidence?: number }[] };
          addresses?: { line1?: string; city?: string; state?: string; zip?: string; source?: string; confidence?: number }[];
        }>;
        if (!Array.isArray(stakeholders)) continue;

        for (const s of stakeholders) {
          const sName = s.orgName || s.name;
          if (!sName) continue;

          const isMatch = [...entityNames].some((en) => nameSimilarity(en, sName) > 0.6);
          const now = new Date().toISOString();

          if (isMatch) {
            for (const p of s.contacts?.phones || []) {
              if (p.raw && p.raw.replace(/\D/g, "").length >= 7) {
                allPhones.push({
                  value: formatPhone(p.raw),
                  source: "stakeholder_cache",
                  confidence: p.confidence || 0.75,
                  lastSeen: now,
                  bbl: row.bbl,
                  evidence: `${s.role} registration`,
                });
              }
            }
            for (const e of s.contacts?.emails || []) {
              if (e.email) {
                allEmails.push({
                  value: e.email,
                  source: "stakeholder_cache",
                  confidence: e.confidence || 0.75,
                  lastSeen: now,
                  bbl: row.bbl,
                  evidence: `${s.role} registration`,
                });
              }
            }
            for (const a of s.addresses || []) {
              const addr = [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ");
              if (addr.length > 5) {
                allAddresses.push({
                  value: addr,
                  source: "stakeholder_cache",
                  confidence: a.confidence || 0.7,
                  lastSeen: now,
                  bbl: row.bbl,
                  evidence: `${s.role} registration (${a.source || "HPD"})`,
                });
              }
            }
          } else if (sName.length >= 2) {
            const hasContacts = (s.contacts?.phones?.length || 0) > 0 ||
              (s.contacts?.emails?.length || 0) > 0 ||
              (s.addresses?.length || 0) > 0;
            if (!hasContacts) continue;

            const key = normName(sName);
            let assoc = assocMap.get(key);
            if (!assoc) {
              assoc = {
                name: sName,
                role: s.role || "Stakeholder",
                entityType: s.orgName ? "org" : "person",
                phones: [],
                emails: [],
                addresses: [],
                linkedBbls: [],
              };
              assocMap.set(key, assoc);
            }
            if (!assoc.linkedBbls.includes(row.bbl)) assoc.linkedBbls.push(row.bbl);

            for (const p of s.contacts?.phones || []) {
              if (p.raw) {
                assoc.phones.push({ value: formatPhone(p.raw), source: "stakeholder_cache", confidence: p.confidence || 0.75, lastSeen: now, bbl: row.bbl });
              }
            }
            for (const e of s.contacts?.emails || []) {
              if (e.email) {
                assoc.emails.push({ value: e.email, source: "stakeholder_cache", confidence: e.confidence || 0.75, lastSeen: now, bbl: row.bbl });
              }
            }
            for (const a of s.addresses || []) {
              const addr = [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ");
              if (addr.length > 5) {
                assoc.addresses.push({ value: addr, source: "stakeholder_cache", confidence: a.confidence || 0.7, lastSeen: now, bbl: row.bbl });
              }
            }
          }
        }
      }

      const bblsWithContacts = new Set(
        (dobContacts || []).map((c: { bbl: string }) => c.bbl)
      );
      const bblsMissingContacts = bbls.filter((b) => !bblsWithContacts.has(b)).slice(0, 5);

      if (bblsMissingContacts.length > 0) {
        const liveResults = await Promise.all(
          bblsMissingContacts.map((bbl) => fetchLiveDobnow(bbl))
        );
        for (const lr of liveResults) {
          for (const p of lr.phones) {
            const isMatch = lr.names.some((n) =>
              [...entityNames].some((en) => nameSimilarity(en, n) > 0.6)
            );
            if (isMatch) allPhones.push(p);
          }
          for (const a of lr.addresses) {
            const isMatch = lr.names.some((n) =>
              [...entityNames].some((en) => nameSimilarity(en, n) > 0.6)
            );
            if (isMatch) allAddresses.push(a);
          }
        }
      }
    }

    const phones = dedupeContacts(allPhones, "phone");
    const emails = dedupeContacts(allEmails, "email");
    const addresses = dedupeContacts(allAddresses, "address");

    for (const assoc of assocMap.values()) {
      assoc.phones = dedupeContacts(assoc.phones, "phone");
      assoc.emails = dedupeContacts(assoc.emails, "email");
      assoc.addresses = dedupeContacts(assoc.addresses, "address");
    }

    const sortedAssoc = [...assocMap.values()]
      .filter((a) => a.phones.length > 0 || a.emails.length > 0 || a.addresses.length > 0)
      .sort((a, b) => (b.phones.length + b.emails.length) - (a.phones.length + a.emails.length))
      .slice(0, 30);

    let osint = null;
    const osintCacheKey = `osint:${normName(owner.canonical_name)}`;

    if (enrich) {
      osint = await runOsintSearch(
        owner.canonical_name,
        owner.entity_type,
        owner.aliases || [],
        addresses.map((a: DossierContact) => a.value).slice(0, 3),
        phones.map((p: DossierContact) => p.value).slice(0, 3)
      );
      if (osint) {
        await db.from("web_enrichment_cache").upsert(
          {
            owner_name_key: osintCacheKey,
            owner_entity_id: ownerId,
            results: osint,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "owner_name_key" }
        ).then(() => {}, () => {});
      }
    } else {
      const { data: cachedOsint } = await db
        .from("web_enrichment_cache")
        .select("results")
        .eq("owner_name_key", osintCacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cachedOsint?.results) {
        osint = cachedOsint.results;
      }
    }

    const totalContactCount = phones.length + emails.length + addresses.length;

    return new Response(
      JSON.stringify({
        entityId: owner.id,
        entityName: owner.canonical_name,
        entityType: owner.entity_type,
        aliases: owner.aliases || [],
        phones,
        emails,
        addresses,
        associatedContacts: sortedAssoc,
        osint,
        enrichedAt: new Date().toISOString(),
        totalContactCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-contacts error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
