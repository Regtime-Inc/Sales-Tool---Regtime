import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getAccessToken, resolveProcessorId } from "../_shared/googleAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NORMALIZATION_SCHEMA = {
  name: "acris_ocr_normalization",
  strict: true,
  schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            borough: {
              type: ["string", "null"],
              description: "Borough as numeric code: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island",
            },
            block: { type: ["string", "null"], description: "Block number, digits only" },
            lot: { type: ["string", "null"], description: "Lot number, digits only" },
            crfn: { type: ["string", "null"] },
            reelPgFile: { type: ["string", "null"] },
            docType: {
              type: ["string", "null"],
              description: "ACRIS document type code from the page context, e.g. DEED, MTGE, SAT, ASST, UCC1, LP, AGMT, ADED, DEEDO, CDEC",
            },
            docDate: {
              type: ["string", "null"],
              description: "Document date in ISO format YYYY-MM-DD",
            },
            recordedDate: {
              type: ["string", "null"],
              description: "Recorded/Filed date in ISO format YYYY-MM-DD",
            },
            pages: { type: ["integer", "null"] },
            party1: { type: ["string", "null"] },
            party2: { type: ["string", "null"] },
            party3: { type: ["string", "null"] },
            corrected: { type: ["boolean", "null"] },
            amount: {
              type: ["string", "null"],
              description: "Doc amount as plain number string, no $ or commas. Use '0' if blank.",
            },
            partial: { type: ["string", "null"] },
          },
          required: [
            "borough", "block", "lot", "crfn",
            "reelPgFile", "docType", "docDate", "recordedDate",
            "pages", "party1", "party2", "party3", "corrected",
            "amount", "partial",
          ],
          additionalProperties: false,
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["transactions", "warnings"],
    additionalProperties: false,
  },
};

const NORMALIZATION_PROMPT = `You are a data normalization assistant. You have been given raw OCR text extracted by Google Document AI from a screenshot of an NYC ACRIS (Automated City Register Information System) search results page.

The ACRIS results table has these columns in order from left to right:
  View | Borough | Block | Reel/Pg/File | CRFN | Lot | Partial | Doc Date | Recorded / Filed | Pages | Party1 | Party2 | Party 3/ Other | More Party 1/2 Names | Corrected/ Remarks | Doc Amount

The "View" column contains clickable links like "DET" (detail) and "IMG" (image) — these are NOT data columns. Ignore them.

YOUR JOB: Parse the raw OCR text into clean, database-ready structured rows. The OCR is already highly accurate — your role is to:
1. Identify each row of data in the table (each property transaction).
2. Map cell values to the correct columns. The OCR may have merged or split cells.
3. Clean up minor OCR artifacts (extra spaces, line breaks within cells, etc.).
4. Normalize all values into their final database-ready format (see rules below).
5. Preserve exact values — do NOT guess, invent, or round numbers.

NORMALIZATION RULES:
- Borough: convert to numeric code: MANHATTAN=1, BRONX=2, BROOKLYN=3, QUEENS=4, STATEN ISLAND=5. Output only the single digit.
- Block and Lot: digits only (strip any non-numeric characters).
- CRFN: long numeric identifier like "2026000043827". Do NOT alter digits.
- Reel/Pg/File: may be blank for newer records.
- docType: determine from the page context (header/URL text). Use the ACRIS abbreviation: DEED, MTGE, SAT, ASST, UCC1, UCC3, LP, AGMT, ADED, DEEDO, CDEC, AL&R, CNTR, MCON, RPTT. Set on every row. Null only if truly unknown.
- Partial: typically "ENTIRE LOT".
- Doc Date: output in ISO format YYYY-MM-DD (e.g. 1/15/2024 becomes 2024-01-15).
- Recorded/Filed: extract only the date portion, output in ISO format YYYY-MM-DD. Strip any timestamps.
- Pages: integer.
- Party names: exactly as shown, join multi-line names with ", ".
- Corrected/Remarks: true if checkmark/Y present, false otherwise.
- Amount: plain number string without $ or commas. "0" if blank.
- If a value is unreadable or missing, set to null.
- Do NOT include header rows, summary rows, or pagination text.`;

