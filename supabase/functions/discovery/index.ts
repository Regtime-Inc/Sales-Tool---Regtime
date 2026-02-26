import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";
const DOF_ROLLING_ID = "usep-8jbt";
const ACRIS_MASTER_ID = "bnx9-e6tj";
const ACRIS_LEGALS_ID = "8h5j-fqxa";

const PROPERTY_CACHE_TTL_HOURS = 24;
const SALES_CACHE_TTL_HOURS = 72;
const ACRIS_LOOKBACK_DAYS = 120;
const PLUTO_PAGE_SIZE = 5000;
const PLUTO_MAX_PAGES = 3;
const UPSERT_CHUNK_SIZE = 500;

const VALID_BOROUGHS = new Set(["1", "2", "3", "4", "5"]);

const CONDO_CLASSES = new Set([
  "R1", "R2", "R3", "R4", "R5", "R6", "R9", "RR",
]);

const VALID_SORT_COLUMNS = new Set([
  "score", "slack_sf", "underbuilt_ratio", "lot_area",
  "resid_far", "last_sale_date", "last_sale_price", "data_completeness", "ppbsf",
]);

const RES_ZONE_PREFIXES = ["R", "C1", "C2", "C3", "C4", "C5", "C6", "MX"];

const NET_TO_GROSS = 0.80;
const DEFAULT_DU_FACTOR = 700;
const MIN_485X_UNITS = 6;

const COMMERCIAL_TO_RES_EQUIV: Record<string, string> = {
  "C1-6": "R7", "C1-6A": "R7A", "C1-7": "R8", "C1-7A": "R8A",
  "C1-8": "R9", "C1-8A": "R9A", "C1-8X": "R9X", "C1-9": "R10", "C1-9A": "R10A",
  "C2-6": "R7", "C2-6A": "R7A", "C2-7": "R9", "C2-7A": "R9A",
  "C2-7X": "R9X", "C2-8": "R10", "C2-8A": "R10A",
  "C3": "R3-2", "C3A": "R3A",
  "C4-1": "R5", "C4-2": "R6", "C4-2A": "R6A", "C4-3": "R6", "C4-3A": "R6A",
  "C4-4": "R7", "C4-4A": "R7A", "C4-4D": "R8A", "C4-4L": "R7A",
  "C4-5": "R7", "C4-5A": "R7A", "C4-5D": "R7D", "C4-5X": "R7X",
  "C4-6": "R10", "C4-6A": "R10A", "C4-7": "R10", "C4-7A": "R10A",
  "C5-1": "R10", "C5-1A": "R10A", "C5-2": "R10", "C5-2A": "R10A",
  "C5-3": "R10", "C5-4": "R10", "C5-5": "R10",
  "C6-1": "R7", "C6-1A": "R6", "C6-2": "R8", "C6-2A": "R8A",
  "C6-3": "R9", "C6-3A": "R9A", "C6-3D": "R9D", "C6-3X": "R9X",
  "C6-4": "R10", "C6-4A": "R10A", "C6-4X": "R10X",
  "C6-5": "R10", "C6-6": "R10", "C6-7": "R10", "C6-8": "R10", "C6-9": "R10",
};

const RES_UAP_EQUIV = ["R6", "R7", "R8", "R9", "R10", "R11", "R12"];

function getResEquiv(district: string): string | null {
  const norm = (district || "").toUpperCase().replace(/\s+/g, "").trim();
  if (norm.startsWith("R")) return norm;
  const exact = COMMERCIAL_TO_RES_EQUIV[norm];
  if (exact) return exact;
  return null;
}

function isUapEligibleDistrict(district: string): boolean {
  const res = getResEquiv(district) ?? (district || "").toUpperCase().replace(/\s+/g, "").trim();
  return RES_UAP_EQUIV.some((prefix) => res === prefix || res.startsWith(prefix));
}

function roundUnitsThreeQuarters(x: number): number {
  const base = Math.floor(x);
  const frac = x - base;
  return base + (frac >= 0.75 ? 1 : 0);
}

