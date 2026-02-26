import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import pdf from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Parsing helpers (inlined for edge function single-file constraint) ────

function parseNum(raw: string): number | null {
  const c = raw.replace(/,/g, "").replace(/\s/g, "").replace(/[^\d.]/g, "");
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

function ef<T>(value: T, confidence: number, source: string, page: number | null = null) {
  return { value, confidence, source, pageNumber: page };
}

function findPage(line: string, pages: string[]): number | null {
  const needle = line.trim().substring(0, 60);
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].includes(needle)) return i + 1;
  }
  return null;
}

const UT_PATS = [
  { r: /\bstudio\b/i, l: "Studio" },
  { r: /\b(?:1[- ]?br|1[- ]?bed(?:room)?|one[- ]?bed(?:room)?)\b/i, l: "1BR" },
  { r: /\b(?:2[- ]?br|2[- ]?bed(?:room)?|two[- ]?bed(?:room)?)\b/i, l: "2BR" },
  { r: /\b(?:3[- ]?br|3[- ]?bed(?:room)?|three[- ]?bed(?:room)?)\b/i, l: "3BR" },
  { r: /\b(?:4[- ]?br|4[- ]?bed(?:room)?|four[- ]?bed(?:room)?)\b/i, l: "4BR" },
];
const NUM_RE = /[\d,]+(?:\.\d+)?/g;

function classifyNums(parsedNums: number[]): { count: number; nsf: number | null; gsf: number | null } {
  if (parsedNums.length === 0) return { count: 1, nsf: null, gsf: null };

  const countCands = parsedNums.filter((n) => n >= 1 && n <= 500 && Number.isInteger(n));
  const sfCands = parsedNums.filter((n) => n >= 200 && n <= 3000);

  let count = 1;
  let nsf: number | null = null;
  let gsf: number | null = null;

  if (countCands.length > 0) {
    count = countCands[0];
  } else if (parsedNums[0] <= 500) {
    count = parsedNums[0];
  }

  const remainingSf = sfCands.filter((n) => n !== count);
  if (remainingSf.length >= 2) {
    const sorted = [...remainingSf].sort((a, b) => a - b);
    nsf = sorted[0];
    gsf = sorted[1];
  } else if (remainingSf.length === 1) {
    nsf = remainingSf[0];
  } else if (parsedNums.length > 1) {
    const afterCount = parsedNums.slice(parsedNums.indexOf(count) + 1);
    if (afterCount.length >= 1 && afterCount[0] >= 100) nsf = afterCount[0];
    if (afterCount.length >= 2 && afterCount[1] >= 100) gsf = afterCount[1];
  }

  if (nsf !== null && gsf !== null && nsf > gsf) {
    [nsf, gsf] = [gsf, nsf];
  }

  return { count, nsf, gsf };
}

function extractUnits(text: string, pages: string[]) {
  const rows: any[] = [];
  const snips: any[] = [];
  for (const line of text.split("\n")) {
    for (const u of UT_PATS) {
      const tm = u.r.exec(line);
      if (!tm) continue;
      const afterType = line.substring(tm.index + tm[0].length);
      const nums = afterType.match(NUM_RE);
      if (!nums) continue;
      const pn = nums.map((n) => parseNum(n)).filter((n): n is number => n !== null);
      if (pn.length === 0) continue;

      const classified = classifyNums(pn);

      const isAff = /\baffordable\b/i.test(line);
      const isMkt = /\bmarket\b/i.test(line);
      const ten = isAff ? "Affordable" : isMkt ? "Market" : null;
      const conf = pn.length >= 2 ? 0.85 : 0.65;
      const pg = findPage(line, pages);
      rows.push({
        unitType: ef(u.l, 0.95, line.trim(), pg),
        count: ef(Math.round(classified.count), conf, line.trim(), pg),
        nsf: classified.nsf !== null ? ef(Math.round(classified.nsf), conf, line.trim(), pg) : null,
        gsf: classified.gsf !== null ? ef(Math.round(classified.gsf), conf - 0.1, line.trim(), pg) : null,
        affordableOrMarket: ten ? ef(ten, 0.8, line.trim(), pg) : null,
      });
      snips.push({ page: pg ?? 0, text: line.trim(), target: "unitSchedule" });
      break;
    }
  }
  return { rows, snips };
}

const FAR_MIN = 0.1;
const FAR_MAX = 15.0;