const VISION_FALLBACK_PROMPT = `You are a precision data extraction assistant for NYC ACRIS (Automated City Register Information System) document search result screenshots.

The ACRIS results table has these columns in order from left to right:
  View | Borough | Block | Reel/Pg/File | CRFN | Lot | Partial | Doc Date | Recorded / Filed | Pages | Party1 | Party2 | Party 3/ Other | More Party 1/2 Names | Corrected/ Remarks | Doc Amount

The "View" column contains clickable links like "DET" (detail) and "IMG" (image) — these are NOT data columns.

EXTRACTION AND NORMALIZATION RULES:
1. Extract EVERY visible row. Do not skip any rows.
2. Read each cell value exactly as shown. Do NOT guess, invent, or hallucinate values.
3. Borough: convert to numeric code: MANHATTAN=1, BRONX=2, BROOKLYN=3, QUEENS=4, STATEN ISLAND=5. Output only the single digit.
4. Block and Lot: digits only (strip any non-numeric characters).
5. CRFN: long numeric identifier like "2026000043827". Do NOT alter digits.
6. Reel/Pg/File: may be blank for newer records.
7. docType: determine from page context (header/URL). Use ACRIS abbreviation: DEED, MTGE, SAT, ASST, UCC1, UCC3, LP, AGMT, ADED, DEEDO, CDEC. Set on every row. Null only if truly unknown.
8. Partial: typically "ENTIRE LOT".
9. Doc Date: output in ISO format YYYY-MM-DD (e.g. 1/15/2024 becomes 2024-01-15).
10. Recorded/Filed: extract only the date portion, output in ISO format YYYY-MM-DD.
11. Pages: integer.
12. Party names: exactly as displayed, join multi-line with ", ".
13. Corrected/Remarks: true if checkmark or "Y", false otherwise.
14. Amount: plain number string without $ or commas. "0" if blank.
15. If a cell is unreadable or cut off, set to null.
16. Do NOT include header/summary/pagination rows.
17. Read amounts very carefully.`;

function hashRow(row: Record<string, unknown>): string {
  const parts = [
    row.recordedDate ?? "",
    row.borough ?? "",
    row.block ?? "",
    row.lot ?? "",
    row.party1 ?? "",
    row.party2 ?? "",
    row.amount ?? "",
  ].join("|");
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) - hash + parts.charCodeAt(i)) | 0;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}

function makeDedupeKey(txn: Record<string, unknown>): string {
  if (txn.crfn) return `crfn_${txn.crfn}`;
  return hashRow(txn);
}

function computeBbl(borough: string | null, block: string | null, lot: string | null): string | null {
  if (!borough || !block || !lot) return null;
  return `${borough}${block.padStart(5, "0")}${lot.padStart(4, "0")}`;
}

function mapTransactions(
  parsed: { transactions?: Record<string, unknown>[]; warnings?: string[] },
) {
  const transactions = (parsed.transactions || []).map(
    (t: Record<string, unknown>) => {
      const borough = (t.borough as string) || null;
      const block = (t.block as string) || null;
      const lot = (t.lot as string) || null;
      const crfn = (t.crfn as string) || null;
      return {
        crfn,
        documentId: crfn,
        reelPgFile: t.reelPgFile || null,
        recordedDate: t.recordedDate || null,
        docDate: t.docDate || null,
        docType: t.docType || null,
        borough,
        block,
        lot,
        bbl: computeBbl(borough, block, lot),
        partial: t.partial || null,
        pages: t.pages != null ? String(t.pages) : null,
        party1: t.party1 || null,
        party2: t.party2 || null,
        party3: t.party3 || null,
        amount: t.amount ? String(t.amount).replace(/[$,\s]/g, "") : null,
        corrected: t.corrected === true,
        rawLine: JSON.stringify(t),
        dedupeKey: makeDedupeKey(t),
      };
    },
  );

  const seen = new Set<string>();
  const deduped = [];
  for (const txn of transactions) {
    if (seen.has(txn.dedupeKey)) continue;
    seen.add(txn.dedupeKey);
    deduped.push(txn);
  }

  return { deduped, rawWarnings: parsed.warnings || [] };
}

interface DocAiOcrResult {
  pages: Array<{ page: number; text: string; confidence: number; lines: string[] }>;
  tables: Array<{ page: number; headerRows: string[][]; bodyRows: string[][]; rows: string[][] }>;
}

function extractTextFromSegments(
  segments: Array<{ startIndex?: number; endIndex?: number }> | undefined,
  fullText: string,
): string {
  if (!segments) return "";
  return segments
    .map((seg) => {
      const start = Number(seg.startIndex ?? 0);
      const end = Number(seg.endIndex ?? 0);
      return fullText.substring(start, end);
    })
    .join("");
}

