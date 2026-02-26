import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import type { ValidationGate, ValidationGateStatus } from '../lib/extractionV2/types';

interface ExtractionOverridePromptProps {
  gates: ValidationGate[];
  onOverridesSubmit: (overrides: Record<string, number | string>) => void;
  onConfirmAll: () => void;
  redundancyScore?: number;
  overridesApplied?: boolean;
}

const STATUS_CONFIG: Record<ValidationGateStatus, { icon: typeof AlertTriangle; color: string; bg: string; border: string; label: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Passed' },
  WARN: { icon: Info, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Warning' },
  NEEDS_OVERRIDE: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Needs Review' },
  CONFLICTING: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Conflicting' },
};

const FIELD_LABELS: Record<string, string> = {
  totalUnits: 'Total Units',
  far: 'Floor Area Ratio',
  lotArea: 'Lot Area (SF)',
  unitCountRedundancy: 'Unit Count Redundancy',
};

export default function ExtractionOverridePrompt({
  gates,
  onOverridesSubmit,
  onConfirmAll,
  redundancyScore,
  overridesApplied,
}: ExtractionOverridePromptProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(true);

  const actionableGates = gates.filter((g) => g.status === 'NEEDS_OVERRIDE' || g.status === 'CONFLICTING');
  const warningGates = gates.filter((g) => g.status === 'WARN');
  const passGates = gates.filter((g) => g.status === 'PASS');

  const handleSubmit = () => {
    const parsed: Record<string, number | string> = {};
    for (const [field, value] of Object.entries(overrides)) {
      const num = parseFloat(value);
      if (!isNaN(num) && value.trim() !== '') {
        parsed[field] = num;
      }
    }
    onOverridesSubmit(parsed);
  };

  const hasOverrideValues = Object.values(overrides).some((v) => v.trim() !== '');

  if (gates.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Validation Results</span>
          {actionableGates.length > 0 && (
            <span className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
              {actionableGates.length} need{actionableGates.length === 1 ? 's' : ''} review
            </span>
          )}
          {actionableGates.length === 0 && warningGates.length > 0 && (
            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {warningGates.length} warning{warningGates.length === 1 ? '' : 's'}
            </span>
          )}
          {actionableGates.length === 0 && warningGates.length === 0 && (
            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              {overridesApplied ? 'Overrides applied' : 'All checks passed'}
            </span>
          )}
          {redundancyScore !== undefined && (
            <span className="text-[10px] text-slate-500">
              Redundancy: {(redundancyScore * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {overridesApplied && actionableGates.length === 0 && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <p className="text-[11px] text-emerald-700 font-medium">
                Overrides applied successfully. Validation gates re-evaluated.
              </p>
            </div>
          )}

          {actionableGates.map((gate, i) => (
            <GateCard key={`action-${i}`} gate={gate} override={overrides[gate.field] ?? ''} onOverrideChange={(val) => setOverrides((prev) => ({ ...prev, [gate.field]: val }))} />
          ))}

          {warningGates.map((gate, i) => (
            <GateCard key={`warn-${i}`} gate={gate} />
          ))}

          {passGates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {passGates.map((gate, i) => {
                const cfg = STATUS_CONFIG[gate.status];
                const Icon = cfg.icon;
                return (
                  <div key={`pass-${i}`} className="flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                    <Icon className="h-3 w-3" />
                    <span>{FIELD_LABELS[gate.field] ?? gate.field}</span>
                  </div>
                );
              })}
            </div>
          )}

          {actionableGates.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={handleSubmit}
                disabled={!hasOverrideValues}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Edit3 className="h-3 w-3 inline mr-1" />
                Apply Overrides
              </button>
              <button
                onClick={onConfirmAll}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3 inline mr-1" />
                Confirm Extracted Values
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GateCard({
  gate,
  override,
  onOverrideChange,
}: {
  gate: ValidationGate;
  override?: string;
  onOverrideChange?: (val: string) => void;
}) {
  const cfg = STATUS_CONFIG[gate.status];
  const Icon = cfg.icon;
  const isEditable = gate.status === 'NEEDS_OVERRIDE' || gate.status === 'CONFLICTING';

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {FIELD_LABELS[gate.field] ?? gate.field}
            </span>
            <span className={`text-[10px] font-medium ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">{gate.message}</p>

          {gate.expectedRange && (
            <p className="text-[10px] text-slate-500 mt-1">
              Expected range: {typeof gate.expectedRange.min === 'number' ? gate.expectedRange.min.toLocaleString() : gate.expectedRange.min} - {typeof gate.expectedRange.max === 'number' ? gate.expectedRange.max.toLocaleString() : gate.expectedRange.max}
            </p>
          )}

          {gate.evidence.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {gate.evidence.slice(0, 3).map((ev, j) => (
                <p key={j} className="text-[10px] text-slate-500 font-mono truncate">
                  p.{ev.page}: {ev.snippet}
                </p>
              ))}
            </div>
          )}

          {isEditable && onOverrideChange && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[10px] text-slate-500 font-medium">Correct value:</label>
              <input
                type="text"
                value={override ?? ''}
                onChange={(e) => onOverrideChange(e.target.value)}
                placeholder={`Enter correct ${FIELD_LABELS[gate.field]?.toLowerCase() ?? gate.field}`}
                className="text-xs px-2 py-1 border border-slate-300 rounded-md w-36 focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 bg-white"
              />
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs font-mono text-slate-600">
            {gate.extractedValue !== null ? (typeof gate.extractedValue === 'number' ? gate.extractedValue.toLocaleString() : gate.extractedValue) : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
