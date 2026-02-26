import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COLUMN_KEYWORDS: Record<string, string[]> = {
  crfn: ["crfn", "city register filing number"],
  documentId: [
    "document id",
    "doc id",
    "document_id",
    "docid",
    "document #",
  ],
  reelPgFile: ["reel/pg/file", "reel", "reel/page/file", "reel pg file"],
  recordedDate: [
    "recorded",
    "filed",
    "date recorded",
    "date filed",
    "recording date",
    "file date",
    "recorded / filed",
  ],
  docDate: ["doc date", "document date", "execution date"],
  docType: ["doc type", "document type", "type", "doc_type", "instrument"],
  borough: ["borough", "boro", "county"],
  block: ["block", "blk"],
  lot: ["lot"],
  partial: ["partial"],
  pages: ["pages", "page count", "pg"],
  party1: [
    "party 1",
    "party1",
    "grantor",
    "seller",
    "party name/address 1",
    "party name 1",
  ],
  party2: [
    "party 2",
    "party2",
    "grantee",
    "buyer",
    "party name/address 2",
    "party name 2",
  ],
  party3: [
    "party 3",
    "party3",
    "party 3/ other",
    "party 3/other",
    "other party",
  ],
  amount: ["amount", "consideration", "price", "sale price", "doc amount"],
};

const BOROUGH_MAP: Record<string, string> = {
  "1": "1", manhattan: "1", mn: "1", "new york": "1",
  "2": "2", bronx: "2", bx: "2", "the bronx": "2",
  "3": "3", brooklyn: "3", bk: "3", kings: "3",
  "4": "4", queens: "4", qn: "4",
  "5": "5", "staten island": "5", si: "5", richmond: "5",
};

const DOC_TYPE_MAP: Record<string, string> = {
  deed: "DEED", "warranty deed": "DEED",
  mortgage: "MTGE", mtge: "MTGE",
  "satisfaction of mortgage": "SAT", satisfaction: "SAT", sat: "SAT",
  assignment: "ASST", asst: "ASST",
  ucc1: "UCC1", ucc3: "UCC3",
  "lis pendens": "LP", lp: "LP",
  agreement: "AGMT", agmt: "AGMT",
  aded: "ADED", deedo: "DEEDO",
};

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

interface ParsedTxn {
  crfn?: string;
  documentId?: string;
  reelPgFile?: string;
  recordedDate?: string;
  docDate?: string;
  docType?: string;
  borough?: string;
  block?: string;
  lot?: string;
  partial?: string;
  pages?: string;
  party1?: string;
  party2?: string;
  party3?: string;
  amount?: string;
  rawLine: string;
  dedupeKey: string;
}

function normalizeName(raw: string): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ")
    .replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function normalizeDocType(raw: string): string {
  if (!raw) return "";
  const key = raw.trim().toLowerCase();
  if (DOC_TYPE_MAP[key]) return DOC_TYPE_MAP[key];
  const upper = raw.trim().toUpperCase();
  if (Object.values(DOC_TYPE_MAP).includes(upper)) return upper;
  return upper;
}

function normalizeBorough(raw: string): string {
  if (!raw) return "";
  return BOROUGH_MAP[raw.trim().toLowerCase()] ?? "";
}

function toISODate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) { const d = new Date(+iso[1], +iso[2] - 1, +iso[3]); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  const us = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (us) { const d = new Date(+us[3], +us[1] - 1, +us[2]); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  const named = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (named) { const m = MONTH_MAP[named[1].toLowerCase()]; if (m !== undefined) { const d = new Date(+named[3], m, +named[2]); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); } }
  return null;
}

function detectDelimiter(lines: string[]): "tab" | "pipe" | "space" {
  let tabCount = 0, pipeCount = 0;
  const sample = lines.slice(0, Math.min(5, lines.length));
  for (const line of sample) {
    tabCount += (line.match(/\t/g) || []).length;
    pipeCount += (line.match(/\|/g) || []).length;
  }
  if (tabCount >= sample.length) return "tab";
  if (pipeCount >= sample.length) return "pipe";
  return "space";
}

function splitLine(line: string, delim: "tab" | "pipe" | "space"): string[] {
  if (delim === "tab") return line.split("\t").map((s) => s.trim());
  if (delim === "pipe") return line.split("|").map((s) => s.trim());
  return line.split(/\s{2,}/).map((s) => s.trim());
}

