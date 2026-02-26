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
const ACRIS_LEGALS_ID = "8h5j-fqxa";
const ACRIS_PARTIES_ID = "636b-3b5g";

const ACRIS_BASE = "https://a836-acris.nyc.gov/DS/DocumentSearch";
const ACRIS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_LOOKBACK_DAYS = 45;
const MAX_LOOKBACK_DAYS = 90;
const BATCH_SIZE = 200;
const UPSERT_CHUNK = 500;
const SOCRATA_PAGE_SIZE = 10000;
const MAX_SOCRATA_PAGES = 5;

const DEED_TYPES = ["DEED", "DEEDO", "ADED", "EXED", "RDED", "TORD"];
const MORTGAGE_TYPES = ["MTGE", "AGMT", "ASPM", "SMTG"];
const ALL_DOC_TYPES = [...DEED_TYPES, ...MORTGAGE_TYPES];

const ALL_BOROUGHS = ["1", "2", "3", "4", "5"];

type SupabaseClient = ReturnType<typeof createClient>;

interface MasterRow {
  document_id: string;
  doc_type: string;
  document_date: string;
  recorded_datetime: string;
  document_amt: string;
  crfn?: string;
}

interface LegalRow {
  document_id: string;
  borough: string;
  block: string;
  lot: string;
}

interface PartyRow {
  document_id: string;
  party_type: string;
  name: string;
}

interface NormalizedDoc {
  document_id: string;
  crfn: string | null;
  recorded_date: string;
  doc_type: string;
  borough: string;
  block: string;
  lot: string;
  bbl: string;
  party1: string | null;
  party2: string | null;
  amount: number | null;
  source: string;
  raw_payload_json: Record<string, unknown>;
}

