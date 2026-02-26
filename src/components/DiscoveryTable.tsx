import { useState, useMemo } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Download, Check, Filter } from 'lucide-react';
import type { DiscoveryResponse, DiscoveryCandidate, SortSpec, SortableColumn } from '../types/discovery';
import { getBldgClassName } from '../lib/discovery/buildingClasses';

interface DiscoveryTableProps {
  response: DiscoveryResponse;
  onAnalyze: (bbl: string) => void;
  onPageChange: (page: number) => void;
  sorts: SortSpec[];
  onSortChange: (sorts: SortSpec[]) => void;
}

function formatBbl(raw: string): string {
  const digits = raw.replace(/\D/g, '').padStart(10, '0').slice(-10);
  return `${digits[0]}-${digits.slice(1, 6)}-${digits.slice(6, 10)}`;
}

function cleanBbl(raw: string): string {
  return raw.replace(/\..*$/, '').replace(/\D/g, '').padStart(10, '0').slice(-10);
}

function formatSalePrice(price: number | null): string {
  if (!price || price <= 0) return '';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

function formatPpbsf(value: number | null): string {
  if (value == null || value <= 0) return '';
  return `$${Math.round(value).toLocaleString()}`;
}

const PROGRAM_COLORS: Record<string, string> = {
  'MIH': 'bg-sky-50 text-sky-700 border-sky-200',
  'UAP': 'bg-teal-50 text-teal-700 border-teal-200',
  '485-x': 'bg-amber-50 text-amber-700 border-amber-200',
  '421-a': 'bg-slate-50 text-slate-500 border-slate-200',
  '467-m': 'bg-rose-50 text-rose-700 border-rose-200',
};

function classifyScore(score: number): { label: string; color: string } {
  if (score >= 76) return { label: 'Very High', color: 'bg-emerald-100 text-emerald-700' };
  if (score >= 51) return { label: 'High', color: 'bg-teal-100 text-teal-700' };
  if (score >= 26) return { label: 'Moderate', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Low', color: 'bg-slate-100 text-slate-600' };
}

function ScoreBadge({ score }: { score: number }) {
  const { label, color } = classifyScore(score);
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color}`} title={`${label} (${Math.round(score)}/130)`}>
      {Math.round(score)}
    </span>
  );
}

function DataBar({ value }: { value: number }) {
  let color = 'bg-slate-300';
  if (value >= 80) color = 'bg-emerald-400';
  else if (value >= 60) color = 'bg-teal-400';
  else if (value >= 40) color = 'bg-amber-400';
  else if (value >= 20) color = 'bg-orange-400';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[9px] text-slate-400">{value}</span>
    </div>
  );
}

const PROGRAM_SLICER_OPTIONS = [
  { value: 'MIH', color: 'bg-sky-50 text-sky-700 border-sky-300 ring-sky-200' },
  { value: 'UAP', color: 'bg-teal-50 text-teal-700 border-teal-300 ring-teal-200' },
  { value: '485-x', color: 'bg-amber-50 text-amber-700 border-amber-300 ring-amber-200' },
  { value: '467-m', color: 'bg-rose-50 text-rose-700 border-rose-300 ring-rose-200' },
];

type ClientSortDir = 'asc' | 'desc' | null;

function ProgramPills({ flags }: { flags: Array<{ program: string; eligible: boolean; note?: string }> }) {
  const eligible = flags.filter((f) => f.eligible);
  if (eligible.length === 0) return <span className="text-slate-300 text-[10px]">--</span>;
  return (
    <div className="flex flex-wrap gap-0.5">
      {eligible.map((f) => (
        <span
          key={f.program}
          title={f.note || undefined}
          className={`text-[8px] font-semibold px-1 py-px rounded border cursor-default ${PROGRAM_COLORS[f.program] || 'bg-slate-50 text-slate-500 border-slate-200'}`}
        >
          {f.program}
        </span>
      ))}
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  column: SortableColumn;
  sorts: SortSpec[];
  onSort: (column: SortableColumn, shift: boolean) => void;
  align?: 'left' | 'right';
}

function SortHeader({ label, column, sorts, onSort, align = 'left' }: SortHeaderProps) {
  const idx = sorts.findIndex((s) => s.column === column);
  const active = idx >= 0;
  const dir = active ? sorts[idx].direction : null;

  return (
    <th
      className={`py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px] cursor-pointer select-none hover:text-slate-700 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={(e) => onSort(column, e.shiftKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {!active && <ArrowUpDown className="h-2.5 w-2.5 text-slate-300" />}
        {active && dir === 'asc' && <ArrowUp className="h-2.5 w-2.5 text-teal-600" />}
        {active && dir === 'desc' && <ArrowDown className="h-2.5 w-2.5 text-teal-600" />}
        {active && idx > 0 && (
          <span className="text-[8px] text-teal-500 font-bold">{idx + 1}</span>
        )}
      </span>
    </th>
  );
}

function exportCsv(candidates: DiscoveryCandidate[]) {
  const headers = [
    'BBL', 'Address', 'Borough', 'Zone', 'Lot SF', 'Bldg SF', 'Slack SF',
    'UB Ratio %', 'Resid FAR', 'Built FAR', 'Score', 'Potential Units',
    'Programs', 'Data Score', 'Last Sale Date', 'Last Sale Price', 'PPBSF', 'Sale Source',
    'Owner', 'Bldg Class', 'Year Built', 'Units Res',
  ];

  const rows = candidates.map((c) => [
    c.bbl,
    `"${(c.address || '').replace(/"/g, '""')}"`,
    c.borough,
    c.zoneDist,
    c.lotArea,
    c.bldgArea,
    c.slackSF,
    c.underbuiltRatio.toFixed(1),
    c.residFar,
    c.builtFar,
    c.score.toFixed(1),
    c.potentialUnits,
    `"${c.programFlags.filter((f) => f.eligible).map((f) => f.program).join(', ')}"`,
    c.dataCompleteness,
    c.lastSaleDate || '',
    c.lastSalePrice || '',
    c.ppbsf ?? '',
    c.lastSaleSource || '',
    `"${(c.ownerName || '').replace(/"/g, '""')}"`,
    c.bldgClass,
    c.yearBuilt || '',
    c.unitsRes,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `discovery_export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DiscoveryTable({ response, onAnalyze, onPageChange, sorts, onSortChange }: DiscoveryTableProps) {
  const { candidates, total, page, pageSize } = response;
  const totalPages = Math.ceil(total / pageSize);

  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [unitsSortDir, setUnitsSortDir] = useState<ClientSortDir>(null);

  const filteredCandidates = useMemo(() => {
    let result = candidates;
    if (selectedPrograms.length > 0) {
      result = result.filter((c) =>
        (c.programFlags || []).some(
          (f) => f.eligible && selectedPrograms.includes(f.program)
        )
      );
    }
    if (unitsSortDir) {
      result = [...result].sort((a, b) =>
        unitsSortDir === 'asc'
          ? a.potentialUnits - b.potentialUnits
          : b.potentialUnits - a.potentialUnits
      );
    }
    return result;
  }, [candidates, selectedPrograms, unitsSortDir]);

  const isClientFiltered = selectedPrograms.length > 0;
  const displayTotal = isClientFiltered ? filteredCandidates.length : total;
  const start = isClientFiltered ? (filteredCandidates.length > 0 ? 1 : 0) : (page - 1) * pageSize + 1;
  const end = isClientFiltered ? filteredCandidates.length : Math.min(page * pageSize, total);

  function toggleProgram(prog: string) {
    setSelectedPrograms((prev) =>
      prev.includes(prog) ? prev.filter((p) => p !== prog) : [...prev, prog]
    );
  }

  function cycleUnitsSort() {
    setUnitsSortDir((prev) => {
      if (prev === null) return 'desc';
      if (prev === 'desc') return 'asc';
      return null;
    });
  }

  function handleSort(column: SortableColumn, shift: boolean) {
    const existing = sorts.findIndex((s) => s.column === column);

    if (shift) {
      if (existing >= 0) {
        const updated = [...sorts];
        updated[existing] = {
          column,
          direction: updated[existing].direction === 'desc' ? 'asc' : 'desc',
        };
        onSortChange(updated);
      } else {
        onSortChange([...sorts.slice(0, 1), { column, direction: 'desc' }]);
      }
    } else {
      if (existing >= 0) {
        const current = sorts[existing].direction;
        onSortChange([{ column, direction: current === 'desc' ? 'asc' : 'desc' }]);
      } else {
        onSortChange([{ column, direction: 'desc' }]);
      }
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
        <p className="text-sm text-slate-400">No candidates match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold shrink-0">Programs</span>
        <div className="flex flex-wrap gap-1.5">
          {PROGRAM_SLICER_OPTIONS.map((prog) => {
            const active = selectedPrograms.includes(prog.value);
            return (
              <button
                key={prog.value}
                type="button"
                onClick={() => toggleProgram(prog.value)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition-all ${
                  active
                    ? `${prog.color} ring-1`
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                {active && <Check className="h-2.5 w-2.5" />}
                {prog.value}
              </button>
            );
          })}
        </div>
        {selectedPrograms.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedPrograms([])}
            className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1 transition-colors"
          >
            Clear
          </button>
        )}
        {isClientFiltered && (
          <span className="text-[10px] text-slate-400 ml-auto">
            {filteredCandidates.length} of {candidates.length} on page
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <SortHeader label="Score" column="score" sorts={sorts} onSort={handleSort} />
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">BBL</th>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Address</th>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Zone</th>
              <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Class</th>
              <SortHeader label="Lot SF" column="lot_area" sorts={sorts} onSort={handleSort} align="right" />
              <SortHeader label="Slack SF" column="slack_sf" sorts={sorts} onSort={handleSort} align="right" />
              <SortHeader label="UB %" column="underbuilt_ratio" sorts={sorts} onSort={handleSort} align="right" />
              <SortHeader label="FAR" column="resid_far" sorts={sorts} onSort={handleSort} align="right" />
              <th
                className="text-center py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px] cursor-pointer select-none hover:text-slate-700 transition-colors"
                onClick={cycleUnitsSort}
              >
                <span className="inline-flex items-center gap-0.5">
                  Units
                  {unitsSortDir === null && <ArrowUpDown className="h-2.5 w-2.5 text-slate-300" />}
                  {unitsSortDir === 'asc' && <ArrowUp className="h-2.5 w-2.5 text-teal-600" />}
                  {unitsSortDir === 'desc' && <ArrowDown className="h-2.5 w-2.5 text-teal-600" />}
                </span>
              </th>
              <th className="text-center py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Programs</th>
              <SortHeader label="Data" column="data_completeness" sorts={sorts} onSort={handleSort} align="right" />
              <SortHeader label="$/BSF" column="ppbsf" sorts={sorts} onSort={handleSort} align="right" />
              <SortHeader label="Last Sale" column="last_sale_date" sorts={sorts} onSort={handleSort} align="right" />
              <th className="text-center py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]"></th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((c, i) => (
              <tr
                key={c.bbl}
                className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-25'
                }`}
              >
                <td className="py-2 px-3"><ScoreBadge score={c.score} /></td>
                <td className="py-2 px-3 font-mono text-slate-600 text-[10px]">{formatBbl(c.bbl)}</td>
                <td className="py-2 px-3 text-slate-700 max-w-[160px] truncate">{c.address || '-'}</td>
                <td className="py-2 px-3 text-slate-500">{c.zoneDist}</td>
                <td className="py-2 px-3 text-slate-500 text-[10px] font-mono" title={getBldgClassName(c.bldgClass)}>{c.bldgClass || '-'}</td>
                <td className="py-2 px-3 text-right text-slate-600">{c.lotArea.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-medium text-teal-700">{c.slackSF.toLocaleString()}</td>
                <td className="py-2 px-3 text-right text-slate-600">{c.underbuiltRatio.toFixed(0)}%</td>
                <td className="py-2 px-3 text-right text-slate-600">{c.residFar}</td>
                <td className="py-2 px-3 text-center">
                  {c.potentialUnits > 0 ? (
                    <span className="text-[10px] font-semibold text-slate-700">{c.potentialUnits}</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <ProgramPills flags={c.programFlags || []} />
                </td>
                <td className="py-2 px-3">
                  <DataBar value={c.dataCompleteness || 0} />
                </td>
                <td className="py-2 px-3 text-right text-[10px] font-medium text-slate-600">
                  {formatPpbsf(c.ppbsf)}
                </td>
                <td className="py-2 px-3 text-right text-[10px]">
                  {c.lastSaleDate ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-600">
                        {c.lastSaleDate}
                        {c.lastSalePrice ? ` / ${formatSalePrice(c.lastSalePrice)}` : ''}
                      </span>
                      {c.lastSaleSource && (
                        <span className={`px-1 py-px rounded text-[8px] font-medium uppercase tracking-wider ${
                          c.lastSaleSource === 'acris_realtime'
                            ? 'bg-teal-50 text-teal-600'
                            : c.lastSaleSource === 'acris'
                              ? 'bg-sky-50 text-sky-600'
                              : 'bg-slate-100 text-slate-500'
                        }`}>
                          {c.lastSaleSource === 'acris_realtime' ? 'ACRIS Live' : c.lastSaleSource === 'acris' ? 'ACRIS' : 'DOF'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => onAnalyze(cleanBbl(c.bbl))}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                  >
                    Analyze <ArrowUpRight className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-slate-400">
            {isClientFiltered ? (
              <>{displayTotal} matching of {total} total</>
            ) : (
              <>Showing {start}-{end} of {displayTotal} candidates</>
            )}
            {response.cached && response.cachedAt && (
              <span className="ml-2 text-slate-300">
                (cached {new Date(response.cachedAt).toLocaleTimeString()})
              </span>
            )}
          </p>
          <button
            onClick={() => exportCsv(filteredCandidates)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-500 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 rounded-md transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="text-[11px] text-slate-500 px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