function extractRowCells(
  docRows: Array<{ cells?: Array<{ layout?: { textAnchor?: { textSegments?: Array<{ startIndex?: number; endIndex?: number }> } } }> }>,
  docText: string,
): string[][] {
  const result: string[][] = [];
  for (const row of docRows) {
    const cells: string[] = [];
    for (const cell of row.cells || []) {
      cells.push(extractTextFromSegments(cell.layout?.textAnchor?.textSegments, docText).trim());
    }
    result.push(cells);
  }
  return result;
}

async function callDocAiOcr(
  imageBase64: string,
  mimeType: string,
): Promise<{ success: true; result: DocAiOcrResult } | { success: false; error: string }> {
  const processorId = Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (!processorId || !saJson) {
    return { success: false, error: "No Document AI credentials configured (GOOGLE_DOC_AI_PROCESSOR_ID / GOOGLE_SERVICE_ACCOUNT_JSON)" };
  }

  const { resolved: resolvedId, hint: resolveHint } = resolveProcessorId(processorId);
  if (!resolvedId) {
    return { success: false, error: resolveHint || "Invalid GOOGLE_DOC_AI_PROCESSOR_ID format" };
  }

  const accessToken = await getAccessToken();
  const processUrl = `https://documentai.googleapis.com/v1/${resolvedId}:process`;

  console.log(`[acris-vision] Calling Document AI directly (processor: ${resolvedId.split("/").pop()}, mime: ${mimeType})`);

  const docAiResp = await fetch(processUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      rawDocument: {
        content: imageBase64,
        mimeType,
      },
      processOptions: {
        individualPageSelector: { pages: [1] },
      },
    }),
  });

  if (!docAiResp.ok) {
    const errText = await docAiResp.text();
    const hint =
      docAiResp.status === 404
        ? "Processor not found. Verify it exists in Google Cloud Console."
        : docAiResp.status === 403
          ? "Permission denied. Verify the service account has the Document AI API User role."
          : "";
    console.error(`[acris-vision] Document AI ${docAiResp.status}: ${errText.slice(0, 300)}`);
    return { success: false, error: `Document AI ${docAiResp.status}: ${hint || errText.slice(0, 200)}` };
  }

  const docResult = await docAiResp.json();
  const document = docResult.document;

  const pages: DocAiOcrResult["pages"] = [];
  if (document?.pages) {
    for (const page of document.pages) {
      const pageNum = page.pageNumber ?? 1;
      const lines: string[] = [];
      let text = "";

      if (page.lines) {
        for (const line of page.lines) {
          const lineText = extractTextFromSegments(line.layout?.textAnchor?.textSegments, document.text || "");
          lines.push(lineText.trim());
        }
        text = lines.join("\n");
      } else if (document.text) {
        text = document.text;
        lines.push(...text.split("\n"));
      }

      const confidence = page.layout?.confidence ?? page.detectedLanguages?.[0]?.confidence ?? 0.8;
      pages.push({
        page: pageNum,
        text,
        confidence,
        lines: lines.filter((l: string) => l.trim().length > 0),
      });
    }
  }

  const tables: DocAiOcrResult["tables"] = [];
  if (document?.pages) {
    for (const page of document.pages) {
      if (!page.tables) continue;
      const pageNum = page.pageNumber ?? 1;
      for (const table of page.tables) {
        const headerRows = extractRowCells(table.headerRows || [], document.text || "");
        const bodyRows = extractRowCells(table.bodyRows || [], document.text || "");
        tables.push({
          page: pageNum,
          headerRows,
          bodyRows,
          rows: [...headerRows, ...bodyRows],
        });
      }
    }
  }

  console.log(`[acris-vision] Document AI success: ${pages.length} pages, ${tables.length} tables, confidence=${pages[0]?.confidence ?? "N/A"}`);
  return { success: true, result: { pages, tables } };
}