interface PhaseResult {
  ingested: number;
  skipped: number;
  errors: string[];
  dateRange: { from: string; to: string };
  blocked?: boolean;
  pagesScraped?: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildBbl(
  borough: number | string,
  block: string,
  lot: string
): string {
  const boro = typeof borough === "string" ? parseInt(borough) : borough;
  if (isNaN(boro) || boro < 1 || boro > 5) return "";
  const blk = parseInt(block).toString().padStart(5, "0");
  const lt = parseInt(lot).toString().padStart(4, "0");
  return `${boro}${blk}${lt}`;
}

function socrataUrl(datasetId: string, where: string, extra = "") {
  const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
  let url = `${NYC_DATA_BASE}/${datasetId}.json?$where=${encodeURIComponent(where)}${extra}`;
  if (appToken) url += `&$$app_token=${appToken}`;
  return url;
}

async function fetchJsonSafe(url: string, retries = 2): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) return await res.json();
      if (res.status === 429 && attempt < retries) {
        console.warn(`[acris-sync] 429 rate-limited (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const body = await res.text().catch(() => "");
      console.error(
        `[acris-sync] HTTP ${res.status} – ${body.slice(0, 300)}`
      );
    } catch (err) {
      console.error(
        `[acris-sync] Network error (attempt ${attempt + 1}): ${err}`
      );
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
    }
  }
  return [];
}

async function detectLatestSocrataDate(): Promise<string | null> {
  const typeFilter = ALL_DOC_TYPES.map((t) => `'${t}'`).join(",");
  const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
  let url = `${NYC_DATA_BASE}/${ACRIS_MASTER_ID}.json?$select=${encodeURIComponent(`max(recorded_datetime) as max_dt`)}&$where=${encodeURIComponent(`doc_type in(${typeFilter})`)}`;
  if (appToken) url += `&$$app_token=${appToken}`;
  console.log("[acris-sync] Detecting latest Socrata date...");
  const rows = await fetchJsonSafe(url);
  if (rows.length > 0 && rows[0].max_dt) {
    const maxDate = rows[0].max_dt.split("T")[0];
    console.log(`[acris-sync] Latest Socrata date: ${maxDate}`);
    return maxDate;
  }
  return null;
}

async function fetchMasterDocsPaginated(
  cutoffDate: string,
  endDate: string
): Promise<Map<string, MasterRow>> {
  const typeFilter = ALL_DOC_TYPES.map((t) => `'${t}'`).join(",");
  const where =
    `doc_type in(${typeFilter})` +
    ` AND recorded_datetime >= '${cutoffDate}'` +
    ` AND recorded_datetime <= '${endDate}T23:59:59'`;

  const docMap = new Map<string, MasterRow>();

  for (let page = 0; page < MAX_SOCRATA_PAGES; page++) {
    const offset = page * SOCRATA_PAGE_SIZE;
    const url = socrataUrl(
      ACRIS_MASTER_ID,
      where,
      `&$select=document_id,doc_type,document_date,recorded_datetime,document_amt,crfn` +
        `&$order=recorded_datetime DESC&$limit=${SOCRATA_PAGE_SIZE}&$offset=${offset}`
    );

    console.log(
      `[acris-sync] Fetching master page ${page + 1}: ${cutoffDate} to ${endDate} (offset ${offset})`
    );
    const rows: MasterRow[] = await fetchJsonSafe(url);
    console.log(`[acris-sync] Page ${page + 1} returned ${rows.length} rows`);

    for (const r of rows) {
      if (!r.document_id) continue;
      if (!docMap.has(r.document_id)) {
        docMap.set(r.document_id, r);
      }
    }

    if (rows.length < SOCRATA_PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(
    `[acris-sync] Master total: ${docMap.size} unique documents`
  );
  return docMap;
}

async function fetchLegals(
  docIds: string[],
  boroughs: string[]
): Promise<LegalRow[]> {
  const allLegals: LegalRow[] = [];
  const boroFilter =
    boroughs.length < 5
      ? ` AND borough in(${boroughs.map((b) => `'${parseInt(b)}'`).join(",")})`
      : "";

  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const batch = docIds.slice(i, i + BATCH_SIZE);
    const idList = batch.map((id) => `'${id}'`).join(",");
    const url = socrataUrl(
      ACRIS_LEGALS_ID,
      `document_id in(${idList})${boroFilter}`,
      `&$select=document_id,borough,block,lot&$limit=5000`
    );
    const rows: LegalRow[] = await fetchJsonSafe(url);
    allLegals.push(...rows);

    if (i + BATCH_SIZE < docIds.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return allLegals;
}

async function fetchParties(
  docIds: string[]
): Promise<Map<string, { party1: string; party2: string }>> {
  const partyMap = new Map<
    string,
    { sellers: string[]; buyers: string[] }
  >();

  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const batch = docIds.slice(i, i + BATCH_SIZE);
    const idList = batch.map((id) => `'${id}'`).join(",");
    const url = socrataUrl(
      ACRIS_PARTIES_ID,
      `document_id in(${idList})`,
      `&$select=document_id,party_type,name&$limit=10000`
    );

    let rows: PartyRow[] = [];
    try {
      rows = await fetchJsonSafe(url);
    } catch {
      console.warn(
        `[acris-sync] Party fetch failed for batch at offset ${i}, continuing`
      );
      continue;
    }

    for (const r of rows) {
      if (!r.document_id || !r.name) continue;
      if (!partyMap.has(r.document_id)) {
        partyMap.set(r.document_id, { sellers: [], buyers: [] });
      }
      const entry = partyMap.get(r.document_id)!;
      if (String(r.party_type) === "1") entry.sellers.push(r.name);
      else if (String(r.party_type) === "2") entry.buyers.push(r.name);
    }

    if (i + BATCH_SIZE < docIds.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const result = new Map<string, { party1: string; party2: string }>();
  for (const [docId, parties] of partyMap) {
    result.set(docId, {
      party1: parties.sellers.join("; ") || "",
      party2: parties.buyers.join("; ") || "",
    });
  }
  return result;
}

function normalizeDocuments(
  masterDocs: Map<string, MasterRow>,
  legals: LegalRow[],
  parties: Map<string, { party1: string; party2: string }>,
  source: string
): NormalizedDoc[] {
  const results: NormalizedDoc[] = [];
  const seen = new Set<string>();

  for (const legal of legals) {
    if (
      !legal.document_id ||
      !legal.block ||
      !legal.lot ||
      !legal.borough
    )
      continue;

    const master = masterDocs.get(legal.document_id);
    if (!master) continue;

    const bbl = buildBbl(parseInt(legal.borough), legal.block, legal.lot);
    if (!bbl) continue;

    const dedupKey = `${legal.document_id}_${bbl}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const recordedDate = (
      master.recorded_datetime ||
      master.document_date ||
      ""
    ).split("T")[0];
    if (!recordedDate) continue;

    const party = parties.get(legal.document_id);
    const amt = parseFloat(master.document_amt);

    results.push({
      document_id: legal.document_id,
      crfn: master.crfn || null,
      recorded_date: recordedDate,
      doc_type: master.doc_type || "",
      borough: String(parseInt(legal.borough)),
      block: legal.block,
      lot: legal.lot,
      bbl,
      party1: party?.party1 || null,
      party2: party?.party2 || null,
      amount: isNaN(amt) ? null : amt,
      source,
      raw_payload_json: {
        master: { ...master },
        legal: {
          borough: legal.borough,
          block: legal.block,
          lot: legal.lot,
        },
      },
    });
  }

  return results;
}

