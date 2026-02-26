import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ExternalLink, FileText, ArrowUpRight, Loader2, AlertTriangle, RefreshCw, Clock, Info } from 'lucide-react';
import type { AcrisDocument } from '../types/acris';
import { docTypeCategory } from '../lib/acris/docTypes';
import { boroughName, formatBbl, formatCurrency, formatDate, acrisPortalUrl, acrisImageUrl, acrisBblSearchUrl, isRealAcrisDocId, partyLabels } from '../lib/acris/utils';
import { fetchAcrisRecent } from '../lib/api';
import AcrisDocViewer from './AcrisDocViewer';

interface AcrisDocPreviewProps {
  doc: AcrisDocument;
  onClose: () => void;
  onAnalyze: (bbl: string) => void;
}

type PreviewState = 'loading' | 'loaded' | 'rate_limited' | 'unavailable' | 'failed' | 'crfn_only';

interface DocPayload {
  data: ArrayBuffer;
  contentType: string;
}

const DOC_CATEGORY_LABELS: Record<string, string> = {
  deed: 'Deed',
  mortgage: 'Mortgage',
  regulatory: 'Regulatory',
  unknown: 'Document',
};

const DOC_CATEGORY_COLORS: Record<string, string> = {
  deed: 'bg-teal-50 text-teal-700 border-teal-200',
  mortgage: 'bg-amber-50 text-amber-700 border-amber-200',
  regulatory: 'bg-slate-100 text-slate-600 border-slate-200',
  unknown: 'bg-slate-50 text-slate-500 border-slate-200',
};

