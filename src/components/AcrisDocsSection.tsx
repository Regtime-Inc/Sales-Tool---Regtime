import { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronRight, ExternalLink, Eye, Download } from 'lucide-react';
import type { AcrisDocument } from '../types/acris';
import { fetchAcrisRecent } from '../lib/api';
import { docTypeCategory } from '../lib/acris/docTypes';
import { formatBbl, formatCurrency, formatDate, boroughName, acrisImageUrl, acrisPortalUrl } from '../lib/acris/utils';
import AcrisDocPreview from './AcrisDocPreview';

interface AcrisDocsSectionProps {
  bbl: string;
  onAnalyze: (bbl: string) => void;
}

const DOC_CATEGORY_STYLES: Record<string, string> = {
  deed: 'bg-teal-50 text-teal-700',
  mortgage: 'bg-amber-50 text-amber-700',
  regulatory: 'bg-slate-100 text-slate-600',
  unknown: 'bg-slate-50 text-slate-500',
};

export default function AcrisDocsSection({ bbl, onAnalyze }: AcrisDocsSectionProps) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<AcrisDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<AcrisDocument | null>(null);

  useEffect(() => {
    setDocs([]);
    setTotal(0);
    setLoaded(false);
    setOpen(false);
  }, [bbl]);

  useEffect(() => {
    if (!open || loaded || loading) return;
    setLoading(true);
    fetchAcrisRecent({ bbl, days: 90, limit: 25, sortBy: 'recorded_date', sortDir: 'desc' })
      .then((res) => {
        setDocs(res.documents);
        setTotal(res.total);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  }, [open, loaded, loading, bbl]);

  return (
    <>
      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            <FileText className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">ACRIS Documents</span>
            {loaded && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                {total}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400">BBL {formatBbl(bbl)}</span>
        </button>

        {open && (
          <div className="border-t border-slate-100">
            {loading && (
              <div className="flex items-center justify-center py-6 gap-2">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500">Loading ACRIS records...</span>
              </div>
            )}

            {loaded && docs.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-slate-400">No ACRIS documents found for this BBL in the last 90 days</p>
              </div>
            )}

            {loaded && docs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Date</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Party 1</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Party 2</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">Amount</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => {
                      const cat = docTypeCategory(doc.doc_type);
                      return (
                        <tr key={doc.document_id + '_' + i} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{formatDate(doc.recorded_date)}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${DOC_CATEGORY_STYLES[cat]}`}>
                              {doc.doc_type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-600 max-w-[140px] truncate">{doc.party1 || '--'}</td>
                          <td className="px-3 py-1.5 text-slate-600 max-w-[140px] truncate">{doc.party2 || '--'}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-slate-700">{formatCurrency(doc.amount)}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                title="Preview"
                                className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-teal-600"
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                              <a
                                href={acrisImageUrl(doc.document_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Download"
                                className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-sky-600"
                              >
                                <Download className="h-3 w-3" />
                              </a>
                              <a
                                href={acrisPortalUrl(doc.document_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in ACRIS"
                                className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-sky-600"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {total > docs.length && (
                  <div className="px-3 py-2 text-center text-[10px] text-slate-400 border-t border-slate-50">
                    Showing {docs.length} of {total} documents
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {previewDoc && (
        <AcrisDocPreview
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onAnalyze={onAnalyze}
        />
      )}
    </>
  );
}