async function upsertDocuments(
  supabase: SupabaseClient,
  docs: NormalizedDoc[]
): Promise<{ ingested: number; skipped: number; errors: string[] }> {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < docs.length; i += UPSERT_CHUNK) {
    const chunk = docs.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("acris_documents")
      .upsert(chunk, {
        onConflict: "document_id,bbl",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      console.error(
        `[acris-sync] Upsert error at offset ${i}: ${error.message}`
      );
      errors.push(`Chunk ${i}: ${error.message}`);
      skipped += chunk.length;
    } else {
      ingested += data?.length ?? chunk.length;
    }
  }

  return { ingested, skipped, errors };
}

async function backfillDiscoverySales(
  supabase: SupabaseClient,
  docs: NormalizedDoc[]
) {
  const deedDocs = docs.filter(
    (d) => DEED_TYPES.includes(d.doc_type) && d.amount && d.amount > 0
  );
  if (deedDocs.length === 0) return;

  const salesRows = deedDocs.map((d) => ({
    bbl: d.bbl,
    sale_date: d.recorded_date,
    sale_price: d.amount,
    doc_type: d.doc_type,
    source: "acris_realtime",
    document_id: d.document_id,
    cached_at: new Date().toISOString(),
  }));

  for (let i = 0; i < salesRows.length; i += UPSERT_CHUNK) {
    const chunk = salesRows.slice(i, i + UPSERT_CHUNK);
    await supabase.from("discovery_sales").upsert(chunk, {
      onConflict: "bbl,sale_date,source",
      ignoreDuplicates: true,
    });
  }

  console.log(
    `[acris-sync] Backfilled ${salesRows.length} deed records into discovery_sales`
  );
}

async function updateCoverage(
  supabase: SupabaseClient,
  source: string,
  dateFrom: string,
  dateTo: string,
  docCount: number,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("acris_data_coverage").upsert(
    {
      source,
      borough: "all",
      date_from: dateFrom,
      date_to: dateTo,
      doc_count: docCount,
      last_checked_at: new Date().toISOString(),
      last_ingested_at: docCount > 0 ? new Date().toISOString() : undefined,
      metadata_json: metadata,
    },
    { onConflict: "source,borough" }
  );
}

// ── Phase 1: Socrata Ingestion ──────────────────────────────────────

async function runSocrataPhase(
  supabase: SupabaseClient,
  lookbackDays: number,
  boroughs: string[]
): Promise<PhaseResult> {
  const latestDate = await detectLatestSocrataDate();
  if (!latestDate) {
    return {
      ingested: 0,
      skipped: 0,
      errors: ["Could not detect latest Socrata date"],
      dateRange: { from: "", to: "" },
    };
  }

  const endDt = new Date(latestDate + "T23:59:59Z");
  const startDt = new Date(endDt);
  startDt.setDate(startDt.getDate() - lookbackDays);

  const from = formatDate(startDt);
  const to = formatDate(endDt);

  const masterDocs = await fetchMasterDocsPaginated(from, to);
  if (masterDocs.size === 0) {
    await updateCoverage(supabase, "socrata", from, to, 0, {
      latestSocrataDate: latestDate,
    });
    return {
      ingested: 0,
      skipped: 0,
      errors: [],
      dateRange: { from, to },
    };
  }

  const docIds = Array.from(masterDocs.keys());
  const legals = await fetchLegals(docIds, boroughs);
  console.log(
    `[acris-sync] Socrata legals: ${legals.length} rows for ${docIds.length} documents`
  );

  let parties = new Map<string, { party1: string; party2: string }>();
  try {
    const legalDocIds = [...new Set(legals.map((l) => l.document_id))];
    parties = await fetchParties(legalDocIds);
    console.log(
      `[acris-sync] Socrata parties fetched for ${parties.size} documents`
    );
  } catch (err) {
    console.warn(`[acris-sync] Socrata party fetch failed: ${err}`);
  }

  const normalized = normalizeDocuments(
    masterDocs,
    legals,
    parties,
    "socrata"
  );
  console.log(
    `[acris-sync] Socrata normalized ${normalized.length} document-BBL pairs`
  );

  if (normalized.length === 0) {
    await updateCoverage(supabase, "socrata", from, to, 0, {
      latestSocrataDate: latestDate,
    });
    return {
      ingested: 0,
      skipped: 0,
      errors: [],
      dateRange: { from, to },
    };
  }

  const { ingested, skipped, errors } = await upsertDocuments(
    supabase,
    normalized
  );

  try {
    await backfillDiscoverySales(supabase, normalized);
  } catch (err) {
    console.warn(`[acris-sync] Socrata discovery backfill failed: ${err}`);
  }

  await updateCoverage(supabase, "socrata", from, to, ingested, {
    latestSocrataDate: latestDate,
    masterCount: masterDocs.size,
    legalsCount: legals.length,
    normalizedCount: normalized.length,
  });

  return { ingested, skipped, errors, dateRange: { from, to } };
}

