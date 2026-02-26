import { useState, useMemo, useCallback } from 'react';
import { Pencil, Check, X, Download } from 'lucide-react';
import type { UnitRecord, BedroomType, AllocationKind, UnitMixTotals } from '../types/pdf';

interface UnitMixReviewTableProps {
  records: UnitRecord[];
  onRecordsChange: (records: UnitRecord[]) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

const BED_OPTIONS: BedroomType[] = ['STUDIO', '1BR', '2BR', '3BR', '4BR_PLUS', 'UNKNOWN'];
const ALLOC_OPTIONS: AllocationKind[] = ['MARKET', 'AFFORDABLE', 'MIH_RESTRICTED', 'UNKNOWN'];
const BED_LABELS: Record<string, string> = {
  STUDIO: 'Studio', '1BR': '1BR', '2BR': '2BR', '3BR': '3BR', '4BR_PLUS': '4+BR', UNKNOWN: '?',
};
const ALLOC_LABELS: Record<string, string> = {
  MARKET: 'Market', AFFORDABLE: 'Affordable', MIH_RESTRICTED: 'MIH', UNKNOWN: '?',
};

function computeLiveTotals(records: UnitRecord[]): UnitMixTotals {
  const byBed: Record<string, number> = {};
  const byAlloc: Record<string, number> = {};
  const byCross: Record<string, Record<string, number>> = {};
  const byAmi: Record<string, number> = {};

  for (const r of records) {
    byBed[r.bedroomType] = (byBed[r.bedroomType] || 0) + 1;
    byAlloc[r.allocation] = (byAlloc[r.allocation] || 0) + 1;
    if (!byCross[r.allocation]) byCross[r.allocation] = {};
    byCross[r.allocation][r.bedroomType] = (byCross[r.allocation][r.bedroomType] || 0) + 1;
    if (r.amiBand !== undefined) {
      const key = `${r.amiBand}%`;
      byAmi[key] = (byAmi[key] || 0) + 1;
    }
  }

  return {
    totalUnits: records.length,
    byBedroomType: byBed,
    byAllocation: byAlloc,
    byAllocationAndBedroom: byCross,
    byAmiBand: Object.keys(byAmi).length > 0 ? byAmi : undefined,
  };
}

export default function UnitMixReviewTable({
  records,
  onRecordsChange,
  onExportJson,
  onExportCsv,
}: UnitMixReviewTableProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBed, setEditBed] = useState<BedroomType>('UNKNOWN');
  const [editAlloc, setEditAlloc] = useState<AllocationKind>('UNKNOWN');
  const [editAmi, setEditAmi] = useState<string>('');

  const _totals = useMemo(() => computeLiveTotals(records), [records]);

  const startEdit = useCallback((idx: number) => {
    const r = records[idx];
    setEditBed(r.bedroomType);
    setEditAlloc(r.allocation);
    setEditAmi(r.amiBand !== undefined ? String(r.amiBand) : '');
    setEditingIndex(idx);
  }, [records]);

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    const updated = [...records];
    updated[editingIndex] = {
      ...updated[editingIndex],
      bedroomType: editBed,
      allocation: editAlloc,
      amiBand: editAmi ? parseInt(editAmi, 10) : undefined,
    };
    onRecordsChange(updated);
    setEditingIndex(null);
  }, [editingIndex, editBed, editAlloc, editAmi, records, onRecordsChange]);

  const cancelEdit = useCallback(() => setEditingIndex(null), []);

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const pageRecords = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(records.length / PAGE_SIZE);

  if (records.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-700">Review & Edit Units</h4>
          <span className="text-[10px] text-slate-400">
            {_totals.totalUnits} total
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onExportJson}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-teal-600 bg-slate-50 hover:bg-teal-50 px-2 py-1 rounded-md transition-colors"
          >
            <Download className="h-3 w-3" /> JSON
          </button>
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-teal-600 bg-slate-50 hover:bg-teal-50 px-2 py-1 rounded-md transition-colors"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
              <th className="text-left py-2 px-3 font-medium w-8">#</th>
              <th className="text-left py-2 px-2 font-medium">Unit ID</th>
              <th className="text-left py-2 px-2 font-medium">Bed Type</th>
              <th className="text-left py-2 px-2 font-medium">Allocation</th>
              <th className="text-left py-2 px-2 font-medium">AMI</th>
              <th className="text-left py-2 px-2 font-medium">Source</th>
              <th className="text-right py-2 px-3 font-medium w-12" />
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((r, i) => {
              const globalIdx = page * PAGE_SIZE + i;
              const isEditing = editingIndex === globalIdx;

              return (
                <tr
                  key={globalIdx}
                  className={`border-b border-slate-50 ${isEditing ? 'bg-teal-50/30' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="py-1.5 px-3 text-slate-300">{globalIdx + 1}</td>
                  <td className="py-1.5 px-2 text-slate-600 font-mono text-[11px]">
                    {r.unitId || '-'}
                  </td>
                  <td className="py-1.5 px-2">
                    {isEditing ? (
                      <select
                        value={editBed}
                        onChange={(e) => setEditBed(e.target.value as BedroomType)}
                        className="border border-slate-200 rounded px-1 py-0.5 text-[11px] focus:ring-1 focus:ring-teal-400 focus:outline-none"
                      >
                        {BED_OPTIONS.map((b) => (
                          <option key={b} value={b}>{BED_LABELS[b]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] font-medium ${r.bedroomType === 'UNKNOWN' ? 'text-amber-500' : 'text-slate-700'}`}>
                        {BED_LABELS[r.bedroomType]}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {isEditing ? (
                      <select
                        value={editAlloc}
                        onChange={(e) => setEditAlloc(e.target.value as AllocationKind)}
                        className="border border-slate-200 rounded px-1 py-0.5 text-[11px] focus:ring-1 focus:ring-teal-400 focus:outline-none"
                      >
                        {ALLOC_OPTIONS.map((a) => (
                          <option key={a} value={a}>{ALLOC_LABELS[a]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] ${r.allocation === 'UNKNOWN' ? 'text-amber-500' : 'text-slate-600'}`}>
                        {ALLOC_LABELS[r.allocation]}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editAmi}
                        onChange={(e) => setEditAmi(e.target.value)}
                        placeholder="-"
                        className="w-14 border border-slate-200 rounded px-1 py-0.5 text-[11px] focus:ring-1 focus:ring-teal-400 focus:outline-none"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {r.amiBand ? `${r.amiBand}%` : '-'}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="text-[10px] text-slate-400">
                      p.{r.source.page} {r.source.method === 'TEXT_TABLE' ? 'tbl' : r.source.method === 'OCR' ? 'ocr' : 'txt'}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={saveEdit}
                          className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-0.5 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(globalIdx)}
                        className="p-0.5 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-50 bg-slate-50/50">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-[10px] text-slate-500 disabled:text-slate-300 hover:text-teal-600 transition-colors"
          >
            Previous
          </button>
          <span className="text-[10px] text-slate-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-[10px] text-slate-500 disabled:text-slate-300 hover:text-teal-600 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
