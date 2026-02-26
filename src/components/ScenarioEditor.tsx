import { useState, useCallback } from 'react';
import { Plus, Trash2, Play, FileDown } from 'lucide-react';
import type { UnitAllocation, RentAssumption } from '../types/optimizer';

const UNIT_TYPES = ['Studio', '1BR', '2BR', '3BR'];
const AMI_BANDS = [0, 30, 40, 50, 60, 70, 80, 100, 130, 165];

const DEFAULT_SF: Record<string, number> = {
  Studio: 475,
  '1BR': 650,
  '2BR': 900,
  '3BR': 1200,
};

interface AllocationRow {
  id: string;
  unitType: string;
  amiBand: number;
  count: number;
  avgSF: number;
}

interface ScenarioEditorProps {
  rentAssumptions: RentAssumption[];
  onEvaluate: (allocations: UnitAllocation[]) => void;
  onImportFromPlans?: () => void;
  hasExtractedData: boolean;
}

function lookupRent(rents: RentAssumption[], unitType: string, amiBand: number): number {
  const exact = rents.find((r) => r.unitType === unitType && r.amiBand === amiBand);
  if (exact) return exact.monthlyRent;
  const sameType = rents.filter((r) => r.unitType === unitType);
  if (sameType.length === 0) return 2000;
  let closest = sameType[0];
  for (const r of sameType) {
    if (Math.abs(r.amiBand - amiBand) < Math.abs(closest.amiBand - amiBand)) closest = r;
  }
  return closest.monthlyRent;
}

export default function ScenarioEditor({
  rentAssumptions,
  onEvaluate,
  onImportFromPlans,
  hasExtractedData,
}: ScenarioEditorProps) {
  const [rows, setRows] = useState<AllocationRow[]>([
    { id: crypto.randomUUID(), unitType: 'Studio', amiBand: 0, count: 0, avgSF: DEFAULT_SF.Studio },
    { id: crypto.randomUUID(), unitType: '1BR', amiBand: 0, count: 0, avgSF: DEFAULT_SF['1BR'] },
    { id: crypto.randomUUID(), unitType: '2BR', amiBand: 0, count: 0, avgSF: DEFAULT_SF['2BR'] },
    { id: crypto.randomUUID(), unitType: '3BR', amiBand: 0, count: 0, avgSF: DEFAULT_SF['3BR'] },
  ]);

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), unitType: '1BR', amiBand: 0, count: 0, avgSF: DEFAULT_SF['1BR'] },
    ]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRow = useCallback((id: string, field: keyof AllocationRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'unitType' && typeof value === 'string') {
          updated.avgSF = DEFAULT_SF[value] ?? 650;
        }
        return updated;
      }),
    );
  }, []);

  const totalUnits = rows.reduce((s, r) => s + r.count, 0);
  const totalSF = rows.reduce((s, r) => s + r.count * r.avgSF, 0);

  const handleEvaluate = useCallback(() => {
    const allocations: UnitAllocation[] = rows
      .filter((r) => r.count > 0)
      .map((r) => ({
        unitType: r.unitType,
        amiBand: r.amiBand,
        count: r.count,
        avgSF: r.avgSF,
        totalSF: r.count * r.avgSF,
        monthlyRent: lookupRent(rentAssumptions, r.unitType, r.amiBand),
      }));
    onEvaluate(allocations);
  }, [rows, rentAssumptions, onEvaluate]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Unit Allocations
        </p>
        <div className="flex items-center gap-2">
          {hasExtractedData && onImportFromPlans && (
            <button
              onClick={onImportFromPlans}
              className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 font-medium transition-colors"
            >
              <FileDown className="h-3 w-3" />
              Import from Plans
            </button>
          )}
        </div>
      </div>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
              <th className="text-left py-2 px-2.5 font-medium">Type</th>
              <th className="text-left py-2 px-2.5 font-medium">AMI Band</th>
              <th className="text-right py-2 px-2.5 font-medium">Units</th>
              <th className="text-right py-2 px-2.5 font-medium">Avg SF</th>
              <th className="text-right py-2 px-2.5 font-medium">Total SF</th>
              <th className="text-right py-2 px-2.5 font-medium">Est. Rent</th>
              <th className="w-8 py-2 px-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rent = lookupRent(rentAssumptions, row.unitType, row.amiBand);
              return (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-1.5 px-2.5">
                    <select
                      value={row.unitType}
                      onChange={(e) => updateRow(row.id, 'unitType', e.target.value)}
                      className="bg-transparent text-slate-700 text-xs focus:outline-none cursor-pointer"
                    >
                      {UNIT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-2.5">
                    <select
                      value={row.amiBand}
                      onChange={(e) => updateRow(row.id, 'amiBand', Number(e.target.value))}
                      className="bg-transparent text-slate-700 text-xs focus:outline-none cursor-pointer"
                    >
                      {AMI_BANDS.map((b) => (
                        <option key={b} value={b}>{b === 0 ? 'Market' : `${b}% AMI`}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-2.5">
                    <input
                      type="number"
                      min={0}
                      value={row.count}
                      onChange={(e) => updateRow(row.id, 'count', Math.max(0, Number(e.target.value)))}
                      className="w-14 text-right px-1 py-0.5 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </td>
                  <td className="py-1.5 px-2.5">
                    <input
                      type="number"
                      min={100}
                      value={row.avgSF}
                      onChange={(e) => updateRow(row.id, 'avgSF', Math.max(100, Number(e.target.value)))}
                      className="w-16 text-right px-1 py-0.5 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </td>
                  <td className="py-1.5 px-2.5 text-right text-slate-600">
                    {(row.count * row.avgSF).toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2.5 text-right text-slate-600">
                    ${rent.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-1">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="p-0.5 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="h-3 w-3 text-slate-300 hover:text-red-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50/50 border-t border-slate-200">
              <td className="py-2 px-2.5 font-semibold text-slate-700" colSpan={2}>
                Total
              </td>
              <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                {totalUnits}
              </td>
              <td className="py-2 px-2.5 text-right text-slate-400">--</td>
              <td className="py-2 px-2.5 text-right font-semibold text-slate-700">
                {totalSF.toLocaleString()}
              </td>
              <td className="py-2 px-2.5" />
              <td className="py-2 px-1" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={addRow}
          className="flex items-center gap-1 text-[10px] text-cyan-600 hover:text-cyan-700 font-medium transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Row
        </button>
        <button
          onClick={handleEvaluate}
          disabled={totalUnits === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Play className="h-3 w-3" />
          Evaluate Scenario
        </button>
      </div>
    </div>
  );
}