// ── Phase 2: ACRIS Website Scraper ──────────────────────────────────

interface AcrisSession {
  cookies: string[];
  viewState: string;
  eventValidation: string;
  viewStateGenerator: string;
}

const SCRAPE_DELAY_MS = 2500;
const MAX_SCRAPE_PAGES = 25;

function extractFormTokens(html: string): Partial<AcrisSession> {
  const vs =
    html.match(
      /id="__VIEWSTATE"[^>]*value="([^"]*)"/
    )?.[1] || "";
  const ev =
    html.match(
      /id="__EVENTVALIDATION"[^>]*value="([^"]*)"/
    )?.[1] || "";
  const vsg =
    html.match(
      /id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/
    )?.[1] || "";
  return { viewState: vs, eventValidation: ev, viewStateGenerator: vsg };
}

function extractCookies(headers: Headers): string[] {
  const cookies: string[] = [];
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      const cookie = value.split(";")[0];
      if (cookie) cookies.push(cookie);
    }
  }
  return cookies;
}

function isBlocked(text: string): boolean {
  return (
    text.includes("Further access to ACRIS is denied") ||
    text.includes("Bandwidth") ||
    text.includes("exceeded the bandwidth")
  );
}

function buildCookieHeader(cookies: string[]): string {
  return cookies.join("; ");
}

interface ScrapedDoc {
  document_id: string;
  crfn: string;
  doc_type: string;
  recorded_date: string;
  document_date: string;
  party1: string;
  party2: string;
  amount: number | null;
  borough: string;
  block: string;
  lot: string;
}

function parseSearchResultsPage(html: string): ScrapedDoc[] {
  const docs: ScrapedDoc[] = [];

  const tableMatch = html.match(
    /id="(?:ContentPlaceHolder1_)?GridViewResults?"[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) {
    const rowRegex =
      /<tr[^>]*class="(?:GridRow|GridAltRow|[^"]*Row[^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const doc = parseResultRow(rowMatch[1]);
      if (doc) docs.push(doc);
    }
    return docs;
  }

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tableHtml = tableMatch[1];
  let rowMatch;
  let isHeader = true;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const doc = parseResultRow(rowMatch[1]);
    if (doc) docs.push(doc);
  }

  return docs;
}

function parseResultRow(rowHtml: string): ScrapedDoc | null {
  const cells: string[] = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
  }

  if (cells.length < 5) return null;

  const linkMatch = rowHtml.match(
    /DocumentDetail[/\\]([A-Z0-9]+)/i
  );
  const docIdFromLink = linkMatch ? linkMatch[1] : "";

  const crfnMatch = rowHtml.match(
    /(?:CRFN|crfn)[:\s]*([A-Z0-9-]+)/i
  );

  let docId = docIdFromLink;
  let crfn = crfnMatch ? crfnMatch[1] : "";
  let docType = "";
  let recordedDate = "";
  let party1 = "";
  let party2 = "";
  let amount: number | null = null;
  let borough = "";
  let block = "";
  let lot = "";

  if (cells.length >= 8) {
    if (!docId) docId = cells[0].replace(/\s/g, "");
    crfn = crfn || cells[1] || "";
    docType = cells[2] || "";
    recordedDate = normalizeDate(cells[3] || cells[4] || "");
    party1 = cells[5] || "";
    party2 = cells[6] || "";
    const amtStr = (cells[7] || "").replace(/[$,\s]/g, "");
    amount = amtStr ? parseFloat(amtStr) : null;
    if (amount !== null && isNaN(amount)) amount = null;
  } else if (cells.length >= 5) {
    if (!docId) docId = cells[0].replace(/\s/g, "");
    docType = cells[1] || "";
    recordedDate = normalizeDate(cells[2] || "");
    party1 = cells[3] || "";
    const amtStr = (cells[4] || "").replace(/[$,\s]/g, "");
    amount = amtStr ? parseFloat(amtStr) : null;
    if (amount !== null && isNaN(amount)) amount = null;
  }

  const bblMatch = rowHtml.match(
    /borough=(\d)&(?:amp;)?block=(\d+)&(?:amp;)?lot=(\d+)/i
  );
  if (bblMatch) {
    borough = bblMatch[1];
    block = bblMatch[2];
    lot = bblMatch[3];
  }

  if (!docId || docId.length < 10) return null;

  return {
    document_id: docId,
    crfn,
    doc_type: docType.toUpperCase(),
    recorded_date: recordedDate,
    document_date: recordedDate,
    party1,
    party2,
    amount,
    borough,
    block,
    lot,
  };
}

