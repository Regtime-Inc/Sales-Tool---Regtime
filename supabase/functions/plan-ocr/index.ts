import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getAccessToken, resolveProcessorId } from "../_shared/googleAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OcrPageResult {
  page: number;
  text: string;
  confidence: number;
  lines: string[];
}

interface OcrRequest {
  fileBase64: string;
  mimeType?: string;
  pages: number[];
  cropRegions?: Array<{ page: number; region: { xPct: number; yPct: number; wPct: number; hPct: number } }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const processorId = Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("check") === "1") {
        const hasCreds = !!(processorId && saJson);
        const resolved = processorId ? resolveProcessorId(processorId) : { resolved: null };
        return new Response(
          JSON.stringify({
            available: hasCreds && !!resolved.resolved,
            configured: hasCreds,
            formatValid: !!resolved.resolved,
            hint: resolved.hint || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!processorId || !saJson) {
      return new Response(
        JSON.stringify({
          error: "no_provider",
          message:
            "No cloud OCR configured. Set GOOGLE_DOC_AI_PROCESSOR_ID and GOOGLE_SERVICE_ACCOUNT_JSON.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { resolved: resolvedId, hint: resolveHint } = resolveProcessorId(processorId);
    if (!resolvedId) {
      console.error(`[plan-ocr] Invalid GOOGLE_DOC_AI_PROCESSOR_ID: ${resolveHint}`);
      return new Response(
        JSON.stringify({
          error: "invalid_processor_id",
          message: resolveHint,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: OcrRequest = await req.json();
    if (!body.fileBase64 || !body.pages || body.pages.length === 0) {
      return new Response(
        JSON.stringify({ error: "fileBase64 and pages[] are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await getAccessToken();
    const processUrl = `https://documentai.googleapis.com/v1/${resolvedId}:process`;

    const docMimeType = body.mimeType || "application/pdf";
    const requestBody: Record<string, unknown> = {
      rawDocument: {
        content: body.fileBase64,
        mimeType: docMimeType,
      },
    };

    if (body.pages.length > 0) {
      requestBody.processOptions = {
        individualPageSelector: {
          pages: body.pages,
        },
      };
    }

    const docAiResp = await fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!docAiResp.ok) {
      const errText = await docAiResp.text();
      console.error(`[plan-ocr] Document AI ${docAiResp.status} for processor ${resolvedId.split("/").pop()}: ${errText.slice(0, 500)}`);
      const hint =
        docAiResp.status === 404
          ? "Processor not found. Verify the processor exists in Google Cloud Console and the GOOGLE_DOC_AI_PROCESSOR_ID is the full resource path."
          : docAiResp.status === 403
            ? "Permission denied. Verify the service account has the Document AI API User role."
            : docAiResp.status === 400
              ? "Bad request. The document may be in an unsupported format or too large."
              : null;
      return new Response(
        JSON.stringify({
          error: `Document AI error: ${docAiResp.status}`,
          details: errText,
          hint,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const docResult = await docAiResp.json();
    const document = docResult.document;
    const ocrPages: OcrPageResult[] = [];

    if (document?.pages) {
      for (const page of document.pages) {
        const pageNum = (page.pageNumber ?? 1);
        let text = "";
        const lines: string[] = [];

        if (page.lines) {
          for (const line of page.lines) {
            const lineText =
              line.layout?.textAnchor?.textSegments
                ?.map((seg: { startIndex?: number; endIndex?: number }) => {
                  const start = Number(seg.startIndex ?? 0);
                  const end = Number(seg.endIndex ?? 0);
                  return (document.text || "").substring(start, end);
                })
                .join("") ?? "";
            lines.push(lineText.trim());
          }
          text = lines.join("\n");
        } else if (document.text) {
          text = document.text;
          lines.push(...text.split("\n"));
        }

        const confidence =
          page.layout?.confidence ?? page.detectedLanguages?.[0]?.confidence ?? 0.8;

        ocrPages.push({
          page: pageNum,
          text,
          confidence,
          lines: lines.filter((l: string) => l.trim().length > 0),
        });
      }
    }

    function extractRowCells(
      docRows: Array<{ cells?: Array<{ layout?: { textAnchor?: { textSegments?: Array<{ startIndex?: number; endIndex?: number }> } } }> }>,
      docText: string
    ): string[][] {
      const result: string[][] = [];
      for (const row of docRows) {
        const cells: string[] = [];
        for (const cell of row.cells || []) {
          const cellText =
            cell.layout?.textAnchor?.textSegments
              ?.map((seg: { startIndex?: number; endIndex?: number }) => {
                const start = Number(seg.startIndex ?? 0);
                const end = Number(seg.endIndex ?? 0);
                return docText.substring(start, end);
              })
              .join("")
              .trim() ?? "";
          cells.push(cellText);
        }
        result.push(cells);
      }
      return result;
    }

    const tables: Array<{ page: number; headerRows: string[][]; bodyRows: string[][]; rows: string[][] }> = [];
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

    return new Response(
      JSON.stringify({ pages: ocrPages, tables }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
