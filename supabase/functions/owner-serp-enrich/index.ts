import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_FETCH = 5;
const PAGE_DELAY_MS = 1000;
const MAX_TEXT_LENGTH = 25000;
const SNIPPET_RADIUS = 80;

const BLOCKED_DOMAINS = [
  "linkedin.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "tiktok.com",
  "pinterest.com", "reddit.com",
  "login.", "signin.", "auth.",
  "accounts.google.com", "appleid.apple.com",
  "youtube.com", "yelp.com",
];

const SKIP_EMAIL_PREFIXES = [
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "support", "help", "admin", "webmaster",
  "privacy", "abuse", "postmaster", "mailer-daemon",
  "unsubscribe", "feedback", "newsletter", "notifications",
];

const SKIP_EMAIL_DOMAINS = [
  "example.com", "example.org", "test.com", "localhost",
  "sentry.io", "gravatar.com", "schema.org", "w3.org",
  "googleapis.com", "googleusercontent.com",
];

interface SerpSearchParams {
  q: string;
  location?: string;
  google_domain?: string;
  hl?: string;
  gl?: string;
  num?: number;
}

interface SerpOrganicResult {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
}

interface SerpKnowledgeGraph {
  title?: string;
  type?: string;
  website?: string;
  phone?: string;
  address?: string;
  email?: string;
  description?: string;
  social_links?: Array<{ name?: string; link?: string }>;
}

interface SerpLocalResult {
  title?: string;
  phone?: string;
  address?: string;
  website?: string;
  links?: Record<string, string>;
  position?: number;
}

interface SerpAnswerBox {
  title?: string;
  answer?: string;
  snippet?: string;
  highlighted_words?: string[];
}

interface SerpResponse {
  organic_results?: SerpOrganicResult[];
  knowledge_graph?: SerpKnowledgeGraph;
  answer_box?: SerpAnswerBox;
  local_results?: { places?: SerpLocalResult[] };
  search_metadata?: { id?: string; status?: string; total_time_taken?: number };
}

interface ContactCandidate {
  type: "email" | "phone" | "address";
  value: string;
  confidence: number;
  sourceUrl: string;
  evidenceSnippet: string;
  source: string;
  extractedAt: string;
}

interface EnrichmentSource {
  url: string;
  title: string;
  snippet?: string;
  provider: string;
}

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d) || hostname.startsWith(d)
    );
  } catch {
    return true;
  }
}

function normalizeCacheKey(ownerName: string, location?: string): string {
  const name = ownerName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE|PLLC|LLP)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const loc = location?.toUpperCase().replace(/[^A-Z0-9]/g, "").trim() || "";
  return `serpapi:${name}:${loc}`;
}

function isSkippedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const localPart = lower.split("@")[0];
  const domain = lower.split("@")[1];
  if (!domain) return true;
  if (SKIP_EMAIL_PREFIXES.some((p) => localPart === p || localPart.startsWith(p + "+"))) return true;
  if (SKIP_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(domain)) return true;
  return false;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#?\w+;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);
  return text;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function googleSearch(apiKey: string, params: SerpSearchParams): Promise<SerpResponse> {
  const qs = new URLSearchParams({
    engine: "google",
    api_key: apiKey,
    q: params.q,
    num: String(params.num || 10),
  });
  if (params.location) qs.set("location", params.location);
  if (params.google_domain) qs.set("google_domain", params.google_domain);
  if (params.hl) qs.set("hl", params.hl);
  if (params.gl) qs.set("gl", params.gl);

  const res = await fetchWithTimeout(`https://serpapi.com/search.json?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpApi HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractFromSerp(serpData: SerpResponse, ownerName: string): {
  candidates: ContactCandidate[];
  knowledgeGraph?: { title?: string; website?: string; phone?: string; address?: string; description?: string };
} {
  const candidates: ContactCandidate[] = [];
  const now = new Date().toISOString();
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

  let kgOut: { title?: string; website?: string; phone?: string; address?: string; description?: string } | undefined;

  const kg = serpData.knowledge_graph;
  if (kg) {
    const kgUrl = kg.website || "";
    kgOut = {
      title: kg.title,
      website: kg.website,
      phone: kg.phone,
      address: kg.address,
      description: kg.description,
    };

    if (kg.phone) {
      const digits = normalizePhone(kg.phone);
      if (digits.length >= 10) {
        candidates.push({
          type: "phone",
          value: kg.phone,
          confidence: 0.9,
          sourceUrl: kgUrl || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
          evidenceSnippet: `Knowledge Graph phone: ${kg.phone} (${kg.title || ownerName})`,
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }

    if (kg.email && !isSkippedEmail(kg.email)) {
      candidates.push({
        type: "email",
        value: kg.email.toLowerCase(),
        confidence: 0.9,
        sourceUrl: kgUrl || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
        evidenceSnippet: `Knowledge Graph email: ${kg.email} (${kg.title || ownerName})`,
        source: "serpapi_serp",
        extractedAt: now,
      });
    }

    if (kg.address) {
      candidates.push({
        type: "address",
        value: kg.address,
        confidence: 0.85,
        sourceUrl: kgUrl || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
        evidenceSnippet: `Knowledge Graph address: ${kg.address} (${kg.title || ownerName})`,
        source: "serpapi_serp",
        extractedAt: now,
      });
    }

    if (kg.website) {
      candidates.push({
        type: "address",
        value: kg.website,
        confidence: 0.9,
        sourceUrl: kg.website,
        evidenceSnippet: `Knowledge Graph website: ${kg.website} (${kg.title || ownerName})`,
        source: "serpapi_serp",
        extractedAt: now,
      });
    }
  }

  const places = serpData.local_results?.places || [];
  for (const place of places.slice(0, 5)) {
    const placeUrl = place.website || place.links?.website || "";
    if (place.phone) {
      const digits = normalizePhone(place.phone);
      if (digits.length >= 10) {
        candidates.push({
          type: "phone",
          value: place.phone,
          confidence: 0.8,
          sourceUrl: placeUrl || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
          evidenceSnippet: `Local result: ${place.title} - phone: ${place.phone}`,
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }
    if (place.address) {
      candidates.push({
        type: "address",
        value: place.address,
        confidence: 0.8,
        sourceUrl: placeUrl || `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
        evidenceSnippet: `Local result: ${place.title} - address: ${place.address}`,
        source: "serpapi_serp",
        extractedAt: now,
      });
    }
  }

  const ab = serpData.answer_box;
  if (ab) {
    const abText = [ab.title, ab.answer, ab.snippet].filter(Boolean).join(" ");
    let match: RegExpExecArray | null;
    while ((match = emailRe.exec(abText)) !== null) {
      const email = match[0].toLowerCase();
      if (!isSkippedEmail(email)) {
        candidates.push({
          type: "email",
          value: email,
          confidence: 0.7,
          sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
          evidenceSnippet: extractSnippet(abText, match.index, match[0].length),
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }
    while ((match = phoneRe.exec(abText)) !== null) {
      const digits = normalizePhone(match[0]);
      if (digits.length >= 10 && digits.length <= 11 && !/^(\d)\1{9}$/.test(digits)) {
        candidates.push({
          type: "phone",
          value: match[0].trim(),
          confidence: 0.7,
          sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(ownerName)}`,
          evidenceSnippet: extractSnippet(abText, match.index, match[0].length),
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }
  }

  const organicResults = serpData.organic_results || [];
  for (const result of organicResults.slice(0, 15)) {
    const text = result.snippet || "";
    const link = result.link || "";
    if (!text || !link) continue;

    let match: RegExpExecArray | null;
    while ((match = emailRe.exec(text)) !== null) {
      const email = match[0].toLowerCase();
      if (!isSkippedEmail(email)) {
        candidates.push({
          type: "email",
          value: email,
          confidence: 0.6,
          sourceUrl: link,
          evidenceSnippet: extractSnippet(text, match.index, match[0].length),
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }
    while ((match = phoneRe.exec(text)) !== null) {
      const digits = normalizePhone(match[0]);
      if (digits.length >= 10 && digits.length <= 11 && !/^(\d)\1{9}$/.test(digits)) {
        candidates.push({
          type: "phone",
          value: match[0].trim(),
          confidence: 0.55,
          sourceUrl: link,
          evidenceSnippet: extractSnippet(text, match.index, match[0].length),
          source: "serpapi_serp",
          extractedAt: now,
        });
      }
    }
  }

  return { candidates, knowledgeGraph: kgOut };
}

function extractFromPageText(
  pageText: string,
  sourceUrl: string,
  ownerName: string
): ContactCandidate[] {
  const candidates: ContactCandidate[] = [];
  const now = new Date().toISOString();
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

  const upperName = ownerName.toUpperCase();
  const nameInPage = pageText.toUpperCase().includes(upperName);
  const baseConfidence = nameInPage ? 0.7 : 0.5;

  let match: RegExpExecArray | null;
  while ((match = emailRe.exec(pageText)) !== null) {
    const email = match[0].toLowerCase();
    if (isSkippedEmail(email)) continue;
    const nearName = nameInPage && Math.abs(
      pageText.toUpperCase().indexOf(upperName) - match.index
    ) < 500;
    candidates.push({
      type: "email",
      value: email,
      confidence: nearName ? 0.75 : baseConfidence,
      sourceUrl,
      evidenceSnippet: extractSnippet(pageText, match.index, match[0].length),
      source: "serpapi_page",
      extractedAt: now,
    });
  }

  while ((match = phoneRe.exec(pageText)) !== null) {
    const digits = normalizePhone(match[0]);
    if (digits.length < 10 || digits.length > 11) continue;
    if (/^(\d)\1{9}$/.test(digits)) continue;
    const nearName = nameInPage && Math.abs(
      pageText.toUpperCase().indexOf(upperName) - match.index
    ) < 500;
    candidates.push({
      type: "phone",
      value: match[0].trim(),
      confidence: nearName ? 0.65 : baseConfidence - 0.05,
      sourceUrl,
      evidenceSnippet: extractSnippet(pageText, match.index, match[0].length),
      source: "serpapi_page",
      extractedAt: now,
    });
  }

  return candidates;
}

function deduplicateCandidates(candidates: ContactCandidate[]): ContactCandidate[] {
  const seen = new Map<string, ContactCandidate>();
  for (const c of candidates) {
    let key: string;
    if (c.type === "email") key = `email:${c.value.toLowerCase()}`;
    else if (c.type === "phone") key = `phone:${normalizePhone(c.value)}`;
    else key = `address:${c.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 50)}`;
    const existing = seen.get(key);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(key, c);
    }
  }
  return [...seen.values()];
}

const EMPTY_CACHE_TTL_MS = 60 * 60 * 1000;
const FULL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SERPAPI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SerpApi API key not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const ownerName: string = body.ownerName || "";
    const ownerId: string | undefined = body.ownerId;
    const entityType: string | undefined = body.entityType;
    const locationHint: string | undefined = body.locationHint;
    const forceRefresh: boolean = body.forceRefresh === true;
    const cacheOnly: boolean = body.cacheOnly === true;

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

    const cacheKey = normalizeCacheKey(ownerName, locationHint);

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

    if (cacheOnly) {
      return new Response(
        JSON.stringify({ candidates: [], sources: [], warnings: [], cached: false, noCache: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const locSuffix = locationHint ? ` ${locationHint}` : "";
    const queries: SerpSearchParams[] = [
      { q: `${ownerName} contact email phone${locSuffix}`, location: locationHint, num: 10 },
      { q: `${ownerName} address phone${locSuffix}`, location: locationHint, num: 10 },
    ];

    const allCandidates: ContactCandidate[] = [];
    const sources: EnrichmentSource[] = [];
    const warnings: string[] = [];
    const seenUrls = new Set<string>();
    let knowledgeGraph: { title?: string; website?: string; phone?: string; address?: string; description?: string } | undefined;
    const organicUrlsForFetch: string[] = [];

    for (const params of queries) {
      try {
        const serpData = await googleSearch(apiKey, params);
        const extracted = extractFromSerp(serpData, ownerName);
        allCandidates.push(...extracted.candidates);
        if (extracted.knowledgeGraph && !knowledgeGraph) {
          knowledgeGraph = extracted.knowledgeGraph;
        }

        for (const result of serpData.organic_results || []) {
          const link = result.link || "";
          if (link && !seenUrls.has(link)) {
            seenUrls.add(link);
            sources.push({
              url: link,
              title: result.title || "",
              snippet: result.snippet,
              provider: "serpapi",
            });
            if (!isBlockedDomain(link) && organicUrlsForFetch.length < MAX_PAGE_FETCH) {
              organicUrlsForFetch.push(link);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`SerpApi query failed: ${msg}`);
      }
    }

    let fetchCount = 0;
    for (const url of organicUrlsForFetch) {
      if (fetchCount >= MAX_PAGE_FETCH) break;
      try {
        const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
        fetchCount++;
        if (!res.ok) continue;
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) continue;
        const raw = await res.text();
        if (raw.length < 200) continue;
        const pageText = htmlToText(raw);
        const pageCandidates = extractFromPageText(pageText, url, ownerName);
        allCandidates.push(...pageCandidates);
      } catch {
        // skip failed page fetches silently
      }
      if (fetchCount < MAX_PAGE_FETCH) {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      }
    }

    const candidates = deduplicateCandidates(allCandidates);
    const enrichmentResult = {
      sources: sources.map(({ url, title, snippet }) => ({ url, title, snippet })),
      candidates,
      warnings,
      knowledgeGraph,
    };

    const hasResults = candidates.length > 0 || sources.length > 0;
    const ttl = hasResults ? FULL_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;

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
    console.error("owner-serp-enrich error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
