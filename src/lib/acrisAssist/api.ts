import { supabase } from '../supabase';
import type { ParsedTxn, ParseResult, AssistIngestionSource } from '../../types/acrisAssist';
import { makeBBL, toISODate, normalizeBorough } from './normalize';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function parseAcrisClipboard(text: string): Promise<ParseResult> {
  const url = `${SUPABASE_URL}/functions/v1/acris-parse`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Parse request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function extractAcrisVision(
  imageBlob: Blob,
  options?: { forceVisionOnly?: boolean },
): Promise<ParseResult> {
  const url = `${SUPABASE_URL}/functions/v1/acris-vision`;
  const formData = new FormData();
  formData.append('image', imageBlob, 'screenshot.png');
  if (options?.forceVisionOnly) {
    formData.append('forceVisionOnly', 'true');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Vision extraction failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

const DEED_TYPES = new Set(['DEED', 'DEEDO', 'ADED', 'CDEC']);
const BATCH_SIZE = 500;

function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function resolveBorough(txn: ParsedTxn): string {
  const b = txn.borough ?? '';
  if (/^[1-5]$/.test(b)) return b;
  return normalizeBorough(b) || b;
}

function resolveDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (isISODate(raw)) return raw;
  return toISODate(raw);
}

interface DocRow {
  document_id: string;
  crfn: string | null;
  recorded_date: string;
  doc_date: string | null;
  doc_type: string;
  borough: string;
  block: string;
  lot: string;
  bbl: string;
  reel_pg_file: string | null;
  partial_lot: string | null;
  pages: number | null;
  party1: string | null;
  party2: string | null;
  party3: string | null;
  amount: number | null;
  corrected: boolean;
  source: string;
  raw_payload_json: Record<string, unknown>;
}

function rowFingerprint(r: { recorded_date: string; amount: number | null; party1: string | null; party2: string | null; doc_type: string }): string {
  return `${r.recorded_date}|${r.amount ?? ''}|${r.party1 ?? ''}|${r.party2 ?? ''}|${r.doc_type}`;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export interface UpsertProgress {
  phase: 'preparing' | 'checking' | 'saving' | 'backfilling' | 'done';
  saved: number;
  skipped: number;
  total: number;
}

export async function upsertAcrisAssistDocs(
  txns: ParsedTxn[],
  source: AssistIngestionSource,
  onProgress?: (p: UpsertProgress) => void,
): Promise<{ ingested: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  onProgress?.({ phase: 'preparing', saved: 0, skipped: 0, total: txns.length });

  let docRows: DocRow[] = txns.map((txn) => {
    const boroCode = resolveBorough(txn);
    const bbl = txn.bbl || makeBBL(boroCode, txn.block ?? '', txn.lot ?? '');
    const documentId = txn.documentId || txn.crfn || txn.dedupeKey;
    const recordedISO = resolveDate(txn.recordedDate) || today;
    const docDateISO = resolveDate(txn.docDate);

    return {
      document_id: documentId,
      crfn: txn.crfn || null,
      recorded_date: recordedISO,
      doc_date: docDateISO,
      doc_type: txn.docType || '',
      borough: boroCode,
      block: txn.block || '',
      lot: txn.lot || '',
      bbl,
      reel_pg_file: txn.reelPgFile || null,
      partial_lot: txn.partial || null,
      pages: txn.pages ? parseInt(txn.pages, 10) : null,
      party1: txn.party1 || null,
      party2: txn.party2 || null,
      party3: txn.party3 || null,
      amount: txn.amount ? parseFloat(txn.amount) : null,
      corrected: txn.corrected ?? false,
      source,
      raw_payload_json: { rawLine: txn.rawLine, dedupeKey: txn.dedupeKey },
    };
  });

  const seenCrfnBbl = new Set<string>();
  docRows = docRows.filter((r) => {
    if (!r.crfn) return true;
    const key = `${r.crfn}|${r.bbl}`;
    if (seenCrfnBbl.has(key)) return false;
    seenCrfnBbl.add(key);
    return true;
  });

  onProgress?.({ phase: 'checking', saved: 0, skipped: 0, total: docRows.length });

  const allCrfns = [...new Set(docRows.filter((r) => r.crfn).map((r) => r.crfn!))];
  if (allCrfns.length > 0) {
    const existingMap = new Map<string, string>();
    for (const batch of chunks(allCrfns, BATCH_SIZE)) {
      const { data: existing } = await supabase
        .from('acris_documents')
        .select('document_id, crfn, bbl')
        .in('crfn', batch);
      if (existing) {
        for (const row of existing) {
          existingMap.set(`${row.crfn}|${row.bbl}`, row.document_id);
        }
      }
    }
    for (const row of docRows) {
      if (row.crfn) {
        const existingDocId = existingMap.get(`${row.crfn}|${row.bbl}`);
        if (existingDocId) row.document_id = existingDocId;
      }
    }
  }

  const seenDocBbl = new Set<string>();
  docRows = docRows.filter((r) => {
    const key = `${r.document_id}|${r.bbl}`;
    if (seenDocBbl.has(key)) return false;
    seenDocBbl.add(key);
    return true;
  });

  const allDocIds = [...new Set(docRows.map((r) => r.document_id))];
  const existingFingerprints = new Map<string, string>();
  for (const batch of chunks(allDocIds, BATCH_SIZE)) {
    const { data: existing } = await supabase
      .from('acris_documents')
      .select('document_id, bbl, recorded_date, amount, party1, party2, doc_type')
      .in('document_id', batch);
    if (existing) {
      for (const row of existing) {
        const key = `${row.document_id}|${row.bbl}`;
        existingFingerprints.set(key, rowFingerprint(row));
      }
    }
  }

  const toUpsert: DocRow[] = [];
  let skipped = 0;
  for (const row of docRows) {
    const key = `${row.document_id}|${row.bbl}`;
    const existingFp = existingFingerprints.get(key);
    if (existingFp && existingFp === rowFingerprint(row)) {
      skipped++;
    } else {
      toUpsert.push(row);
    }
  }

  let ingested = 0;
  const upsertBatches = chunks(toUpsert, BATCH_SIZE);
  for (const batch of upsertBatches) {
    const { error, count } = await supabase
      .from('acris_documents')
      .upsert(batch, { onConflict: 'document_id,bbl', count: 'exact' });

    if (error) {
      errors.push(error.message);
    } else {
      ingested += count ?? batch.length;
    }
    onProgress?.({ phase: 'saving', saved: ingested, skipped, total: docRows.length });
  }

  onProgress?.({ phase: 'backfilling', saved: ingested, skipped, total: docRows.length });

  const saleRows = toUpsert
    .filter((r) => r.bbl && r.doc_type && DEED_TYPES.has(r.doc_type))
    .map((r) => ({
      bbl: r.bbl,
      sale_date: r.doc_date || r.recorded_date,
      sale_price: r.amount ?? 0,
      doc_type: r.doc_type,
      source: 'acris_assist',
      document_id: r.document_id,
    }));

  for (const batch of chunks(saleRows, BATCH_SIZE)) {
    const { error: saleErr } = await supabase
      .from('discovery_sales')
      .upsert(batch, { onConflict: 'bbl,sale_date,source' });
    if (saleErr) errors.push(`sale backfill: ${saleErr.message}`);
  }

  if (saleRows.length > 0) {
    const bestSaleByBbl = new Map<string, { sale_date: string; sale_price: number }>();
    for (const sr of saleRows) {
      if (sr.sale_price <= 0) continue;
      const prev = bestSaleByBbl.get(sr.bbl);
      if (!prev || sr.sale_date > prev.sale_date) {
        bestSaleByBbl.set(sr.bbl, { sale_date: sr.sale_date, sale_price: sr.sale_price });
      }
    }

    const saleBbls = [...bestSaleByBbl.keys()];
    for (const batch of chunks(saleBbls, BATCH_SIZE)) {
      const { data: cacheRows } = await supabase
        .from('discovery_cache')
        .select('bbl, slack_sf, last_sale_date')
        .in('bbl', batch);

      if (cacheRows) {
        for (const row of cacheRows) {
          const sale = bestSaleByBbl.get(row.bbl);
          if (!sale) continue;
          if (row.last_sale_date && row.last_sale_date >= sale.sale_date) continue;
          const slackSf = row.slack_sf ?? 0;
          const ppbsf = slackSf > 0
            ? Math.round((sale.sale_price / slackSf) * 100) / 100
            : null;
          const { error: updErr } = await supabase
            .from('discovery_cache')
            .update({
              last_sale_price: sale.sale_price,
              last_sale_date: sale.sale_date,
              last_sale_source: 'acris_assist',
              ppbsf,
            })
            .eq('bbl', row.bbl);
          if (updErr) errors.push(`cache ppbsf update ${row.bbl}: ${updErr.message}`);
        }
      }
    }
  }

  const dates = toUpsert
    .map((r) => r.recorded_date)
    .filter((d) => d && d !== today)
    .sort();

  if (dates.length > 0) {
    const { error: covErr } = await supabase
      .from('acris_data_coverage')
      .upsert(
        {
          source: 'acris_assist',
          borough: 'all',
          date_from: dates[0],
          date_to: dates[dates.length - 1],
          doc_count: ingested,
          last_checked_at: new Date().toISOString(),
          last_ingested_at: new Date().toISOString(),
          metadata_json: { ingestion_source: source },
        },
        { onConflict: 'source,borough' }
      );
    if (covErr) errors.push(`coverage update: ${covErr.message}`);
  }

  onProgress?.({ phase: 'done', saved: ingested, skipped, total: docRows.length });

  return { ingested, skipped, errors };
}
