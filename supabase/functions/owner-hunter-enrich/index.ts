import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FETCH_TIMEOUT_MS = 15000;
const HUNTER_BASE = "https://api.hunter.io/v2";
const MAX_VERIFY = 5;

interface HunterEmail {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  seniority?: string;
  sources?: Array<{ domain?: string; uri?: string; extracted_on?: string }>;
  verification?: { status?: string };
}

interface DomainSearchResponse {
  data?: {
    domain?: string;
    organization?: string;
    pattern?: string;
    emails?: HunterEmail[];
  };
  errors?: Array<{ id?: string; details?: string }>;
}

interface EmailFinderResponse {
  data?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    score?: number;
    domain?: string;
    position?: string;
    company?: string;
    sources?: Array<{ domain?: string; uri?: string }>;
    verification?: { status?: string };
  };
  errors?: Array<{ id?: string; details?: string }>;
}

interface EmailVerifierResponse {
  data?: {
    email?: string;
    result?: string;
    score?: number;
    status?: string;
  };
  errors?: Array<{ id?: string; details?: string }>;
}

interface ContactCandidate {
  type: "email";
  value: string;
  confidence: number;
  sourceUrl: string;
  evidenceSnippet: string;
  source: string;
  extractedAt: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  seniority?: string;
  verificationStatus?: string;
}

interface EnrichmentSource {
  url: string;
  title: string;
  snippet?: string;
}

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

function normalizePersonName(fullName: string): { firstName?: string; lastName?: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return {};
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[1].split(/\s+/)[0], lastName: parts[0] };
    }
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return { lastName: tokens[0] };
  return { firstName: tokens[0], lastName: tokens[tokens.length - 1] };
}

