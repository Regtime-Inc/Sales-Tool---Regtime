import { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Pencil,
  Layers,
} from 'lucide-react';
import type { AppliedOverrides, AssemblageConfig } from '../types/pdf';
import type { PlutoData } from '../types/analysis';
import AssemblagePanel from './AssemblagePanel';

interface CapacityOverridesEditorProps {
  pluto: PlutoData;
  overrides: AppliedOverrides | null;
  onOverridesChange: (overrides: AppliedOverrides | null) => void;
  bbl: string;
}

interface FieldDef {
  key: keyof AppliedOverrides;
  label: string;
  plutoKey: keyof PlutoData;
  suffix: string;
  format: (v: number) => string;
}

const FIELDS: FieldDef[] = [
  { key: 'lotArea', label: 'Lot Area', plutoKey: 'lotarea', suffix: 'SF', format: (v) => v.toLocaleString() },
  { key: 'residFar', label: 'Residential FAR', plutoKey: 'residfar', suffix: '', format: (v) => v.toString() },
  { key: 'commFar', label: 'Commercial FAR', plutoKey: 'commfar', suffix: '', format: (v) => v.toString() },
  { key: 'facilFar', label: 'Facility FAR', plutoKey: 'facilfar', suffix: '', format: (v) => v.toString() },
  { key: 'existingBldgArea', label: 'Existing Bldg Area', plutoKey: 'bldgarea', suffix: 'SF', format: (v) => v.toLocaleString() },
];

function sourceLabel(
  key: string,
  overrides: AppliedOverrides | null,
  hasAssemblage: boolean
): string {
  if (overrides?.[key as keyof AppliedOverrides] != null) return 'Manual';
  if (hasAssemblage) return 'Assemblage';
  return 'PLUTO';
}

function sourceBadgeColor(source: string): string {
  if (source === 'Manual') return 'bg-amber-50 text-amber-700';
  if (source === 'Assemblage') return 'bg-teal-50 text-teal-700';
  return 'bg-slate-50 text-slate-500';
}

