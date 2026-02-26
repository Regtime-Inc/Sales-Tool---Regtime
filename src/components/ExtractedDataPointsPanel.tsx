import { useState, useCallback, useMemo } from 'react';
import { ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, Sparkles, Pencil, X, Check, RotateCcw } from 'lucide-react';
import type { LlmReconciliation } from '../lib/extractionV2/types';
import type { AppliedOverrides, DataPointCategory, DataPointToggleState, UnitMixOverrides } from '../types/pdf';

interface ExtractedDataPointsProps {
  reconciliations: LlmReconciliation[];
  onApply: (overrides: AppliedOverrides) => void;
  onUnitMixApply?: (overrides: UnitMixOverrides | null) => void;
  onClear: () => void;
  appliedCount: number;
}

interface DisplayPoint {
  key: string;
  label: string;
  category: DataPointCategory;
  unit: string;
  ruleBasedValue: number | string | null;
  llmValue: number | string | null;
  finalValue: number | string | null;
  confidence: number;
  agreement: boolean | null;
  note: string;
}

const FIELD_META: Record<string, { label: string; category: DataPointCategory; unit: string }> = {
  lotArea: { label: 'Lot Area', category: 'zoning', unit: 'SF' },
  far: { label: 'FAR', category: 'zoning', unit: '' },
  maxFar: { label: 'Max FAR', category: 'zoning', unit: '' },
  zoningFloorArea: { label: 'Zoning Floor Area', category: 'zoning', unit: 'SF' },
  zone: { label: 'Zone District', category: 'zoning', unit: '' },
  floors: { label: 'Floors', category: 'building', unit: '' },
  buildingArea: { label: 'Building Area', category: 'building', unit: 'SF' },
  totalUnits: { label: 'Total Units', category: 'unit_mix', unit: '' },
  affordableUnits: { label: 'Affordable Units', category: 'unit_mix', unit: '' },
  marketUnits: { label: 'Market Units', category: 'unit_mix', unit: '' },
  studio: { label: 'Studios', category: 'unit_mix', unit: '' },
  br1: { label: '1-Bedrooms', category: 'unit_mix', unit: '' },
  br2: { label: '2-Bedrooms', category: 'unit_mix', unit: '' },
  br3: { label: '3-Bedrooms', category: 'unit_mix', unit: '' },
  br4plus: { label: '4+ Bedrooms', category: 'unit_mix', unit: '' },
};

const CATEGORY_LABELS: Record<DataPointCategory, string> = {
  zoning: 'Zoning & Land Use',
  building: 'Building',
  unit_mix: 'Unit Mix',
};

const CATEGORY_ORDER: DataPointCategory[] = ['zoning', 'building', 'unit_mix'];

const OVERRIDE_KEYS: Record<string, keyof AppliedOverrides> = {
  lotArea: 'lotArea',
  far: 'residFar',
  maxFar: 'maxFar',
  zone: 'zoneDist',
  floors: 'floors',
  buildingArea: 'buildingArea',
  totalUnits: 'totalUnits',
  zoningFloorArea: 'proposedFloorArea',
};

function buildDisplayPoints(reconciliations: LlmReconciliation[]): DisplayPoint[] {
  return reconciliations
    .filter((r) => FIELD_META[r.field])
    .map((r) => {
      const meta = FIELD_META[r.field];
      return {
        key: r.field,
        label: meta.label,
        category: meta.category,
        unit: meta.unit,
        ruleBasedValue: r.ruleBasedValue,
        llmValue: r.llmValue,
        finalValue: r.finalValue,
        confidence: r.finalConfidence,
        agreement: r.agreement,
        note: r.note,
      };
    });
}

function formatValue(v: number | string | null | undefined, unit: string): string {
  if (v == null) return '--';
  if (typeof v === 'string') return v;
  const formatted = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function AgreementBadge({ agreement }: { agreement: boolean | null }) {
  if (agreement === true) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }
  if (agreement === false) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
        <AlertTriangle className="h-2.5 w-2.5" /> Conflict
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600">
      <Sparkles className="h-2.5 w-2.5" /> AI Only
    </span>
  );
}