function matchColumn(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    for (const kw of keywords) {
      if (h === kw || h.includes(kw)) return field;
    }
  }
  return null;
}

function detectHeaderRow(rows: string[][]): { index: number; mapping: Record<number, string> } | null {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    const mapping: Record<number, string> = {};
    let matchCount = 0;
    for (let c = 0; c < row.length; c++) {
      const field = matchColumn(row[c]);
      if (field) { mapping[c] = field; matchCount++; }
    }
    if (matchCount >= 2) return { index: i, mapping };
  }
  return null;
}

function hashRow(row: Partial<ParsedTxn>): string {
  const parts = [row.recordedDate ?? "", row.docType ?? "", row.block ?? "", row.lot ?? "", row.party1 ?? "", row.party2 ?? ""].join("|");
  let hash = 0;
  for (let i = 0; i < parts.length; i++) hash = ((hash << 5) - hash + parts.charCodeAt(i)) | 0;
  return `hash_${Math.abs(hash).toString(36)}`;
}

function makeDedupeKey(txn: Partial<ParsedTxn>): string {
  if (txn.crfn) return `crfn_${txn.crfn}`;
  if (txn.documentId) return `docid_${txn.documentId}`;
  return hashRow(txn);
}

function parseClipboard(text: string): { transactions: ParsedTxn[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!text?.trim()) return { transactions: [], warnings: ["Empty input"] };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { transactions: [], warnings: ["No non-empty lines found"] };

  const delim = detectDelimiter(lines);
  const rows = lines.map((l) => splitLine(l, delim));
  const headerDetect = detectHeaderRow(rows);

  if (!headerDetect) {
    warnings.push("Could not detect a header row. Returning raw lines.");
    return { transactions: lines.map((l) => ({ rawLine: l, dedupeKey: hashRow({}) })), warnings };
  }

  const { index: headerIdx, mapping } = headerDetect;
  const dataRows = rows.slice(headerIdx + 1);
  const dataLines = lines.slice(headerIdx + 1);
  if (!dataRows.length) return { transactions: [], warnings: ["Header detected but no data rows found"] };

  const seen = new Set<string>();
  const transactions: ParsedTxn[] = [];
  let dupeCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.filter((c) => c.length > 0).length < 2) continue;
    const raw: Partial<ParsedTxn> = {};
    for (const [colIdx, field] of Object.entries(mapping)) {
      const val = cells[+colIdx] ?? "";
      if (!val) continue;
      switch (field) {
        case "crfn": raw.crfn = val; break;
        case "documentId": raw.documentId = val; break;
        case "reelPgFile": raw.reelPgFile = val; break;
        case "recordedDate": raw.recordedDate = toISODate(val) ?? val; break;
        case "docDate": raw.docDate = toISODate(val) ?? val; break;
        case "docType": raw.docType = normalizeDocType(val); break;
        case "borough": raw.borough = normalizeBorough(val) || val; break;
        case "block": raw.block = val.replace(/\D/g, ""); break;
        case "lot": raw.lot = val.replace(/\D/g, ""); break;
        case "partial": raw.partial = val; break;
        case "pages": raw.pages = val.replace(/\D/g, ""); break;
        case "party1": raw.party1 = normalizeName(val); break;
        case "party2": raw.party2 = normalizeName(val); break;
        case "party3": raw.party3 = normalizeName(val); break;
        case "amount": raw.amount = val.replace(/[$,\s]/g, ""); break;
      }
    }
    const txn: ParsedTxn = { ...raw, rawLine: dataLines[i], dedupeKey: makeDedupeKey(raw) } as ParsedTxn;
    if (seen.has(txn.dedupeKey)) { dupeCount++; continue; }
    seen.add(txn.dedupeKey);
    transactions.push(txn);
  }

  if (dupeCount > 0) warnings.push(`${dupeCount} duplicate row(s) removed`);
  const noIdCount = transactions.filter((t) => !t.crfn && !t.documentId).length;
  if (noIdCount > 0) warnings.push(`${noIdCount} row(s) have no CRFN or Document ID`);
  return { transactions, warnings };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const text = body?.text;
    if (typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'text' field in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = parseClipboard(text);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