function normalizeDate(dateStr: string): string {
  const parts = dateStr.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (parts) {
    return `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }
  const iso = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return dateStr;
}

function hasNextPage(html: string): boolean {
  return (
    html.includes("Next") &&
    (html.includes('href="javascript:__doPostBack') ||
      html.includes("__EVENTTARGET"))
  );
}

async function initAcrisSession(): Promise<AcrisSession | null> {
  try {
    console.log("[acris-sync] Initializing ACRIS session...");
    const res = await fetch(`${ACRIS_BASE}/DocumentType`, {
      headers: {
        "User-Agent": ACRIS_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      console.error(
        `[acris-sync] ACRIS session init failed: ${res.status}`
      );
      return null;
    }

    const html = await res.text();

    if (isBlocked(html)) {
      console.warn("[acris-sync] ACRIS blocked on session init");
      return null;
    }

    const tokens = extractFormTokens(html);
    const cookies = extractCookies(res.headers);

    if (!tokens.viewState) {
      console.warn("[acris-sync] No __VIEWSTATE found in ACRIS response");
      return null;
    }

    console.log(
      `[acris-sync] ACRIS session initialized (${cookies.length} cookies)`
    );
    return {
      cookies,
      viewState: tokens.viewState || "",
      eventValidation: tokens.eventValidation || "",
      viewStateGenerator: tokens.viewStateGenerator || "",
    };
  } catch (err) {
    console.error(`[acris-sync] ACRIS session init error: ${err}`);
    return null;
  }
}

async function scrapeAcrisDocTypeSearch(
  session: AcrisSession,
  borough: string,
  docType: string,
  dateFrom: string,
  dateTo: string
): Promise<{ docs: ScrapedDoc[]; blocked: boolean; pagesScraped: number }> {
  const allDocs: ScrapedDoc[] = [];
  let blocked = false;
  let pagesScraped = 0;

  const fromParts = dateFrom.split("-");
  const toParts = dateTo.split("-");
  const formDateFrom = `${fromParts[1]}/${fromParts[2]}/${fromParts[0]}`;
  const formDateTo = `${toParts[1]}/${toParts[2]}/${toParts[0]}`;

  const formData = new URLSearchParams();
  formData.set("__VIEWSTATE", session.viewState);
  formData.set("__EVENTVALIDATION", session.eventValidation);
  if (session.viewStateGenerator) {
    formData.set("__VIEWSTATEGENERATOR", session.viewStateGenerator);
  }
  formData.set("hid_borough", borough);
  formData.set("hid_borough_name", "");
  formData.set("hid_doctype", docType);
  formData.set("hid_doctype_name", "");
  formData.set("hid_max_rows", "10");
  formData.set("hid_page", "1");
  formData.set("hid_datefromm", fromParts[1]);
  formData.set("hid_datefromd", fromParts[2]);
  formData.set("hid_datefromy", fromParts[0]);
  formData.set("hid_datetom", toParts[1]);
  formData.set("hid_datetod", toParts[2]);
  formData.set("hid_datetoy", toParts[0]);
  formData.set(
    "ContentPlaceHolder1$btnSearch",
    "Search"
  );

  try {
    console.log(
      `[acris-sync] ACRIS search: boro=${borough} type=${docType} ${formDateFrom}-${formDateTo}`
    );

    const res = await fetch(
      `${ACRIS_BASE}/DocumentTypeResult`,
      {
        method: "POST",
        headers: {
          "User-Agent": ACRIS_UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `${ACRIS_BASE}/DocumentType`,
          Origin: "https://a836-acris.nyc.gov",
          Connection: "keep-alive",
          Cookie: buildCookieHeader(session.cookies),
        },
        body: formData.toString(),
        redirect: "follow",
      }
    );

    if (!res.ok) {
      console.error(`[acris-sync] ACRIS search returned ${res.status}`);
      return { docs: allDocs, blocked: false, pagesScraped };
    }

    const newCookies = extractCookies(res.headers);
    if (newCookies.length > 0) {
      session.cookies = [
        ...session.cookies,
        ...newCookies,
      ];
    }

    let html = await res.text();

    if (isBlocked(html)) {
      console.warn("[acris-sync] ACRIS blocked during search");
      return { docs: allDocs, blocked: true, pagesScraped };
    }

    pagesScraped++;
    const pageDocs = parseSearchResultsPage(html);
    for (const doc of pageDocs) {
      if (!doc.borough) doc.borough = borough;
      allDocs.push(doc);
    }
    console.log(
      `[acris-sync] ACRIS page ${pagesScraped}: ${pageDocs.length} docs`
    );

    while (
      hasNextPage(html) &&
      pagesScraped < MAX_SCRAPE_PAGES
    ) {
      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

      const tokens = extractFormTokens(html);
      const nextFormData = new URLSearchParams();
      nextFormData.set(
        "__VIEWSTATE",
        tokens.viewState || session.viewState
      );
      nextFormData.set(
        "__EVENTVALIDATION",
        tokens.eventValidation || session.eventValidation
      );
      nextFormData.set(
        "__EVENTTARGET",
        "ContentPlaceHolder1$GridViewResults"
      );
      nextFormData.set(
        "__EVENTARGUMENT",
        `Page$${pagesScraped + 1}`
      );

      try {
        const nextRes = await fetch(
          `${ACRIS_BASE}/DocumentTypeResult`,
          {
            method: "POST",
            headers: {
              "User-Agent": ACRIS_UA,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              Referer: `${ACRIS_BASE}/DocumentTypeResult`,
              Origin: "https://a836-acris.nyc.gov",
              Cookie: buildCookieHeader(session.cookies),
            },
            body: nextFormData.toString(),
            redirect: "follow",
          }
        );

        if (!nextRes.ok) break;

        html = await nextRes.text();

        if (isBlocked(html)) {
          console.warn("[acris-sync] ACRIS blocked during pagination");
          blocked = true;
          break;
        }

        pagesScraped++;
        const nextDocs = parseSearchResultsPage(html);
        for (const doc of nextDocs) {
          if (!doc.borough) doc.borough = borough;
          allDocs.push(doc);
        }
        console.log(
          `[acris-sync] ACRIS page ${pagesScraped}: ${nextDocs.length} docs`
        );

        if (nextDocs.length === 0) break;
      } catch (pageErr) {
        console.warn(
          `[acris-sync] ACRIS pagination error: ${pageErr}`
        );
        break;
      }
    }
  } catch (err) {
    console.error(`[acris-sync] ACRIS search error: ${err}`);
  }

  return { docs: allDocs, blocked, pagesScraped };
}

function scrapedToNormalized(
  docs: ScrapedDoc[],
  defaultBorough: string
): NormalizedDoc[] {
  const results: NormalizedDoc[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    const borough = doc.borough || defaultBorough;
    const block = doc.block || "00000";
    const lot = doc.lot || "0000";
    const bbl = buildBbl(parseInt(borough), block, lot);
    if (!bbl) continue;

    const dedupKey = `${doc.document_id}_${bbl}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const recordedDate = doc.recorded_date || doc.document_date;
    if (!recordedDate) continue;

    results.push({
      document_id: doc.document_id,
      crfn: doc.crfn || null,
      recorded_date: recordedDate,
      doc_type: doc.doc_type,
      borough,
      block,
      lot,
      bbl,
      party1: doc.party1 || null,
      party2: doc.party2 || null,
      amount: doc.amount,
      source: "acris_live",
      raw_payload_json: {
        scrape: { ...doc },
        method: "acris_website",
      },
    });
  }

  return results;
}