const ZONING_FAR: Record<string, { standardFar: number; qualFar: number; duFactor: number }> = {
  R6:     { standardFar: 2.20,  qualFar: 3.90,  duFactor: 680 },
  R6A:    { standardFar: 3.00,  qualFar: 3.90,  duFactor: 680 },
  'R6-1': { standardFar: 3.00,  qualFar: 3.90,  duFactor: 680 },
  R6B:    { standardFar: 2.00,  qualFar: 2.40,  duFactor: 680 },
  R6D:    { standardFar: 2.50,  qualFar: 3.00,  duFactor: 680 },
  'R6-2': { standardFar: 2.50,  qualFar: 3.00,  duFactor: 680 },
  R7A:    { standardFar: 4.00,  qualFar: 5.01,  duFactor: 680 },
  'R7-1': { standardFar: 3.44,  qualFar: 5.01,  duFactor: 680 },
  'R7-2': { standardFar: 3.44,  qualFar: 5.01,  duFactor: 680 },
  R7D:    { standardFar: 4.66,  qualFar: 5.60,  duFactor: 680 },
  R7X:    { standardFar: 5.00,  qualFar: 6.00,  duFactor: 680 },
  'R7-3': { standardFar: 5.00,  qualFar: 6.00,  duFactor: 680 },
  R8:     { standardFar: 6.02,  qualFar: 7.20,  duFactor: 680 },
  R8A:    { standardFar: 6.02,  qualFar: 7.20,  duFactor: 680 },
  R8X:    { standardFar: 6.02,  qualFar: 7.20,  duFactor: 680 },
  R8B:    { standardFar: 4.00,  qualFar: 4.80,  duFactor: 680 },
  R9:     { standardFar: 7.52,  qualFar: 9.02,  duFactor: 680 },
  R9A:    { standardFar: 7.52,  qualFar: 9.02,  duFactor: 680 },
  R9D:    { standardFar: 9.00,  qualFar: 10.80, duFactor: 680 },
  R9X:    { standardFar: 9.00,  qualFar: 10.80, duFactor: 680 },
  'R9-1': { standardFar: 9.00,  qualFar: 10.80, duFactor: 680 },
  R10:    { standardFar: 10.00, qualFar: 12.00, duFactor: 680 },
  R10A:   { standardFar: 10.00, qualFar: 12.00, duFactor: 680 },
  R10X:   { standardFar: 10.00, qualFar: 12.00, duFactor: 680 },
  R11:    { standardFar: 12.00, qualFar: 15.00, duFactor: 680 },
  R12:    { standardFar: 15.00, qualFar: 18.00, duFactor: 680 },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 && attempt < retries) {
        console.warn(`[fetchJsonSafe] 429 rate-limited (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const body = await res.text().catch(() => "");
      console.error(`[fetchJsonSafe] HTTP ${res.status} – ${body.slice(0, 300)}`);
    } catch (err) {
      console.error(`[fetchJsonSafe] Network error (attempt ${attempt + 1}): ${err}`);
      if (attempt < retries) continue;
    }
  }
  return [];
}

function sanitizeBbl(raw: string): string {
  const stripped = String(raw).replace(/\..*$/, "").replace(/\D/g, "");
  return stripped.padStart(10, "0").slice(-10);
}

function buildBblFromParts(borough: number, block: string, lot: string): string {
  const blk = parseInt(block).toString().padStart(5, "0");
  const lt = parseInt(lot).toString().padStart(4, "0");
  return `${borough}${blk}${lt}`;
}

function computeScore(row: {
  bldg_area: number;
  max_buildable_sf: number;
  lot_area: number;
  resid_far: number;
  zone_dist: string;
  land_use: string;
  last_sale_date: string | null;
  last_sale_price: number | null;
  program_flags: ProgramFlag[];
}): number {
  let devScore = 0;
  let rentalOverlay = 0;

  const ubr = row.bldg_area > 0
    ? row.max_buildable_sf / row.bldg_area
    : (row.max_buildable_sf > 0 ? 999 : 0);
  if (ubr >= 999) devScore += 30;
  else if (ubr >= 3) devScore += 30;
  else if (ubr >= 2) devScore += 25;
  else if (ubr >= 1.5) devScore += 20;
  else if (ubr >= 1.2) devScore += 15;
  else if (ubr >= 1) devScore += 10;

  if (row.last_sale_date && row.last_sale_price && row.last_sale_price > 0) {
    let salePts = 5;
    const years = (Date.now() - new Date(row.last_sale_date).getTime()) / (365.25 * 24 * 3600000);
    if (years <= 2) salePts += 10;
    else if (years <= 5) salePts += 5;
    const ppsf = row.bldg_area > 0 ? row.last_sale_price / row.bldg_area : 0;
    if (ppsf > 0 && ppsf < 100) salePts += 10;
    else if (ppsf > 0 && ppsf < 250) salePts += 5;
    devScore += Math.min(salePts, 25);
  }

  let propPts = 0;
  if (row.land_use === "11") propPts += 20;
  else if (row.land_use === "10") propPts += 15;
  const builtFarCalc = row.lot_area > 0 ? row.bldg_area / row.lot_area : 0;
  const maxFar = row.lot_area > 0 ? row.max_buildable_sf / row.lot_area : 0;
  if (builtFarCalc < 1 && maxFar > 2) propPts += 5;
  for (const flag of row.program_flags) {
    if (!flag.eligible) continue;
    if (flag.program === "MIH") propPts += 5;
    else if (flag.program === "UAP") propPts += 5;
    else if (flag.program === "485-x") propPts += 5;
    else if (flag.program === "467-m") propPts += 5;
  }
  if (row.resid_far >= 3.0) propPts += 5;
  devScore += Math.min(propPts, 45);

  devScore = Math.min(devScore, 100);

  const zu = (row.zone_dist || "").toUpperCase();
  if (zu.startsWith("R") || zu.startsWith("C") || zu.startsWith("M1")) {
    rentalOverlay += 10;
  }
  for (const flag of row.program_flags) {
    if (!flag.eligible) continue;
    if (flag.program === "485-x") rentalOverlay += 10;
    else if (flag.program === "UAP") rentalOverlay += 5;
  }
  rentalOverlay = Math.min(rentalOverlay, 30);

  return devScore + rentalOverlay;
}

function normalizeZoneKey(zoneDist: string): string {
  const zu = (zoneDist || "").toUpperCase().trim();
  if (zu.startsWith("R")) return zu.split(/[^A-Z0-9-]/)[0];
  if (zu.includes("/")) {
    const after = zu.split("/")[1] || "";
    if (/^R\d/.test(after)) return after.split(/[^A-Z0-9-]/)[0];
  }
  const res = getResEquiv(zu);
  if (res) return res;
  return zu;
}

function zoneAllowsRes(zoneDist: string): boolean {
  const zu = (zoneDist || "").toUpperCase();
  if (RES_ZONE_PREFIXES.some((p) => zu.startsWith(p))) return true;
  if (zu.includes("/R")) return true;
  return false;
}

interface ProgramFlag {
  program: string;
  eligible: boolean;
  note?: string;
}

function lookupZoneParams(zoneDist: string) {
  const zKey = normalizeZoneKey(zoneDist);
  return ZONING_FAR[zKey] || (zKey.match(/^R\d+/) ? ZONING_FAR[zKey.match(/^(R\d+)/)?.[1] || ""] : null);
}

function computeProgramFlags(zoneDist: string, residFar: number, lotArea: number, slackSf: number, projectedUnits: number): ProgramFlag[] {
  const flags: ProgramFlag[] = [];
  const zParams = lookupZoneParams(zoneDist);
  const allowsRes = zoneAllowsRes(zoneDist);
  const hasBonusFar = zParams ? zParams.qualFar > zParams.standardFar : false;

  flags.push({
    program: "MIH",
    eligible: allowsRes && hasBonusFar,
    ...(allowsRes && hasBonusFar ? { note: "Verify MIH overlay" } : {}),
  });

  flags.push({
    program: "UAP",
    eligible: allowsRes && hasBonusFar && isUapEligibleDistrict(zoneDist) && lotArea >= 5000,
  });

  const eligible485x = allowsRes && slackSf > 0 && projectedUnits >= MIN_485X_UNITS;
  flags.push({
    program: "485-x",
    eligible: eligible485x,
    ...(eligible485x && projectedUnits >= 150
      ? { note: "Option A (Very Large)" }
      : eligible485x && projectedUnits >= 100
        ? { note: "Option A (Large)" }
        : eligible485x
          ? { note: "Option B" }
          : {}),
  });

  flags.push({
    program: "421-a",
    eligible: false,
    note: "Expired - grandfathered only",
  });

  flags.push({
    program: "467-m",
    eligible: allowsRes && residFar >= 6.0,
  });

  return flags;
}

function computePotentialUnits(slackSf: number, zoneDist: string): number {
  if (slackSf <= 0) return 0;
  const zParams = lookupZoneParams(zoneDist);
  const duFactor = zParams?.duFactor ?? DEFAULT_DU_FACTOR;
  return roundUnitsThreeQuarters((slackSf * NET_TO_GROSS) / duFactor);
}

function computeDataCompleteness(row: {
  address: string;
  owner_name: string;
  bldg_class: string;
  year_built: number;
  last_sale_date: string | null;
  last_sale_price: number | null;
  units_res: number;
  land_use: string;
}): number {
  let score = 0;
  const max = 100;
  if (row.address) score += 10;
  if (row.owner_name) score += 20;
  if (row.bldg_class) score += 10;
  if (row.year_built > 0) score += 10;
  if (row.last_sale_date) score += 15;
  if (row.last_sale_price && row.last_sale_price > 0) score += 15;
  if (row.units_res > 0) score += 10;
  if (row.land_use) score += 10;
  return Math.min(score, max);
}

async function fetchDofRollingSales(borough: string): Promise<
  Array<{ bbl: string; saleDate: string; salePrice: number; source: string }>
> {
  const boroNum = parseInt(borough);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 10);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const url = socrataUrl(
    DOF_ROLLING_ID,
    `borough='${boroNum}' AND sale_price > '0' AND sale_date >= '${cutoffStr}'`,
    `&$select=borough,block,lot,sale_date,sale_price&$order=sale_date DESC&$limit=50000`
  );
  const rows = await fetchJsonSafe(url);

  const sales: Array<{ bbl: string; saleDate: string; salePrice: number; source: string }> = [];
  for (const r of rows) {
    if (!r.block || !r.lot || !r.sale_date) continue;
    const bbl = buildBblFromParts(boroNum, r.block, r.lot);
    const d = (r.sale_date || "").split("T")[0];
    if (!d) continue;
    const price = parseFloat(r.sale_price);
    if (!price || price <= 0) continue;
    sales.push({ bbl, saleDate: d, salePrice: price, source: "dof_rolling" });
  }
  return sales;
}

async function fetchAcrisRecentDeeds(borough: string): Promise<
  Array<{ bbl: string; saleDate: string; salePrice: number; source: string; documentId: string }>
> {
  const boroNum = parseInt(borough);
  const cutoff = new Date();
  cutoff.setTime(cutoff.getTime() - ACRIS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const masterUrl = socrataUrl(
    ACRIS_MASTER_ID,
    `doc_type in('DEED','DEEDO','ADED') AND document_date >= '${cutoffStr}' AND document_amt > '0'`,
    `&$select=document_id,document_date,document_amt&$order=document_date DESC&$limit=10000`
  );
  const masterRows = await fetchJsonSafe(masterUrl);
  if (masterRows.length === 0) return [];

  const docMap = new Map<string, { date: string; amount: number }>();
  for (const r of masterRows) {
    if (!r.document_id || !r.document_date) continue;
    const amt = parseFloat(r.document_amt);
    if (!amt || amt <= 0) continue;
    docMap.set(r.document_id, {
      date: (r.document_date || "").split("T")[0],
      amount: amt,
    });
  }

  const docIds = Array.from(docMap.keys());
  const results: Array<{ bbl: string; saleDate: string; salePrice: number; source: string; documentId: string }> = [];

  for (let i = 0; i < docIds.length; i += 200) {
    const batch = docIds.slice(i, i + 200);
    const idList = batch.map((id) => `'${id}'`).join(",");
    const legalsUrl = socrataUrl(
      ACRIS_LEGALS_ID,
      `document_id in(${idList}) AND borough='${boroNum}'`,
      `&$select=document_id,borough,block,lot&$limit=5000`
    );
    const legalsRows = await fetchJsonSafe(legalsUrl);

    for (const l of legalsRows) {
      if (!l.block || !l.lot || !l.document_id) continue;
      const doc = docMap.get(l.document_id);
      if (!doc) continue;
      const bbl = buildBblFromParts(boroNum, l.block, l.lot);
      results.push({
        bbl,
        saleDate: doc.date,
        salePrice: doc.amount,
        source: "acris",
        documentId: l.document_id,
      });
    }
  }

  console.log(`[discovery] ACRIS returned ${results.length} deeds for borough ${borough} since ${cutoffStr}`);
  return results;
}

async function fetchPlutoPaginated(borough: string): Promise<any[]> {
  const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
  const allRows: any[] = [];

  for (let page = 0; page < PLUTO_MAX_PAGES; page++) {
    const offset = page * PLUTO_PAGE_SIZE;
    let url =
      `${NYC_DATA_BASE}/${PLUTO_ID}.json` +
      `?$where=borocode='${borough}' AND residfar > 0 AND lotarea > 2000` +
      `&$limit=${PLUTO_PAGE_SIZE}&$offset=${offset}&$order=lotarea DESC` +
      `&$select=bbl,address,borocode,zonedist1,lotarea,bldgarea,residfar,builtfar,landuse,bldgclass,yearbuilt,unitsres,ownername`;
    if (appToken) url += `&$$app_token=${appToken}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) break;

    const rows: any[] = await res.json();
    allRows.push(...rows);

    if (rows.length < PLUTO_PAGE_SIZE) break;

    if (page > 0) {
      console.log(`[discovery] PLUTO page ${page + 1}: fetched ${rows.length} rows (total ${allRows.length})`);
    }
  }

  if (allRows.length >= PLUTO_MAX_PAGES * PLUTO_PAGE_SIZE) {
    console.warn(`[discovery] PLUTO results may be truncated at ${allRows.length} rows for borough ${borough}`);
  }

  return allRows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const borough = url.searchParams.get("borough") || "1";

    if (!VALID_BOROUGHS.has(borough)) {
      return jsonResponse({ error: `Invalid borough '${borough}'. Must be 1-5.` }, 400);
    }

    const minUnderbuilt = Math.max(0, parseFloat(url.searchParams.get("minUnderbuiltRatio") || "0") || 0);
    const minSlack = Math.max(0, parseFloat(url.searchParams.get("minSlackSF") || "0") || 0);
    const excludeCondos = url.searchParams.get("excludeCondos") !== "false";
    const zonePrefixRaw = url.searchParams.get("zonePrefix") || "";
    const zonePrefixes = zonePrefixRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z][A-Z0-9-]*$/.test(s));
    const maxSaleRecencyYears = parseFloat(url.searchParams.get("maxSaleRecencyYears") || "0") || 0;
    const minProjectedUnits = Math.max(0, parseInt(url.searchParams.get("minProjectedUnits") || "0") || 0);
    const maxProjectedUnits = Math.max(0, parseInt(url.searchParams.get("maxProjectedUnits") || "0") || 0);
    const minSalePrice = Math.max(0, parseFloat(url.searchParams.get("minSalePrice") || "0") || 0);
    const maxSalePrice = Math.max(0, parseFloat(url.searchParams.get("maxSalePrice") || "0") || 0);
    const minPPBSF = Math.max(0, parseFloat(url.searchParams.get("minPPBSF") || "0") || 0);
    const maxPPBSF = Math.max(0, parseFloat(url.searchParams.get("maxPPBSF") || "0") || 0);
    const bldgClassRaw = url.searchParams.get("bldgClass") || "";
    const bldgClassPrefixes = bldgClassRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z][A-Z0-9]?$/.test(s));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25")));

    const sortByRaw = url.searchParams.get("sortBy") || "score";
    const sortDirRaw = url.searchParams.get("sortDir") || "desc";
    const sortBy2Raw = url.searchParams.get("sortBy2") || "";
    const sortDir2Raw = url.searchParams.get("sortDir2") || "desc";

    const sortBy = VALID_SORT_COLUMNS.has(sortByRaw) ? sortByRaw : "score";
    const sortDir = sortDirRaw === "asc";
    const sortBy2 = VALID_SORT_COLUMNS.has(sortBy2Raw) ? sortBy2Raw : "";
    const sortDir2 = sortDir2Raw === "asc";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const propertyCacheCheck = await supabase
      .from("discovery_cache")
      .select("cached_at")
      .eq("borough", borough)
      .order("cached_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let propertyCacheValid = false;
    if (propertyCacheCheck.data?.cached_at) {
      const age = Date.now() - new Date(propertyCacheCheck.data.cached_at).getTime();
      propertyCacheValid = age < PROPERTY_CACHE_TTL_HOURS * 3600 * 1000;
    }

    let salesCacheValid = false;
    let salesCacheTimestamp: string | null = null;
    {
      const { data: anySale } = await supabase
        .from("discovery_sales")
        .select("cached_at")
        .like("bbl", `${borough}%`)
        .order("cached_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (anySale?.cached_at) {
        salesCacheTimestamp = anySale.cached_at;
        const age = Date.now() - new Date(anySale.cached_at).getTime();
        salesCacheValid = age < SALES_CACHE_TTL_HOURS * 3600 * 1000;
      }
    }

    const { data: latestAcrisDoc } = await supabase
      .from("acris_documents")
      .select("ingested_at")
      .eq("borough", borough)
      .in("doc_type", ["DEED", "DEEDO", "ADED", "EXED", "RDED", "TORD"])
      .gt("amount", 0)
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasNewerAcrisDocs = latestAcrisDoc?.ingested_at &&
      (!salesCacheTimestamp || new Date(latestAcrisDoc.ingested_at) > new Date(salesCacheTimestamp));

    let salesRefreshed = false;

    if (hasNewerAcrisDocs) {
      const { data: acrisRealtimeData } = await supabase.rpc(
        "get_latest_acris_sales_for_borough",
        { borough_code: borough }
      );

      if (acrisRealtimeData && acrisRealtimeData.length > 0) {
        console.log(`[discovery] Refreshing ${acrisRealtimeData.length} acris_documents records for borough ${borough}`);
        const now = new Date().toISOString();
        const realtimeRows = acrisRealtimeData.map((s: any) => ({
          bbl: s.bbl,
          sale_date: s.sale_date,
          sale_price: s.sale_price,
          doc_type: "DEED",
          source: "acris_realtime",
          document_id: s.document_id,
          cached_at: now,
        }));
        for (let i = 0; i < realtimeRows.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = realtimeRows.slice(i, i + UPSERT_CHUNK_SIZE);
          await supabase.from("discovery_sales").upsert(chunk, {
            onConflict: "bbl,sale_date,source",
            ignoreDuplicates: false,
          });
        }
        salesRefreshed = true;
      }
    }

    if (!salesCacheValid) {
      if (!salesRefreshed) {
        const { data: acrisRealtimeData } = await supabase.rpc(
          "get_latest_acris_sales_for_borough",
          { borough_code: borough }
        );

        if (acrisRealtimeData && acrisRealtimeData.length > 0) {
          console.log(`[discovery] Using ${acrisRealtimeData.length} acris_documents records for borough ${borough}`);
          const now = new Date().toISOString();
          const realtimeRows = acrisRealtimeData.map((s: any) => ({
            bbl: s.bbl,
            sale_date: s.sale_date,
            sale_price: s.sale_price,
            doc_type: "DEED",
            source: "acris_realtime",
            document_id: s.document_id,
            cached_at: now,
          }));
          for (let i = 0; i < realtimeRows.length; i += UPSERT_CHUNK_SIZE) {
            const chunk = realtimeRows.slice(i, i + UPSERT_CHUNK_SIZE);
            await supabase.from("discovery_sales").upsert(chunk, {
              onConflict: "bbl,sale_date,source",
              ignoreDuplicates: false,
            });
          }
          salesRefreshed = true;
        }
      }

      const [dofSales, acrisSales] = await Promise.all([
        fetchDofRollingSales(borough),
        fetchAcrisRecentDeeds(borough),
      ]);

      const now = new Date().toISOString();
      const dofRows = dofSales.map((s) => ({
        bbl: s.bbl,
        sale_date: s.saleDate,
        sale_price: s.salePrice,
        doc_type: "",
        source: s.source,
        document_id: null,
        cached_at: now,
      }));
      const acrisRows = acrisSales.map((s) => ({
        bbl: s.bbl,
        sale_date: s.saleDate,
        sale_price: s.salePrice,
        doc_type: "DEED",
        source: s.source,
        document_id: s.documentId,
        cached_at: now,
      }));
      const salesRows = [...dofRows, ...acrisRows];

      if (salesRows.length > 0) {
        for (let i = 0; i < salesRows.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = salesRows.slice(i, i + UPSERT_CHUNK_SIZE);
          await supabase.from("discovery_sales").upsert(chunk, {
            onConflict: "bbl,sale_date,source",
            ignoreDuplicates: true,
          });
        }
      }
      salesRefreshed = true;
    }

    if (salesRefreshed && propertyCacheValid) {
      const { data: latestSalesData } = await supabase.rpc(
        "get_latest_sales_for_borough",
        { borough_code: borough }
      );

      if (latestSalesData && latestSalesData.length > 0) {
        const updates = latestSalesData.map((s: any) => ({
          bbl: s.bbl,
          last_sale_date: s.sale_date,
          last_sale_price: s.sale_price,
          last_sale_source: s.source,
        }));

        for (let i = 0; i < updates.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = updates.slice(i, i + UPSERT_CHUNK_SIZE);
          await supabase.from("discovery_cache").upsert(chunk, {
            onConflict: "bbl",
            ignoreDuplicates: false,
          });
        }
        console.log(`[discovery] Backfilled sale data for ${updates.length} BBLs`);
      }
    }

    if (!propertyCacheValid) {
      const plutoRows = await fetchPlutoPaginated(borough);

      const validRows = plutoRows.filter(
        (r: any) => r.bbl && parseFloat(r.residfar || "0") > 0
      );

      let saleMap = new Map<string, { date: string; price: number; source: string }>();
      const bblsInBatch = validRows.map((r: any) => sanitizeBbl(r.bbl));

      if (bblsInBatch.length > 0) {
        const { data: salesData } = await supabase.rpc(
          "get_latest_sales_for_bbls",
          { bbl_list: bblsInBatch }
        );

        if (salesData && salesData.length > 0) {
          for (const s of salesData) {
            saleMap.set(s.bbl, {
              date: s.sale_date,
              price: s.sale_price,
              source: s.source,
            });
          }
        } else {
          const { data: fallbackSales } = await supabase
            .from("discovery_sales")
            .select("bbl, sale_date, sale_price, source")
            .in("bbl", bblsInBatch.slice(0, 1000))
            .order("sale_date", { ascending: false });

          if (fallbackSales) {
            for (const s of fallbackSales) {
              if (!saleMap.has(s.bbl)) {
                saleMap.set(s.bbl, {
                  date: s.sale_date,
                  price: s.sale_price,
                  source: s.source,
                });
              }
            }
          }
        }
      }

      const mapped = validRows.map((r: any) => {
        const lotArea = parseFloat(r.lotarea || "0");
        const bldgArea = parseFloat(r.bldgarea || "0");
        const residFar = parseFloat(r.residfar || "0");
        const builtFar = parseFloat(r.builtfar || "0");
        const maxBuildable = residFar * lotArea;
        const slack = Math.max(maxBuildable - bldgArea, 0);
        const builtRatio = residFar > 0 ? builtFar / residFar : 1;
        const underbuiltPct = Math.round(Math.max(1 - builtRatio, 0) * 1000) / 10;
        const cleanBbl = sanitizeBbl(r.bbl);
        const sale = saleMap.get(cleanBbl);
        const zoneDist = r.zonedist1 || "";

        const rec = {
          bbl: cleanBbl,
          address: r.address || "",
          borough,
          zone_dist: zoneDist,
          lot_area: lotArea,
          bldg_area: bldgArea,
          resid_far: residFar,
          built_far: builtFar,
          max_buildable_sf: Math.round(maxBuildable),
          slack_sf: Math.round(slack),
          underbuilt_ratio: underbuiltPct,
          land_use: r.landuse || "",
          bldg_class: r.bldgclass || "",
          year_built: parseInt(r.yearbuilt || "0") || 0,
          units_res: parseInt(r.unitsres || "0") || 0,
          owner_name: r.ownername || "",
          score: 0,
          cached_at: new Date().toISOString(),
          last_sale_date: sale?.date || null,
          last_sale_price: sale?.price || null,
          last_sale_source: sale?.source || null,
          potential_units: computePotentialUnits(Math.round(slack), zoneDist),
          program_flags: computeProgramFlags(zoneDist, residFar, lotArea, Math.round(slack), computePotentialUnits(Math.round(slack), zoneDist)),
          data_completeness: 0,
          ppbsf: (sale?.price && sale.price > 0 && Math.round(slack) > 0)
            ? Math.round((sale.price / Math.round(slack)) * 100) / 100
            : null,
        };
        rec.score = computeScore(rec);
        rec.data_completeness = computeDataCompleteness(rec);
        return rec;
      });

      if (mapped.length > 0) {
        for (let i = 0; i < mapped.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = mapped.slice(i, i + UPSERT_CHUNK_SIZE);
          await supabase.from("discovery_cache").upsert(chunk, {
            onConflict: "bbl",
          });
        }
        console.log(`[discovery] Cached ${mapped.length} properties for borough ${borough}`);
      }
    }

    let query = supabase
      .from("discovery_cache")
      .select("*", { count: "exact" })
      .eq("borough", borough);

    if (minUnderbuilt > 0) {
      query = query.gte("underbuilt_ratio", minUnderbuilt);
    }

    if (minSlack > 0) {
      query = query.gte("slack_sf", minSlack);
    }

    if (excludeCondos) {
      for (const cc of CONDO_CLASSES) {
        query = query.not("bldg_class", "eq", cc);
      }
    }

    if (zonePrefixes.length > 0) {
      const orClauses = zonePrefixes.map((z) => `zone_dist.ilike.${z}`).join(",");
      query = query.or(orClauses);
    }

    if (bldgClassPrefixes.length > 0) {
      const orClauses = bldgClassPrefixes.map((p) => `bldg_class.ilike.${p}%`).join(",");
      query = query.or(orClauses);
    }

    if (maxSaleRecencyYears > 0) {
      const cutoffMs = maxSaleRecencyYears * 365.25 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - cutoffMs).toISOString().split("T")[0];
      query = query.gte("last_sale_date", cutoffDate);
    }

    if (minProjectedUnits > 0) {
      query = query.gte("potential_units", minProjectedUnits);
    }
    if (maxProjectedUnits > 0) {
      query = query.lte("potential_units", maxProjectedUnits);
    }

    if (minSalePrice > 0) {
      query = query.gte("last_sale_price", minSalePrice);
    }
    if (maxSalePrice > 0) {
      query = query.lte("last_sale_price", maxSalePrice);
    }
    if (minPPBSF > 0) {
      query = query.gte("ppbsf", minPPBSF);
    }
    if (maxPPBSF > 0) {
      query = query.lte("ppbsf", maxPPBSF);
    }

    const offset = (page - 1) * pageSize;
    query = query.order(sortBy, { ascending: sortDir });
    if (sortBy2 && sortBy2 !== sortBy) {
      query = query.order(sortBy2, { ascending: sortDir2 });
    }
    if (sortBy !== "score") {
      query = query.order("score", { ascending: false });
    }
    query = query.range(offset, offset + pageSize - 1);

    const { data: candidates, count, error: qErr } = await query;

    if (qErr) {
      return jsonResponse({ error: qErr.message }, 500);
    }

    const mappedOut = (candidates || []).map((c: any) => ({
      bbl: c.bbl,
      address: c.address,
      borough: c.borough,
      zoneDist: c.zone_dist,
      lotArea: c.lot_area,
      bldgArea: c.bldg_area,
      residFar: c.resid_far,
      builtFar: c.built_far,
      maxBuildableSF: c.max_buildable_sf,
      slackSF: c.slack_sf,
      underbuiltRatio: c.underbuilt_ratio,
      landUse: c.land_use,
      bldgClass: c.bldg_class,
      yearBuilt: c.year_built,
      unitsRes: c.units_res,
      ownerName: c.owner_name,
      score: c.score,
      lastSaleDate: c.last_sale_date || null,
      lastSalePrice: c.last_sale_price || null,
      lastSaleSource: c.last_sale_source || null,
      potentialUnits: c.potential_units || 0,
      programFlags: c.program_flags || [],
      dataCompleteness: c.data_completeness || 0,
      ppbsf: c.ppbsf ?? null,
    }));

    const { data: latestRow } = await supabase
      .from("discovery_cache")
      .select("last_sale_date")
      .eq("borough", borough)
      .not("last_sale_date", "is", null)
      .order("last_sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse({
      candidates: mappedOut,
      total: count || 0,
      page,
      pageSize,
      cached: propertyCacheValid,
      cachedAt: propertyCacheCheck.data?.cached_at || null,
      latestSaleDate: latestRow?.last_sale_date || null,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