const ZON_PATS: Array<{ k: string; r: RegExp; ft?: "string" }> = [
  { k: "lotArea", r: /lot\s*area[:\s]*(?:approx\.?\s*)?([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft|square\s*feet)?/i },
  { k: "far", r: /(?:max(?:imum)?\s+)?\b(?:f\.?a\.?r\.?(?![a-z])|floor\s*area\s*ratio)[:\s]*([0-9,]+(?:\.\d+)?)/gi },
  { k: "residFar", r: /resid(?:ential)?\s*\b(?:f\.?a\.?r\.?(?![a-z])|floor\s*area\s*ratio)[:\s]*([0-9,]+(?:\.\d+)?)/gi },
  { k: "zoningFloorArea", r: /(?:zoning|max(?:imum)?|allowable)\s*(?:floor\s*area|zfa|gfa)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { k: "proposedFloorArea", r: /proposed\s*(?:floor\s*area|gfa|gsf|total\s*area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { k: "totalUnits", r: /(?:#\s*(?:of\s+)?units|number\s*of\s*(?:dwelling\s*)?units|(?:dwelling\s*)?units|#\s*of\s*(?:dwelling\s*)?units)[:\s]*(\d{1,4})\b/i },
  { k: "buildingArea", r: /(?:bldg|building)\s*area[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { k: "floors", r: /(?:#\s*(?:of\s+)?floors|number\s*of\s*(?:floors|stories)|stories)[:\s]*(\d{1,3})\b/i },
  { k: "zoneDistrict", r: /\bzone[:\s]*((?:R|C|M)\d{1,2}-\d[A-Z]?)\b/i, ft: "string" },
  { k: "bin", r: /\bbin[:\s]*(\d{7})\b/i, ft: "string" },
];

function extractZoning(text: string, pages: string[]) {
  const z: any = { lotArea: null, far: null, zoningFloorArea: null, proposedFloorArea: null, residFar: null, totalUnits: null, zoneDistrict: null, buildingArea: null, floors: null, bin: null };
  const snips: any[] = [];
  const isFarField = (k: string) => k === "far" || k === "residFar";

  for (const p of ZON_PATS) {
    if (isFarField(p.k)) {
      p.r.lastIndex = 0;
      let best: { val: number; ctx: string } | null = null;
      let m: RegExpExecArray | null;
      while ((m = p.r.exec(text)) !== null) {
        const v = parseNum(m[1]);
        if (v !== null && v >= FAR_MIN && v <= FAR_MAX) {
          best = { val: v, ctx: m[0] };
          break;
        }
      }
      if (best) {
        const pg = findPage(best.ctx, pages);
        z[p.k] = ef(best.val, 0.8, best.ctx, pg);
        snips.push({ page: pg ?? 0, text: best.ctx, target: "zoningAnalysis" });
      }
    } else if (p.ft === "string") {
      const m = text.match(p.r);
      if (m && m[1]) {
        const pg = findPage(m[0], pages);
        z[p.k] = ef(m[1].trim(), 0.8, m[0], pg);
        snips.push({ page: pg ?? 0, text: m[0], target: "zoningAnalysis" });
      }
    } else {
      const m = text.match(p.r);
      if (m && m[1]) {
        const v = parseNum(m[1]);
        if (v !== null) {
          const pg = findPage(m[0], pages);
          z[p.k] = ef(v, 0.8, m[0], pg);
          snips.push({ page: pg ?? 0, text: m[0], target: "zoningAnalysis" });
        }
      }
    }
  }
  return { z, snips };
}

const NON_RES_QUAL = /(?:commercial|retail|landscaping|amenity|parking|mechanical)\s+/i;

const CONV_PATS = [
  { k: "preExistingArea", r: /(?:pre[- ]?existing|existing)\s*(?:floor\s*area|area|building)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)?/i },
  { k: "newArea", r: /new\s+(?:construction\s+|building\s+)?(?:floor\s*area|gross\s*area|net\s*area|construction\s*area|area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)/i },
  { k: "totalArea", r: /(?:total|overall)\s+(?:(?:residential|project|building)\s+)?(?:floor\s*area|area|project\s*area)[:\s]*([0-9,]+(?:\.\d+)?)\s*(?:sf|sq\.?\s*ft)/i },
];

function crossValidateConv(c: any, snips: any[]) {
  const pre = c.preExistingArea?.value;
  const nw = c.newArea?.value;
  const total = c.totalArea?.value;

  if (pre != null && nw != null && total != null) {
    const sum = pre + nw;
    const tolerance = total * 0.05;
    if (Math.abs(sum - total) <= tolerance) {
      if (c.preExistingArea) c.preExistingArea = ef(pre, Math.min(1, c.preExistingArea.confidence + 0.10), c.preExistingArea.source, c.preExistingArea.pageNumber);
      if (c.newArea) c.newArea = ef(nw, Math.min(1, c.newArea.confidence + 0.10), c.newArea.source, c.newArea.pageNumber);
      if (c.totalArea) c.totalArea = ef(total, Math.min(1, c.totalArea.confidence + 0.10), c.totalArea.source, c.totalArea.pageNumber);
    } else {
      const fields = [
        { key: "preExistingArea", f: c.preExistingArea },
        { key: "newArea", f: c.newArea },
        { key: "totalArea", f: c.totalArea },
      ].filter((x) => x.f !== null);
      const weakest = fields.reduce((min, x) => (x.f.confidence < min.f.confidence ? x : min));
      if (weakest.f) {
        c[weakest.key] = ef(weakest.f.value, Math.max(0.3, weakest.f.confidence - 0.15), weakest.f.source, weakest.f.pageNumber);
      }
      snips.push({ page: 0, text: `Area values do not reconcile: ${pre} + ${nw} != ${total}`, target: "conversion" });
    }
  }
}

function extractConv(text: string, pages: string[]) {
  const c: any = { preExistingArea: null, newArea: null, totalArea: null };
  const snips: any[] = [];
  let found = false;
  for (const p of CONV_PATS) {
    const m = text.match(p.r);
    if (m && m[1]) {
      if (NON_RES_QUAL.test(m[0])) continue;
      const v = parseNum(m[1]);
      if (v !== null) {
        const pg = findPage(m[0], pages);
        c[p.k] = ef(v, 0.75, m[0], pg);
        snips.push({ page: pg ?? 0, text: m[0], target: "conversion" });
        found = true;
      }
    }
  }
  if (found) crossValidateConv(c, snips);
  return { c: found ? c : null, snips };
}

function assessYield(pages: string[]): { y: "high" | "low" | "none"; avg: number } {
  if (pages.length === 0) return { y: "none", avg: 0 };
  const total = pages.reduce((s, p) => s + p.length, 0);
  const avg = total / pages.length;
  if (avg < 50) return { y: "none", avg };
  if (avg < 200) return { y: "low", avg };
  return { y: "high", avg };
}

function buildExtraction(fullText: string, pageTexts: string[], pageCount: number) {
  const yi = assessYield(pageTexts);
  const { rows: unitSchedule, snips: us } = extractUnits(fullText, pageTexts);
  const { z: zoningAnalysis, snips: zs } = extractZoning(fullText, pageTexts);
  const { c: conversion, snips: cs } = extractConv(fullText, pageTexts);
  const rawSnippets = [...us, ...zs, ...cs];

  const confVals: number[] = [];
  for (const row of unitSchedule) {
    confVals.push(row.unitType.confidence, row.count.confidence);
    if (row.nsf) confVals.push(row.nsf.confidence);
  }
  for (const f of [zoningAnalysis.lotArea, zoningAnalysis.far, zoningAnalysis.zoningFloorArea, zoningAnalysis.proposedFloorArea, zoningAnalysis.residFar]) {
    if (f) confVals.push(f.confidence);
  }
  const overallConfidence = confVals.length > 0 ? Math.round((confVals.reduce((s: number, v: number) => s + v, 0) / confVals.length) * 100) / 100 : 0;

  return {
    unitSchedule, zoningAnalysis, conversion, overallConfidence,
    textYield: yi.y, needsOcr: yi.y === "low" || yi.y === "none",
    pageCount, rawSnippets,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: record, error: dbErr } = await supabase
      .from("pdf_uploads")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();

    if (dbErr || !record) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("pdf_uploads").update({ status: "extracting" }).eq("id", fileId);

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("pdf-uploads")
      .download(record.storage_path);

    if (dlErr || !fileData) {
      await supabase.from("pdf_uploads").update({ status: "failed" }).eq("id", fileId);
      return new Response(JSON.stringify({ error: "Failed to download file from storage" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // ── Stage 1: Native text extraction ──────────────────────────────────
    let fullText = "";
    let pageTexts: string[] = [];
    let pageCount = 0;

    try {
      const pdfData = await pdf(buffer, {
        max: 50,
        pagerender: function (pageData: any) {
          return pageData.getTextContent().then(function (textContent: any) {
            let text = "";
            let lastY = -1;
            for (const item of textContent.items) {
              if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 2) {
                text += "\n";
              }
              text += item.str;
              lastY = item.transform[5];
            }
            return text;
          });
        },
      });
      fullText = pdfData.text || "";
      pageCount = pdfData.numpages || 0;

      if (pdfData.text) {
        const rawPages = pdfData.text.split(/\f/);
        pageTexts = rawPages.length > 1 ? rawPages : [pdfData.text];
      }
    } catch (parseErr) {
      await supabase.from("pdf_uploads").update({ status: "failed" }).eq("id", fileId);
      return new Response(JSON.stringify({ error: `PDF parsing failed: ${String(parseErr)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Stage 2: OCR fallback check ──────────────────────────────────────
    const yieldCheck = assessYield(pageTexts);
    if (yieldCheck.y === "low" || yieldCheck.y === "none") {
      try {
        const retryData = await pdf(buffer, { max: 5 });
        if (retryData.text && retryData.text.length > fullText.length) {
          fullText = retryData.text;
          const rp = retryData.text.split(/\f/);
          pageTexts = rp.length > 1 ? rp : [retryData.text];
        }
      } catch (_) {
        // keep original extraction
      }
    }

    const extraction = buildExtraction(fullText, pageTexts, pageCount);

    await supabase.from("pdf_uploads").update({
      status: "extracted",
      extraction,
      extracted_at: new Date().toISOString(),
    }).eq("id", fileId);

    return new Response(
      JSON.stringify({ fileId, extraction }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
