import { ArrowUpRight, ArrowUp, ArrowDown, ArrowUpDown, Download, ExternalLink, Eye } from 'lucide-react';
import type { AcrisDocument, AcrisDocsSortableColumn, AcrisSortDirection } from '../types/acris';
import { docTypeCategory } from '../lib/acris/docTypes';
import { boroughName, formatBbl, formatCurrency, formatDate, acrisPortalUrl, acrisBblSearchUrl, isRealAcrisDocId } from '../lib/acris/utils';

interface AcrisDocsTableProps {
  documents: AcrisDocument[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: AcrisDocsSortableColumn;
  sortDir: AcrisSortDirection;
  onSortChange: (col: AcrisDocsSortableColumn, dir: AcrisSortDirection) => void;
  onPageChange: (page: number) => void;
  onAnalyze: (bbl: string) => void;
  onPreview: (doc: AcrisDocument) => void;
}

const DOC_CATEGORY_STYLES: Record<string, string> = {
  deed: 'bg-teal-50 text-teal-700',
  mortgage: 'bg-amber-50 text-amber-700',
  regulatory: 'bg-slate-100 text-slate-600',
  unknown: 'bg-slate-50 text-slate-500',
};

function SortHeader({
  label,
  column,
  currentSort,
  currentDir,
  onSort,
  className = '',
}: {
  label: string;
  column: AcrisDocsSortableColumn;
  currentSort: AcrisDocsSortableColumn;
  currentDir: AcrisSortDirection;
  onSort: (col: AcrisDocsSortableColumn, dir: AcrisSortDirection) => void;
  className?: string;
}) {
  const active = currentSort === column;

  function handleClick() {
    if (active) {
      onSort(column, currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(column, column === 'recorded_date' ? 'desc' : 'asc');
    }
  }

  const Icon = active ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={`px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 transition-colors ${className}`}>
      <button onClick={handleClick} className="inline-flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 ${active ? 'text-teal-600' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}

function exportCsv(documents: AcrisDocument[]) {
  const headers = ['Recorded Date', 'Doc Type', 'Category', 'BBL', 'Borough', 'Party 1', 'Party 2', 'Amount', 'Document ID', 'CRFN'];
  const rows = documents.map((d) => [
    d.recorded_date,
    d.doc_type,
    docTypeCategory(d.doc_type),
    d.bbl,
    boroughName(d.borough),
    `"${(d.party1 || '').replace(/"/g, '""')}"`,
    `"${(d.party2 || '').replace(/"/g, '""')}"`,
    d.amount ?? '',
    d.document_id,
    d.crfn ?? '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acris_docs_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AcrisDocsTable({
  documents,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  onAnalyze,
  onPreview,
}: AcrisDocsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-400">No documents match your filters. Adjust the date range or other criteria.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <SortHeader label="Date" column="recorded_date" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="Type" column="doc_type" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="BBL" column="bbl" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="Borough" column="borough" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="Party 1 (Grantor)" column="party1" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="Party 2 (Grantee)" column="party2" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} />
              <SortHeader label="Amount" column="amount" currentSort={sortBy} currentDir={sortDir} onSort={onSortChange} className="text-right" />
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, i) => {
              const cat = docTypeCategory(doc.doc_type);
              return (
                <tr
                  key={doc.document_id + '_' + doc.bbl + '_' + i}
                  className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{formatDate(doc.recorded_date)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${DOC_CATEGORY_STYLES[cat]}`}>
                      {doc.doc_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{formatBbl(doc.bbl)}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{boroughName(doc.borough)}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={doc.party1 || ''}>{doc.party1 || '--'}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={doc.party2 || ''}>{doc.party2 || '--'}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700 whitespace-nowrap">{formatCurrency(doc.amount)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onPreview(doc)}
                        title="Preview document"
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={isRealAcrisDocId(doc.document_id) ? acrisPortalUrl(doc.document_id) : acrisBblSearchUrl(doc.bbl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isRealAcrisDocId(doc.document_id) ? 'Open in ACRIS' : 'Search BBL in ACRIS (CRFN only)'}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-sky-600 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => onAnalyze(doc.bbl)}
                        title="Analyze this BBL"
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 rounded hover:bg-teal-100 transition-colors"
                      >
                        Analyze <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/30">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Showing {startIdx}–{endIdx} of {total.toLocaleString()} documents
          </span>
          <button
            onClick={() => exportCsv(documents)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