export default function CapacityOverridesEditor({
  pluto,
  overrides,
  onOverridesChange,
  bbl,
}: CapacityOverridesEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [zoneDist, setZoneDist] = useState(overrides?.zoneDist ?? '');
  const [editingZone, setEditingZone] = useState(false);

  const hasAssemblage = overrides?.assemblage != null;
  const assemblage = overrides?.assemblage ?? null;

  const hasAnyOverride =
    overrides != null &&
    Object.entries(overrides).some(
      ([k, v]) => k !== 'assemblage' && v != null
    );

  const startEdit = (key: string, currentValue: number) => {
    setEditingField(key);
    setEditValue(String(currentValue));
  };

  const commitEdit = (key: keyof AppliedOverrides) => {
    const num = parseFloat(editValue);
    if (!isNaN(num) && num >= 0) {
      const next = { ...(overrides ?? {}), [key]: num };
      onOverridesChange(next);
    }
    setEditingField(null);
  };

  const resetField = (key: keyof AppliedOverrides) => {
    if (!overrides) return;
    const next = { ...overrides };
    delete next[key];
    const remaining = Object.entries(next).filter(
      ([k, v]) => k !== 'assemblage' && v != null
    );
    onOverridesChange(remaining.length > 0 || next.assemblage ? next : null);
  };

  const resetAll = () => {
    if (overrides?.assemblage) {
      onOverridesChange({ assemblage: overrides.assemblage });
    } else {
      onOverridesChange(null);
    }
  };

  const getDisplayValue = (field: FieldDef): number => {
    const manual = overrides?.[field.key];
    if (typeof manual === 'number') return manual;
    if (hasAssemblage && assemblage) {
      const asmMap: Record<string, number | undefined> = {
        lotArea: assemblage.totalLotArea,
        existingBldgArea: assemblage.totalExistingBldgArea,
        residFar: assemblage.effectiveResidFar,
        commFar: assemblage.effectiveCommFar,
        facilFar: assemblage.effectiveFacilFar,
      };
      if (asmMap[field.key] != null) return asmMap[field.key]!;
    }
    return pluto[field.plutoKey] as number;
  };

  const handleAssemblageChange = useCallback(
    (config: AssemblageConfig | null) => {
      const next = { ...(overrides ?? {}) };
      if (config) {
        next.assemblage = config;
      } else {
        delete next.assemblage;
      }
      const hasValues = Object.entries(next).some(
        ([k, v]) => k !== 'assemblage' && v != null
      );
      onOverridesChange(hasValues || next.assemblage ? next : null);
    },
    [overrides, onOverridesChange]
  );

  const handleZoneCommit = () => {
    setEditingZone(false);
    const trimmed = zoneDist.trim();
    if (trimmed && trimmed !== pluto.zonedist1) {
      const next = { ...(overrides ?? {}), zoneDist: trimmed };
      onOverridesChange(next);
    } else if (overrides?.zoneDist) {
      const next = { ...overrides };
      delete next.zoneDist;
      const remaining = Object.entries(next).filter(
        ([k, v]) => k !== 'assemblage' && v != null
      );
      onOverridesChange(remaining.length > 0 || next.assemblage ? next : null);
    }
  };

  const activeZone = overrides?.zoneDist || (hasAssemblage ? assemblage?.effectiveZoneDist : '') || pluto.zonedist1;
  const zoneSource = overrides?.zoneDist
    ? 'Manual'
    : hasAssemblage
      ? 'Assemblage'
      : 'PLUTO';

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <Layers className="h-4 w-4 text-slate-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">Capacity Inputs</p>
            <p className="text-[11px] text-slate-400">
              {hasAnyOverride || hasAssemblage
                ? 'Manual overrides active'
                : 'PLUTO baseline values'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAssemblage && (
            <span className="text-[10px] font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
              {assemblage!.lots.length} lots assembled
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-50 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FIELDS.map((field) => {
              const displayVal = getDisplayValue(field);
              const plutoVal = pluto[field.plutoKey] as number;
              const source = sourceLabel(field.key, overrides, hasAssemblage);
              const isEditing = editingField === field.key;

              return (
                <div
                  key={field.key}
                  className="bg-slate-50 rounded-lg px-3 py-2.5 group relative"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-slate-400 font-medium">
                      {field.label}
                    </p>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeColor(source)}`}
                      >
                        {source}
                      </span>
                      {source === 'Manual' && (
                        <button
                          onClick={() => resetField(field.key)}
                          className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                          title="Reset to baseline"
                        >
                          <RotateCcw className="h-2.5 w-2.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(field.key);
                          if (e.key === 'Escape') setEditingField(null);
                        }}
                        onBlur={() => commitEdit(field.key)}
                        autoFocus
                        className="w-full px-2 py-0.5 border border-slate-300 rounded text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                      {field.suffix && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {field.suffix}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(field.key, displayVal)}
                      className="w-full flex items-center justify-between group/btn"
                    >
                      <p className="text-sm font-semibold text-slate-700">
                        {field.format(displayVal)}
                        {field.suffix && (
                          <span className="text-[10px] text-slate-400 ml-1">
                            {field.suffix}
                          </span>
                        )}
                      </p>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {source !== 'PLUTO' && (
                    <p className="text-[9px] text-slate-400 mt-1">
                      PLUTO: {field.format(plutoVal)} {field.suffix}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="bg-slate-50 rounded-lg px-3 py-2.5 group relative">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-slate-400 font-medium">
                  Zoning District
                </p>
                <span
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeColor(zoneSource)}`}
                >
                  {zoneSource}
                </span>
              </div>

              {editingZone ? (
                <input
                  type="text"
                  value={zoneDist}
                  onChange={(e) => setZoneDist(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleZoneCommit();
                    if (e.key === 'Escape') {
                      setEditingZone(false);
                      setZoneDist(overrides?.zoneDist ?? '');
                    }
                  }}
                  onBlur={handleZoneCommit}
                  autoFocus
                  placeholder="e.g. R7A"
                  className="w-full px-2 py-0.5 border border-slate-300 rounded text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                />
              ) : (
                <button
                  onClick={() => {
                    setZoneDist(activeZone);
                    setEditingZone(true);
                  }}
                  className="w-full flex items-center justify-between group/btn"
                >
                  <p className="text-sm font-semibold text-slate-700">
                    {activeZone || '--'}
                  </p>
                  <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                </button>
              )}

              {zoneSource !== 'PLUTO' && (
                <p className="text-[9px] text-slate-400 mt-1">
                  PLUTO: {pluto.zonedist1}
                </p>
              )}
            </div>
          </div>

          {hasAnyOverride && (
            <div className="flex justify-end">
              <button
                onClick={resetAll}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset all manual overrides
              </button>
            </div>
          )}

          <AssemblagePanel
            primaryBbl={bbl}
            pluto={pluto}
            assemblage={assemblage}
            onAssemblageChange={handleAssemblageChange}
          />
        </div>
      )}
    </div>
  );
}