export default function AcrisDocPreview({ doc, onClose, onAnalyze }: AcrisDocPreviewProps) {
  const cat = docTypeCategory(doc.doc_type);
  const [party1Label, party2Label] = partyLabels(doc.doc_type);
  const hasRealDocId = isRealAcrisDocId(doc.document_id);
  const acrisUrl = hasRealDocId ? acrisPortalUrl(doc.document_id) : acrisBblSearchUrl(doc.bbl);
  const imageUrl = hasRealDocId ? acrisImageUrl(doc.document_id) : null;

  const [previewState, setPreviewState] = useState<PreviewState>(hasRealDocId ? 'loading' : 'crfn_only');
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [docPayload, setDocPayload] = useState<DocPayload | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const [relatedDocs, setRelatedDocs] = useState<AcrisDocument[]>([]);

  const loadDocument = useCallback(async () => {
    if (!hasRealDocId) {
      setPreviewState('crfn_only');
      return;
    }
    setPreviewState('loading');
    setRetryAfterMs(0);
    setDocPayload(null);

    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const proxyUrl = `${base}/functions/v1/acris-proxy?doc_id=${encodeURIComponent(doc.document_id)}`;

      const res = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      if (res.status === 429) {
        const body = await res.json();
        const wait = body.retryAfterMs || 5000;
        setRetryAfterMs(wait);
        setPreviewState('rate_limited');
        startCountdown(wait);
        return;
      }

      if (!res.ok) {
        setPreviewState('failed');
        return;
      }

      const docFormat = res.headers.get('X-Doc-Format');
      const contentType = res.headers.get('Content-Type') || '';

      if (docFormat === 'unavailable' || contentType.includes('application/json')) {
        setPreviewState('unavailable');
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      setDocPayload({ data: arrayBuffer, contentType });
      setPreviewState('loaded');
    } catch {
      setPreviewState('failed');
    }
  }, [doc.document_id, hasRealDocId]);

  function startCountdown(ms: number) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const end = Date.now() + ms;
    countdownRef.current = setInterval(() => {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        setRetryAfterMs(0);
        loadDocument();
      } else {
        setRetryAfterMs(remaining);
      }
    }, 200);
  }

  useEffect(() => {
    loadDocument();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [loadDocument]);

  useEffect(() => {
    fetchAcrisRecent({ bbl: doc.bbl, days: 90, limit: 6, sortBy: 'recorded_date', sortDir: 'desc' })
      .then((res) => {
        setRelatedDocs(res.documents.filter((d) => d.document_id !== doc.document_id).slice(0, 4));
      })
      .catch(() => {});
  }, [doc.bbl, doc.document_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: 'fadeIn 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">ACRIS Document</h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${DOC_CATEGORY_COLORS[cat]}`}>
                  {doc.doc_type} - {DOC_CATEGORY_LABELS[cat]}
                </span>
                {!hasRealDocId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                    CRFN only
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {hasRealDocId ? `ID: ${doc.document_id}` : `CRFN: ${doc.crfn || doc.document_id}`}
                {hasRealDocId && doc.crfn ? ` / CRFN: ${doc.crfn}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 flex-1 min-h-0 overflow-hidden">
          <div className="lg:col-span-2 p-6 border-r border-slate-100 overflow-y-auto space-y-4">
            <DetailRow label="Recorded Date" value={formatDate(doc.recorded_date)} />
            <DetailRow label="BBL" value={formatBbl(doc.bbl)} mono />
            <DetailRow label="Borough" value={boroughName(doc.borough)} />
            <DetailRow label="Block / Lot" value={`${parseInt(doc.block)} / ${parseInt(doc.lot)}`} />
            <DetailRow label="Amount" value={formatCurrency(doc.amount)} highlight={!!doc.amount} />
            <DetailRow label={party1Label} value={doc.party1 || '--'} />
            <DetailRow label={party2Label} value={doc.party2 || '--'} />
            <DetailRow label="Source" value={doc.source} />

            <div className="pt-3 flex flex-col gap-2">
              <button
                onClick={() => { onAnalyze(doc.bbl); onClose(); }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-lg hover:bg-teal-800 transition-colors w-full"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Analyze BBL {formatBbl(doc.bbl)}
              </button>
              <div className={`grid gap-2 ${imageUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <a
                  href={acrisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {hasRealDocId ? 'ACRIS Portal' : 'Search BBL in ACRIS'}
                </a>
                {imageUrl && (
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Image
                  </a>
                )}
              </div>
            </div>

            {relatedDocs.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Other Documents for This BBL</h4>
                <div className="space-y-1.5">
                  {relatedDocs.map((rd) => {
                    const rdCat = docTypeCategory(rd.doc_type);
                    const rdHasRealId = isRealAcrisDocId(rd.document_id);
                    return (
                      <div key={rd.document_id + rd.bbl} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${DOC_CATEGORY_COLORS[rdCat]?.replace('border-', 'border border-') || 'bg-slate-50 text-slate-500'}`}>
                            {rd.doc_type}
                          </span>
                          <span className="text-slate-500 truncate">{formatDate(rd.recorded_date)}</span>
                          {rd.amount ? <span className="text-slate-700 font-medium">{formatCurrency(rd.amount)}</span> : null}
                        </div>
                        <a
                          href={rdHasRealId ? acrisPortalUrl(rd.document_id) : acrisBblSearchUrl(rd.bbl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex-shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 bg-slate-50 flex flex-col min-h-[400px]">
            {previewState === 'loading' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
                <p className="text-sm text-slate-500">Loading document preview...</p>
                <p className="text-[10px] text-slate-400">Fetching from ACRIS portal</p>
              </div>
            )}

            {previewState === 'crfn_only' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center">
                  <Info className="h-7 w-7 text-sky-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">CRFN-only record</p>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  This document was imported without a full ACRIS document ID. The document ID will be resolved automatically during the next data sync.
                </p>
                <a
                  href={acrisBblSearchUrl(doc.bbl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors mt-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Search BBL in ACRIS
                </a>
              </div>
            )}

            {previewState === 'rate_limited' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-amber-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">Cooling down</p>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  Preview requests are limited to once every 5 seconds to respect ACRIS rate limits.
                </p>
                <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(0, 100 - (retryAfterMs / 5000) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  {Math.ceil(retryAfterMs / 1000)}s remaining
                </p>
              </div>
            )}

            {previewState === 'unavailable' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <FileText className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">Preview not available</p>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  The document image could not be retrieved from ACRIS. You can view it directly on the ACRIS portal.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={loadDocument}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  {imageUrl && (
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in ACRIS
                    </a>
                  )}
                </div>
              </div>
            )}

            {previewState === 'failed' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">Preview unavailable</p>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  The ACRIS portal is not responding or has blocked the preview. You can still view the document directly.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={loadDocument}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  {imageUrl && (
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in New Tab
                    </a>
                  )}
                </div>
              </div>
            )}

            {previewState === 'loaded' && docPayload && (
              <AcrisDocViewer
                data={docPayload.data}
                contentType={docPayload.contentType}
                documentId={doc.document_id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={`text-sm mt-0.5 ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
        {value}
      </dd>
    </div>
  );
}
