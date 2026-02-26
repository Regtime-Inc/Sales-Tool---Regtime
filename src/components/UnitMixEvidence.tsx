import { useState } from 'react';
import { ChevronDown, ChevronRight, FileSearch, Eye } from 'lucide-react';
import type { UnitRecord } from '../types/pdf';

interface UnitMixEvidenceProps {
  records: UnitRecord[];
}

interface PageGroup {
  page: number;
  method: string;
  records: UnitRecord[];
}

export default function UnitMixEvidence({ records }: UnitMixEvidenceProps) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  if (records.length === 0) return null;

  const grouped = records.reduce<Map<number, PageGroup>>((acc, rec) => {
    const page = rec.source.page;
    if (!acc.has(page)) {
      acc.set(page, { page, method: rec.source.method, records: [] });
    }
    acc.get(page)!.records.push(rec);
    return acc;
  }, new Map());

  const pageGroups = Array.from(grouped.values()).sort((a, b) => a.page - b.page);

  const togglePage = (page: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const methodBadge = (method: string) => {
    const styles: Record<string, string> = {
      TEXT_TABLE: 'bg-emerald-100 text-emerald-700',
      TEXT_REGEX: 'bg-sky-100 text-sky-700',
      OCR: 'bg-amber-100 text-amber-700',
    };
    return (
      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${styles[method] || 'bg-slate-100 text-slate-600'}`}>
        {method.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-50">
        <FileSearch className="h-4 w-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-700">Extraction Evidence</h4>
        <span className="text-[10px] text-slate-400 ml-auto">
          {records.length} records from {pageGroups.length} page{pageGroups.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-slate-50">
        {pageGroups.map((group) => {
          const isOpen = expandedPages.has(group.page);
          const uniqueEvidence = new Set(group.records.map((r) => r.source.evidence));

          return (
            <div key={group.page}>
              <button
                onClick={() => togglePage(group.page)}
                className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                )}
                <Eye className="h-3 w-3 text-slate-300" />
                <span className="text-xs font-medium text-slate-600">
                  Page {group.page}
                </span>
                {methodBadge(group.method)}
                <span className="text-[10px] text-slate-400 ml-auto">
                  {group.records.length} unit{group.records.length !== 1 ? 's' : ''}
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 ml-5 space-y-1.5">
                  {Array.from(uniqueEvidence).map((ev, i) => (
                    <div
                      key={i}
                      className="bg-slate-50 rounded-lg px-3 py-2 text-[11px] text-slate-500 font-mono leading-relaxed break-all"
                    >
                      {ev}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