async function runAcrisScrapePhase(
  supabase: SupabaseClient,
  socrataEndDate: string,
  boroughs: string[]
): Promise<PhaseResult> {
  const today = formatDate(new Date());
  const gapStart = new Date(socrataEndDate + "T00:00:00Z");
  gapStart.setDate(gapStart.getDate() + 1);
  const gapStartStr = formatDate(gapStart);

  if (gapStartStr > today) {
    console.log("[acris-sync] No gap to fill - Socrata data is current");
    return {
      ingested: 0,
      skipped: 0,
      errors: [],
      dateRange: { from: gapStartStr, to: today },
    };
  }

  console.log(
    `[acris-sync] ACRIS scrape phase: ${gapStartStr} to ${today}`
  );

  const session = await initAcrisSession();
  if (!session) {
    return {
      ingested: 0,
      skipped: 0,
      errors: [
        "ACRIS website session could not be established. The site may be blocking automated access.",
      ],
      dateRange: { from: gapStartStr, to: today },
      blocked: true,
      pagesScraped: 0,
    };
  }

  const allScraped: ScrapedDoc[] = [];
  let totalPagesScraped = 0;
  let wasBlocked = false;
  const scrapeDocTypes = [...DEED_TYPES, ...MORTGAGE_TYPES];

  for (const borough of boroughs) {
    if (wasBlocked) break;

    for (const docType of scrapeDocTypes) {
      if (wasBlocked) break;

      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

      const { docs, blocked, pagesScraped } =
        await scrapeAcrisDocTypeSearch(
          session,
          borough,
          docType,
          gapStartStr,
          today
        );

      allScraped.push(...docs);
      totalPagesScraped += pagesScraped;

      if (blocked) {
        wasBlocked = true;
        console.warn(
          `[acris-sync] ACRIS blocked after borough=${borough} type=${docType}`
        );
      }
    }
  }

  console.log(
    `[acris-sync] ACRIS scrape total: ${allScraped.length} docs from ${totalPagesScraped} pages`
  );

  if (allScraped.length === 0) {
    await updateCoverage(
      supabase,
      "acris_live",
      gapStartStr,
      today,
      0,
      {
        blocked: wasBlocked,
        pagesScraped: totalPagesScraped,
      }
    );
    return {
      ingested: 0,
      skipped: 0,
      errors: wasBlocked
        ? [
            "ACRIS website blocked automated access. Partial or no data was retrieved.",
          ]
        : [],
      dateRange: { from: gapStartStr, to: today },
      blocked: wasBlocked,
      pagesScraped: totalPagesScraped,
    };
  }

  const normalized: NormalizedDoc[] = [];
  for (const borough of boroughs) {
    const boroDocs = allScraped.filter(
      (d) => d.borough === borough || !d.borough
    );
    normalized.push(...scrapedToNormalized(boroDocs, borough));
  }

  const deduped = new Map<string, NormalizedDoc>();
  for (const doc of normalized) {
    const key = `${doc.document_id}_${doc.bbl}`;
    if (!deduped.has(key)) deduped.set(key, doc);
  }

  const finalDocs = Array.from(deduped.values());
  console.log(
    `[acris-sync] ACRIS scrape normalized: ${finalDocs.length} unique doc-BBL pairs`
  );

  const { ingested, skipped, errors } = await upsertDocuments(
    supabase,
    finalDocs
  );

  try {
    await backfillDiscoverySales(supabase, finalDocs);
  } catch (err) {
    console.warn(
      `[acris-sync] ACRIS scrape discovery backfill failed: ${err}`
    );
  }

  await updateCoverage(
    supabase,
    "acris_live",
    gapStartStr,
    today,
    ingested,
    {
      blocked: wasBlocked,
      pagesScraped: totalPagesScraped,
      scrapedDocs: allScraped.length,
      normalizedDocs: finalDocs.length,
    }
  );

  return {
    ingested,
    skipped,
    errors,
    dateRange: { from: gapStartStr, to: today },
    blocked: wasBlocked,
    pagesScraped: totalPagesScraped,
  };
}