async function callLlmNormalize(
  ocrText: string,
  openaiKey: string,
): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: NORMALIZATION_PROMPT },
        {
          role: "user",
          content: `Here is the raw OCR text extracted from an ACRIS search results screenshot. Parse each row into structured data. Return every transaction row.\n\n---\n${ocrText}\n---`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: NORMALIZATION_SCHEMA,
      },
      temperature: 0.0,
      max_tokens: 16000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callLlmVisionFallback(
  imageBase64: string,
  mimeType: string,
  openaiKey: string,
): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: VISION_FALLBACK_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL visible ACRIS transaction rows from this screenshot. Return every column for every row. Read amounts and party names very carefully.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: NORMALIZATION_SCHEMA,
      },
      temperature: 0.0,
      max_tokens: 16000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI Vision API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({
          error: "OPENAI_API_KEY not configured",
          transactions: [],
          warnings: [],
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let imageBase64: string;
    let mimeType = "image/png";
    let forceVisionOnly = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File | null;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No 'image' field in form data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      mimeType = file.type || "image/png";
      forceVisionOnly = formData.get("forceVisionOnly") === "true";
      const buffer = await file.arrayBuffer();
      imageBase64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      if (!body?.image) {
        return new Response(
          JSON.stringify({ error: "Missing 'image' base64 field" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      imageBase64 = body.image.replace(/^data:image\/\w+;base64,/, "");
      mimeType = body.mimeType || "image/png";
      forceVisionOnly = body.forceVisionOnly === true;
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported content type." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Stage 1: Try Google Document AI OCR first ---
    let ocrText: string | null = null;
    let ocrConfidence: number | null = null;
    let docAiFailed = false;
    let docAiError: string | null = null;
    let rawOcrText: string | null = null;

    if (!forceVisionOnly) {
      const ocrResult = await callDocAiOcr(imageBase64, mimeType);
      if (ocrResult.success) {
        const { result } = ocrResult;

        const allPageText = result.pages.map((p) => p.text).join("\n");
        const avgConfidence =
          result.pages.length > 0
            ? result.pages.reduce((sum, p) => sum + p.confidence, 0) /
              result.pages.length
            : 0;

        ocrConfidence = Math.round(avgConfidence * 100) / 100;
        rawOcrText = allPageText;

        if (result.tables.length > 0) {
          const tableText = result.tables
            .map((t) => {
              const header = t.headerRows.map((r) => r.join("\t")).join("\n");
              const body = t.bodyRows.map((r) => r.join("\t")).join("\n");
              return header ? `${header}\n${body}` : body;
            })
            .join("\n\n");
          ocrText = tableText || allPageText;
        } else {
          ocrText = allPageText;
        }

        if (!ocrText || ocrText.trim().length < 20) {
          docAiFailed = true;
          docAiError = "Document AI returned insufficient text";
          ocrText = null;
        }
      } else {
        docAiFailed = true;
        docAiError = ocrResult.error;
      }
    }

    let pipeline: "docai_plus_llm" | "llm_vision_only";
    let llmContent: string;

    if (ocrText && !forceVisionOnly) {
      // --- Stage 2: LLM normalization of OCR text (no image tokens!) ---
      pipeline = "docai_plus_llm";
      llmContent = await callLlmNormalize(ocrText, openaiKey);
    } else {
      // --- Fallback: GPT-4o vision (single-stage) ---
      pipeline = "llm_vision_only";
      llmContent = await callLlmVisionFallback(imageBase64, mimeType, openaiKey);
    }

    if (!llmContent) {
      return new Response(
        JSON.stringify({
          transactions: [],
          warnings: ["No content returned from LLM"],
          pipelineMeta: { pipeline, ocrConfidence, rawOcrText },
          docAiFailed,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const parsed = JSON.parse(llmContent);
    const { deduped, rawWarnings } = mapTransactions(parsed);

    const warnings = [...rawWarnings];
    const detectedDocType = deduped.length > 0 ? deduped[0]?.docType : null;
    if (detectedDocType) {
      warnings.unshift(`Detected document type: ${detectedDocType}`);
    }
    if (pipeline === "docai_plus_llm") {
      warnings.push(
        `Pipeline: Google Document AI OCR (confidence ${ocrConfidence}) + GPT-4o normalization`,
      );
    } else {
      warnings.push("Pipeline: GPT-4o vision only (single-stage)");
    }
    if (docAiFailed && docAiError) {
      warnings.push(`Document AI issue: ${docAiError}`);
    }
    warnings.push(`Extracted ${deduped.length} rows`);

    return new Response(
      JSON.stringify({
        transactions: deduped,
        warnings,
        pipelineMeta: { pipeline, ocrConfidence, rawOcrText },
        docAiFailed,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
        transactions: [],
        warnings: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
