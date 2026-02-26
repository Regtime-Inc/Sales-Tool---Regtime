import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_PAGES_PER_RUN = 10;
const FETCH_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const MAX_TEXT_LENGTH = 25000;
const SNIPPET_RADIUS = 60;
const SEARCH_TOP_N = 15;
const MAX_CONSECUTIVE_FAILURES = 3;
const EMPTY_CACHE_TTL_MS = 60 * 60 * 1000;
const FULL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BLOCKED_DOMAINS = [
  "linkedin.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "tiktok.com",
  "pinterest.com", "reddit.com",
  "login.", "signin.", "auth.",
  "accounts.google.com", "appleid.apple.com",
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

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

interface ContactCandidate {
  type: "email" | "phone" | "address";
  value: string;
  confidence: number;
  sourceUrl: string;
  evidenceSnippet: string;
  extractedAt: string;
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

function normalizeCacheKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\b(LLC|INC|CORP|LTD|LP|CO|THE|PLLC|LLP)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithRetry(
  url: string,
  opts?: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError || new Error("fetch failed");
}

async function fastSearch(apiKey: string, query: string, warnings: string[]): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    search: query,
  });

  let res: Response;
  try {
    res = await fetchWithRetry(
      `https://app.scrapingbee.com/api/v1/store/google?${params}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ScrapingBee search fetch error:", msg);
    warnings.push(`Search request failed: ${msg}`);
    return [];
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("ScrapingBee search error:", res.status, errBody.slice(0, 500));
    warnings.push(`ScrapingBee search returned HTTP ${res.status}`);
    return [];
  }

  const raw = await res.json();
  const data = raw?.body || raw;

  console.log("ScrapingBee response keys:", Object.keys(raw || {}).join(", "));

  const items = data?.organic_results || data?.results || (Array.isArray(data) ? data : null);

  if (!items || !Array.isArray(items)) {
    const keys = data ? Object.keys(data).join(", ") : "null";
    console.error("ScrapingBee unexpected response structure. Keys:", keys);
    warnings.push(`Search returned unexpected format (keys: ${keys})`);
    return [];
  }

  const results: SearchResult[] = [];
  for (const item of items) {
    const url = item.link || item.url || "";
    const title = item.title || "";
    if (url && title) {
      results.push({ title, url, snippet: item.snippet || item.description || "" });
    }
  }

  if (results.length === 0 && items.length > 0) {
    const sampleKeys = Object.keys(items[0] || {}).join(", ");
    console.error("ScrapingBee items found but no url/title. Sample keys:", sampleKeys);
    warnings.push(`Search returned ${items.length} items but none had url+title (keys: ${sampleKeys})`);
  }

  return results;
}

async function fetchPageHtml(apiKey: string, url: string): Promise<string> {
  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render_js: "false",
  });
  const res = await fetchWithRetry(
    `https://app.scrapingbee.com/api/v1?${params}`
  );
  if (!res.ok) {
    console.error("Page fetch error:", res.status, url);
    return "";
  }
  return res.text();
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
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }
  return text;
}

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
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

function extractContactsFromPage(
  sourceUrl: string,
  title: string,
  snippet: string,
  pageText: string
): ContactCandidate[] {
  const candidates: ContactCandidate[] = [];
  const combined = [snippet, pageText].filter(Boolean).join(" ");
  const now = new Date().toISOString();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = emailRe.exec(combined)) !== null) {
    const email = match[0].toLowerCase();
    if (isSkippedEmail(email)) continue;
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    candidates.push({
      type: "email",
      value: email,
      confidence: 0.65,
      sourceUrl,
      evidenceSnippet: extractSnippet(combined, match.index, match[0].length),
      extractedAt: now,
    });
  }

  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  while ((match = phoneRe.exec(combined)) !== null) {
    const digits = normalizePhone(match[0]);
    if (digits.length < 10 || digits.length > 11) continue;
    if (/^(\d)\1{9}$/.test(digits)) continue;
    if (seenPhones.has(digits)) continue;
    seenPhones.add(digits);
    candidates.push({
      type: "phone",
      value: match[0].trim(),
      confidence: 0.6,
      sourceUrl,
      evidenceSnippet: extractSnippet(combined, match.index, match[0].length),
      extractedAt: now,
    });
  }

  return candidates;
}

function deduplicateCandidates(candidates: ContactCandidate[]): ContactCandidate[] {
  const seen = new Map<string, ContactCandidate>();
  for (const c of candidates) {
    let key: string;
    if (c.type === "email") {
      key = `email:${c.value.toLowerCase()}`;
    } else if (c.type === "phone") {
      key = `phone:${normalizePhone(c.value)}`;
    } else {
      key = `address:${c.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40)}`;
    }
    const existing = seen.get(key);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(key, c);
    }
  }
  return [...seen.values()];
}

function buildSearchQueries(ownerName: string): string[] {
  const base = ownerName.trim();
  return [
    `${base} email contact`,
    `${base} phone number`,
    `${base} NYC real estate`,
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SCRAPINGBEE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ScrapingBee API key not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const ownerName: string = body.ownerName || "";
    const ownerId: string | undefined = body.ownerId;
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

    const cacheKey = normalizeCacheKey(ownerName);

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

    const queries = buildSearchQueries(ownerName);
    const allSearchResults: SearchResult[] = [];
    const seenUrls = new Set<string>();
    const warnings: string[] = [];

    for (let qi = 0; qi < queries.length; qi++) {
      const results = await fastSearch(apiKey, queries[qi], warnings);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allSearchResults.push(r);
        }
      }
      if (qi === 0 && results.length === 0) {
        warnings.push("First search returned no results; skipping remaining queries to conserve API credits.");
        break;
      }
    }

    console.log(`ScrapingBee search returned ${allSearchResults.length} unique URLs for "${ownerName}"`);

    const topResults = allSearchResults.slice(0, SEARCH_TOP_N);
    const sources: { url: string; title: string; snippet?: string }[] = [];
    const allCandidates: ContactCandidate[] = [];
    let fetchCount = 0;
    let consecutiveFailures = 0;

    for (const result of topResults) {
      if (fetchCount >= MAX_PAGES_PER_RUN) {
        warnings.push(`Reached page-fetch limit (${MAX_PAGES_PER_RUN}); remaining results skipped.`);
        break;
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        warnings.push(`${MAX_CONSECUTIVE_FAILURES} consecutive page fetches failed; aborting to conserve API credits.`);
        break;
      }

      if (isBlockedDomain(result.url)) {
        continue;
      }

      try {
        const html = await fetchPageHtml(apiKey, result.url);
        fetchCount++;

        if (html.length < 100) {
          consecutiveFailures++;
          continue;
        }

        consecutiveFailures = 0;
        const pageText = htmlToText(html);
        const contacts = extractContactsFromPage(
          result.url,
          result.title,
          result.snippet || "",
          pageText
        );

        sources.push({ url: result.url, title: result.title, snippet: result.snippet });
        allCandidates.push(...contacts);
      } catch (err) {
        fetchCount++;
        consecutiveFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to fetch ${result.url}: ${msg}`);
      }

      if (fetchCount < MAX_PAGES_PER_RUN) {
        await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
      }
    }

    const candidates = deduplicateCandidates(allCandidates);

    const enrichmentResult = { sources, candidates, warnings };

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
    console.error("owner-web-enrich error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