function DataPointRow({
  point,
  toggle,
  onToggle,
  onOverride,
  onClearOverride,
}: {
  point: DisplayPoint;
  toggle: { enabled: boolean; overrideValue?: number | string };
  onToggle: () => void;
  onOverride: (value: number | string) => void;
  onClearOverride: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const displayValue = toggle.overrideValue != null
    ? toggle.overrideValue
    : point.finalValue;

  const startEdit = () => {
    setEditVal(String(displayValue ?? ''));
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editVal.trim();
    if (!trimmed) return;
    const num = Number(trimmed);
    if (!isNaN(num)) {
      onOverride(num);
    } else {
      onOverride(trimmed);
    }
  };

  const hasOverride = toggle.overrideValue != null;

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg transition-colors ${
      toggle.enabled ? 'bg-teal-50/50' : 'bg-white'
    }`}>
      <button onClick={onToggle} className="flex-shrink-0">
        {toggle.enabled ? (
          <ToggleRight className="h-5 w-5 text-teal-600" />
        ) : (
          <ToggleLeft className="h-5 w-5 text-slate-300" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${toggle.enabled ? 'text-slate-700' : 'text-slate-400'}`}>
            {point.label}
          </span>
          <AgreementBadge agreement={point.agreement} />
          {hasOverride && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
              Override
            </span>
          )}
        </div>

        {point.ruleBasedValue != null && point.llmValue != null && point.agreement === false && (
          <p className="text-[10px] text-amber-500 mt-0.5">
            Rule: {formatValue(point.ruleBasedValue, point.unit)} / AI: {formatValue(point.llmValue, point.unit)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
              className="w-20 px-1.5 py-0.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
            <button onClick={commitEdit} className="p-0.5 hover:bg-emerald-50 rounded">
              <Check className="h-3 w-3 text-emerald-500" />
            </button>
            <button onClick={() => setEditing(false)} className="p-0.5 hover:bg-red-50 rounded">
              <X className="h-3 w-3 text-red-400" />
            </button>
          </div>
        ) : (
          <>
            <span className={`text-xs font-semibold tabular-nums ${
              toggle.enabled ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {formatValue(displayValue, point.unit)}
            </span>
            <button
              onClick={startEdit}
              className="p-0.5 hover:bg-slate-100 rounded opacity-0 group-hover/row:opacity-100 transition-opacity"
              title="Override value"
            >
              <Pencil className="h-3 w-3 text-slate-400" />
            </button>
            {hasOverride && (
              <button
                onClick={onClearOverride}
                className="p-0.5 hover:bg-red-50 rounded"
                title="Clear override"
              >
                <RotateCcw className="h-2.5 w-2.5 text-slate-400" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const UNIT_MIX_KEYS: Record<string, keyof UnitMixOverrides> = {
  totalUnits: 'totalUnits',
  affordableUnits: 'affordableUnits',
  marketUnits: 'marketUnits',
  studio: 'studio',
  br1: 'br1',
  br2: 'br2',
  br3: 'br3',
  br4plus: 'br4plus',
};

export default function ExtractedDataPointsPanel({
  reconciliations,
  onApply,
  onUnitMixApply,
  onClear,
  appliedCount,
}: ExtractedDataPointsProps) {
  const points = useMemo(() => buildDisplayPoints(reconciliations), [reconciliations]);

  const [toggleState, setToggleState] = useState<DataPointToggleState>(() => {
    const init: DataPointToggleState = {};
    for (const p of buildDisplayPoints(reconciliations)) {
      const isApplicable = !!OVERRIDE_KEYS[p.key];
      init[p.key] = {
        enabled: isApplicable && (p.agreement === true || p.agreement === null) && p.finalValue != null,
      };
    }
    return init;
  });

  const grouped = useMemo(() => {
    const groups: Record<DataPointCategory, DisplayPoint[]> = { zoning: [], building: [], unit_mix: [] };
    for (const p of points) {
      groups[p.category].push(p);
    }
    return groups;
  }, [points]);

  const handleToggle = useCallback((key: string) => {
    setToggleState((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled },
    }));
  }, []);

  const handleOverride = useCallback((key: string, value: number | string) => {
    setToggleState((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: true, overrideValue: value },
    }));
  }, []);

  const handleClearOverride = useCallback((key: string) => {
    setToggleState((prev) => {
      const next = { ...prev[key] };
      delete next.overrideValue;
      return { ...prev, [key]: next };
    });
  }, []);

  const selectAll = useCallback(() => {
    setToggleState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], enabled: true };
      }
      return next;
    });
  }, []);

  const deselectAll = useCallback(() => {
    setToggleState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], enabled: false };
      }
      return next;
    });
  }, []);

  const enabledCount = Object.values(toggleState).filter((t) => t.enabled).length;

  const handleApply = useCallback(() => {
    const overrides: AppliedOverrides = {};
    const mixOverrides: UnitMixOverrides = {};
    let hasMix = false;

    for (const p of points) {
      const t = toggleState[p.key];
      if (!t?.enabled) continue;

      const val = t.overrideValue != null ? t.overrideValue : p.finalValue;
      if (val == null) continue;

      const overrideKey = OVERRIDE_KEYS[p.key];
      if (overrideKey) {
        if (overrideKey === 'zoneDist') {
          (overrides as Record<string, unknown>)[overrideKey] = String(val);
        } else {
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (!isNaN(num)) {
            (overrides as Record<string, unknown>)[overrideKey] = num;
          }
        }
      }

      const mixKey = UNIT_MIX_KEYS[p.key];
      if (mixKey) {
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (!isNaN(num)) {
          (mixOverrides as Record<string, number>)[mixKey] = num;
          hasMix = true;
        }
      }
    }

    onApply(overrides);
    onUnitMixApply?.(hasMix ? mixOverrides : null);
  }, [points, toggleState, onApply, onUnitMixApply]);

  if (points.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
          <p className="text-xs font-semibold text-slate-700">AI-Verified Data Points</p>
          <span className="text-[10px] text-slate-400">{points.length} fields extracted</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-[10px] text-teal-600 hover:text-teal-700 font-medium transition-colors"
          >
            Select All
          </button>
          <span className="text-slate-200">|</span>
          <button
            onClick={deselectAll}
            className="text-[10px] text-slate-500 hover:text-slate-700 font-medium transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const catPoints = grouped[cat];
          if (catPoints.length === 0) return null;
          return (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="space-y-0.5">
                {catPoints.map((p) => (
                  <div key={p.key} className="group/row">
                    <DataPointRow
                      point={p}
                      toggle={toggleState[p.key] ?? { enabled: false }}
                      onToggle={() => handleToggle(p.key)}
                      onOverride={(val) => handleOverride(p.key, val)}
                      onClearOverride={() => handleClearOverride(p.key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleApply}
            disabled={enabledCount === 0}
            className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-all shadow-sm ${
              enabledCount > 0
                ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Apply {enabledCount} Selected to Model
          </button>
          {appliedCount > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-slate-500 hover:text-red-600 font-medium transition-colors"
            >
              Clear Applied
            </button>
          )}
        </div>
        {appliedCount > 0 && (
          <span className="text-[10px] text-teal-600 font-medium">
            {appliedCount} values applied to model
          </span>
        )}
      </div>
    </div>
  );
}