// ── Phase 3: CRFN-to-DocId Enrichment ───────────────────────────────

async function runCrfnEnrichment(
  supabase: SupabaseClient
): Promise<{ enriched: number; skipped: number; errors: string[] }> {
  let enriched = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { data: candidates, error: fetchErr } = await supabase
    .from("acris_documents")
    .select("id, document_id, crfn, bbl")
    .not("crfn", "is", null)
    .neq("crfn", "")
    .in("source", ["html_upload", "manual_paste", "screen_capture"])
    .limit(1000);

  if (fetchErr) {
    errors.push(`CRFN candidate fetch: ${fetchErr.message}`);
    return { enriched, skipped, errors };
  }

  const needsEnrichment = (candidates || []).filter(
    (r: any) => !/^\d{16}$/.test(r.document_id)
  );

  if (needsEnrichment.length === 0) {
    console.log("[acris-sync] No CRFN-only records need enrichment");
    return { enriched, skipped, errors };
  }

  console.log(
    `[acris-sync] ${needsEnrichment.length} CRFN-only records to enrich`
  );

  const crfns = [
    ...new Set(
      needsEnrichment.map((r: any) => r.crfn as string).filter(Boolean)
    ),
  ];
  const crfnToDocId = new Map<string, string>();

  for (let i = 0; i < crfns.length; i += BATCH_SIZE) {
    const batch = crfns.slice(i, i + BATCH_SIZE);
    const crfnList = batch.map((c) => `'${c}'`).join(",");
    const url = socrataUrl(
      ACRIS_MASTER_ID,
      `crfn in(${crfnList})`,
      `&$select=document_id,crfn&$limit=5000`
    );

    const rows = await fetchJsonSafe(url);
    for (const row of rows) {
      if (row.document_id && row.crfn) {
        crfnToDocId.set(row.crfn, row.document_id);
      }
    }

    if (i + BATCH_SIZE < crfns.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(
    `[acris-sync] Resolved ${crfnToDocId.size}/${crfns.length} CRFNs via Socrata`
  );

  for (const record of needsEnrichment) {
    const realDocId = crfnToDocId.get(record.crfn);
    if (!realDocId || realDocId === record.document_id) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from("acris_documents")
      .select("id")
      .eq("document_id", realDocId)
      .eq("bbl", record.bbl)
      .maybeSingle();

    if (existing) {
      skipped++;
      console.log(
        `[acris-sync] CRFN ${record.crfn}: real doc ${realDocId} already exists for BBL ${record.bbl}, skipping`
      );
      continue;
    }

    const { error: updateErr } = await supabase
      .from("acris_documents")
      .update({ document_id: realDocId })
      .eq("id", record.id);

    if (updateErr) {
      errors.push(`CRFN ${record.crfn}: ${updateErr.message}`);
    } else {
      enriched++;
    }
  }

  console.log(
    `[acris-sync] CRFN enrichment complete: ${enriched} enriched, ${skipped} skipped`
  );
  return { enriched, skipped, errors };
}

// ── Main Handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }

    const mode: string = body.mode || "auto";
    const requestedLookback = body.lookbackDays || DEFAULT_LOOKBACK_DAYS;
    const lookbackDays = Math.min(
      Math.max(requestedLookback, 1),
      MAX_LOOKBACK_DAYS
    );
    const boroughs =
      body.boroughs && Array.isArray(body.boroughs)
        ? body.boroughs.filter((b: string) =>
            ALL_BOROUGHS.includes(String(b))
          )
        : ALL_BOROUGHS;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const startMs = Date.now();

    let isBootstrap = body.bootstrap === true;
    if (!isBootstrap) {
      const { count } = await supabase
        .from("acris_documents")
        .select("id", { count: "exact", head: true });
      if (count === 0) isBootstrap = true;
    }

    const { data: logEntry } = await supabase
      .from("acris_sync_log")
      .insert({
        status: "running",
        source: mode,
        run_metadata_json: {
          lookbackDays,
          boroughs,
          trigger: body.source || "manual",
          bootstrap: isBootstrap,
          mode,
        },
      })
      .select("id")
      .single();

    const logId = logEntry?.id;

    let socrataResult: PhaseResult | null = null;
    let scrapeResult: PhaseResult | null = null;

    if (mode === "socrata" || mode === "auto") {
      socrataResult = await runSocrataPhase(
        supabase,
        isBootstrap ? 30 : lookbackDays,
        boroughs
      );
    }

    if (mode === "acris_live" || mode === "auto") {
      const socrataEndDate =
        socrataResult?.dateRange?.to || formatDate(new Date());
      scrapeResult = await runAcrisScrapePhase(
        supabase,
        socrataEndDate,
        boroughs
      );
    }

    let enrichmentResult: { enriched: number; skipped: number; errors: string[] } | null = null;
    try {
      enrichmentResult = await runCrfnEnrichment(supabase);
    } catch (err) {
      console.warn(`[acris-sync] CRFN enrichment failed: ${err}`);
    }

    const totalIngested =
      (socrataResult?.ingested || 0) + (scrapeResult?.ingested || 0);
    const totalSkipped =
      (socrataResult?.skipped || 0) + (scrapeResult?.skipped || 0);
    const allErrors = [
      ...(socrataResult?.errors || []),
      ...(scrapeResult?.errors || []),
      ...(enrichmentResult?.errors || []),
    ];
    const durationMs = Date.now() - startMs;

    const status =
      allErrors.length > 0
        ? totalIngested > 0
          ? "partial"
          : "failed"
        : "success";

    if (logId) {
      await supabase
        .from("acris_sync_log")
        .update({
          completed_at: new Date().toISOString(),
          status,
          docs_ingested: totalIngested,
          docs_skipped: totalSkipped,
          error_message:
            allErrors.length > 0 ? allErrors.join("; ") : null,
          run_metadata_json: {
            lookbackDays,
            boroughs,
            trigger: body.source || "manual",
            bootstrap: isBootstrap,
            mode,
            durationMs,
            socrata: socrataResult
              ? {
                  ingested: socrataResult.ingested,
                  dateRange: socrataResult.dateRange,
                }
              : null,
            scrape: scrapeResult
              ? {
                  ingested: scrapeResult.ingested,
                  dateRange: scrapeResult.dateRange,
                  blocked: scrapeResult.blocked,
                  pagesScraped: scrapeResult.pagesScraped,
                }
              : null,
            enrichment: enrichmentResult
              ? {
                  enriched: enrichmentResult.enriched,
                  skipped: enrichmentResult.skipped,
                }
              : null,
          },
        })
        .eq("id", logId);
    }

    return jsonResponse({
      status,
      mode,
      ingested: totalIngested,
      skipped: totalSkipped,
      errors: allErrors,
      durationMs,
      socrata: socrataResult
        ? {
            ingested: socrataResult.ingested,
            skipped: socrataResult.skipped,
            dateRange: socrataResult.dateRange,
          }
        : null,
      enrichment: enrichmentResult
        ? {
            enriched: enrichmentResult.enriched,
            skipped: enrichmentResult.skipped,
          }
        : null,
      scrape: scrapeResult
        ? {
            ingested: scrapeResult.ingested,
            skipped: scrapeResult.skipped,
            dateRange: scrapeResult.dateRange,
            blocked: scrapeResult.blocked || false,
            pagesScraped: scrapeResult.pagesScraped || 0,
          }
        : null,
    });
  } catch (e) {
    console.error(`[acris-sync] Fatal error: ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});