function normalizeCacheKey(ownerName: string, domain: string): string {
  const name = ownerName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE|PLLC|LLP)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `hunter:${domain.toLowerCase()}:${name}`;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function hunterDomainSearch(
  apiKey: string,
  domain: string,
  limit = 20,
  type?: string
): Promise<DomainSearchResponse> {
  const qs = new URLSearchParams({
    api_key: apiKey,
    domain,
    limit: String(limit),
  });
  if (type) qs.set("type", type);
  const res = await fetchWithTimeout(`${HUNTER_BASE}/domain-search?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hunter domain-search HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function hunterEmailFinder(
  apiKey: string,
  params: { firstName: string; lastName: string; domain: string; company?: string }
): Promise<EmailFinderResponse> {
  const qs = new URLSearchParams({
    api_key: apiKey,
    domain: params.domain,
    first_name: params.firstName,
    last_name: params.lastName,
  });
  if (params.company) qs.set("company", params.company);
  const res = await fetchWithTimeout(`${HUNTER_BASE}/email-finder?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hunter email-finder HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function hunterEmailVerifier(apiKey: string, email: string): Promise<EmailVerifierResponse> {
  const qs = new URLSearchParams({ api_key: apiKey, email });
  const res = await fetchWithTimeout(`${HUNTER_BASE}/email-verifier?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hunter email-verifier HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function candidatesFromDomainSearch(data: DomainSearchResponse, domain: string): ContactCandidate[] {
  const emails = data.data?.emails || [];
  const now = new Date().toISOString();
  return emails
    .filter((e) => e.value)
    .map((e) => {
      const sourceUri = e.sources?.[0]?.uri || `https://${domain}`;
      const hunterConf = (e.confidence ?? 50) / 100;
      return {
        type: "email" as const,
        value: e.value!.toLowerCase(),
        confidence: Math.round(hunterConf * 100) / 100,
        sourceUrl: sourceUri,
        evidenceSnippet: `domain_search: email=${e.value}, score=${e.confidence ?? "?"}, position=${e.position || "unknown"}, sources=${e.sources?.length ?? 0}`,
        source: "hunter_domain_search",
        extractedAt: now,
        firstName: e.first_name || undefined,
        lastName: e.last_name || undefined,
        position: e.position || undefined,
        department: e.department || undefined,
        seniority: e.seniority || undefined,
        verificationStatus: e.verification?.status || undefined,
      };
    });
}

function candidateFromEmailFinder(data: EmailFinderResponse, domain: string): ContactCandidate | null {
  const d = data.data;
  if (!d?.email) return null;
  const now = new Date().toISOString();
  const sourceUri = d.sources?.[0]?.uri || `https://${domain}`;
  return {
    type: "email",
    value: d.email.toLowerCase(),
    confidence: Math.round(((d.score ?? 50) / 100) * 100) / 100,
    sourceUrl: sourceUri,
    evidenceSnippet: `email_finder: email=${d.email}, score=${d.score ?? "?"}, company=${d.company || "unknown"}`,
    source: "hunter_email_finder",
    extractedAt: now,
    firstName: d.first_name || undefined,
    lastName: d.last_name || undefined,
    position: d.position || undefined,
    verificationStatus: d.verification?.status || undefined,
  };
}

function deduplicateByEmail(candidates: ContactCandidate[]): ContactCandidate[] {
  const seen = new Map<string, ContactCandidate>();
  for (const c of candidates) {
    const key = c.value.toLowerCase();
    const existing = seen.get(key);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(key, c);
    }
  }
  return [...seen.values()];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("HUNTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Hunter.io API key not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const ownerName: string = body.ownerName || "";
    const ownerId: string | undefined = body.ownerId;
    const entityType: string = body.entityType || "unknown";
    const websiteOrDomain: string | undefined = body.websiteOrDomain;
    const companyName: string | undefined = body.companyName;

    if (!ownerName.trim()) {
      return new Response(
        JSON.stringify({ error: "ownerName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let domain: string | null = null;

    if (websiteOrDomain) {
      domain = extractDomain(websiteOrDomain);
    }

    if (!domain && ownerId) {
      const { data: ownerRow } = await db
        .from("owner_entities")
        .select("website")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerRow?.website) {
        domain = extractDomain(ownerRow.website);
      }
    }

    if (!domain) {
      return new Response(
        JSON.stringify({
          domain: null,
          sources: [],
          candidates: [],
          warnings: ["No domain available; add a website/domain to this owner to enable Hunter.io lookups."],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cacheKey = normalizeCacheKey(ownerName, domain);
    const forceRefresh: boolean = body.forceRefresh === true;

    if (!forceRefresh) {
      const { data: cached } = await db
        .from("web_enrichment_cache")
        .select("results")
        .eq("owner_name_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached?.results) {
        const cachedCandidates = cached.results.candidates || [];
        const cachedSources = cached.results.sources || [];
        if (cachedCandidates.length > 0 || cachedSources.length > 0) {
          return new Response(
            JSON.stringify({ ...cached.results, cached: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const allCandidates: ContactCandidate[] = [];
    const sources: EnrichmentSource[] = [];
    const warnings: string[] = [];

    if (entityType !== "person") {
      try {
        const dsResult = await hunterDomainSearch(apiKey, domain, 20);
        if (dsResult.errors?.length) {
          warnings.push(`Hunter domain-search: ${dsResult.errors[0].details || "unknown error"}`);
        }
        const dsCandidates = candidatesFromDomainSearch(dsResult, domain);
        allCandidates.push(...dsCandidates);
        if (dsCandidates.length > 0) {
          sources.push({
            url: `https://${domain}`,
            title: `${dsResult.data?.organization || domain} - Domain Search`,
            snippet: `Pattern: ${dsResult.data?.pattern || "unknown"} | Found ${dsCandidates.length} emails`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Hunter domain-search failed: ${msg}`);
      }
    }

    const nameParts = normalizePersonName(ownerName);
    if (entityType === "person" || (nameParts.firstName && nameParts.lastName)) {
      if (nameParts.firstName && nameParts.lastName) {
        try {
          const efResult = await hunterEmailFinder(apiKey, {
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            domain,
            company: companyName,
          });
          if (efResult.errors?.length) {
            warnings.push(`Hunter email-finder: ${efResult.errors[0].details || "unknown error"}`);
          }
          const efCandidate = candidateFromEmailFinder(efResult, domain);
          if (efCandidate) {
            allCandidates.push(efCandidate);
            sources.push({
              url: `https://${domain}`,
              title: `Email Finder: ${nameParts.firstName} ${nameParts.lastName}`,
              snippet: `Found: ${efCandidate.value} (score: ${efResult.data?.score ?? "?"})`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Hunter email-finder failed: ${msg}`);
        }
      } else {
        warnings.push("Could not split owner name into first/last for email finder.");
      }
    }

    let candidates = deduplicateByEmail(allCandidates);

    const toVerify = candidates.filter((c) => !c.verificationStatus).slice(0, MAX_VERIFY);
    for (const candidate of toVerify) {
      try {
        const vResult = await hunterEmailVerifier(apiKey, candidate.value);
        if (vResult.data?.status) {
          candidate.verificationStatus = vResult.data.status;
        }
      } catch {
        // skip verification failures silently
      }
    }

    candidates = candidates.sort((a, b) => b.confidence - a.confidence);

    const enrichmentResult = { domain, sources, candidates, warnings };

    const hasResults = candidates.length > 0 || sources.length > 0;
    const ttl = hasResults ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

    await db.from("web_enrichment_cache").upsert(
      {
        owner_name_key: cacheKey,
        owner_entity_id: ownerId || null,
        results: enrichmentResult,
        expires_at: new Date(Date.now() + ttl).toISOString(),
      },
      { onConflict: "owner_name_key" }
    );

    return new Response(
      JSON.stringify(enrichmentResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("owner-hunter-enrich error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
