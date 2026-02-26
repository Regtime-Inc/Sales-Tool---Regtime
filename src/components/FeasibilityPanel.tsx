import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, AlertCircle, Info, RefreshCw, MapPin } from 'lucide-react';
import type { FeasibilityResult, ProgramEvaluation, ProgramOption } from '../types/feasibility';
import type { MihEligibilityResult } from '../lib/mih/types';
import { calcTotalProjectedUnits, formatAffordableExplanation } from '../lib/units/unitMath';

interface FeasibilityPanelProps {
  feasibility: FeasibilityResult;
  mihOverlay?: MihEligibilityResult | null;
  mihLoading?: boolean;
  onRetryMih?: () => void;
  overrideContext?: string | null;
  uapUtilizationPct?: number;
  onUapUtilizationChange?: (pct: number) => void;
}

const PROGRAM_COLORS: Record<string, { border: string; badge: string; accent: string }> = {
  MIH: { border: 'border-sky-200', badge: 'bg-sky-50 text-sky-700', accent: 'text-sky-600' },
  UAP: { border: 'border-teal-200', badge: 'bg-teal-50 text-teal-700', accent: 'text-teal-600' },
  '485-x': { border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-700', accent: 'text-emerald-600' },
  '421-a': { border: 'border-slate-200', badge: 'bg-slate-100 text-slate-500', accent: 'text-slate-500' },
  '467-m': { border: 'border-amber-200', badge: 'bg-amber-50 text-amber-700', accent: 'text-amber-600' },
};

function EligibilityBadge({ status }: { status: ProgramEvaluation['eligible'] }) {
  if (status === 'yes') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Eligible
      </span>
    );
  }
  if (status === 'needs_verification' || status === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
        <AlertCircle className="h-3 w-3" /> Needs manual verification
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">
      <XCircle className="h-3 w-3" /> Not eligible
    </span>
  );
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-md px-2 py-1.5">
      <p className="text-[10px] text-slate-400 leading-tight">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function OptionCard({ option, accent, isApplicable }: { option: ProgramOption; accent: string; isApplicable: boolean }) {
  const [expanded, setExpanded] = useState(isApplicable);

  return (
    <div className={`border rounded-lg overflow-hidden ${isApplicable ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{option.name}</span>
          {isApplicable && (
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
              Applicable
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${accent}`}>
            {option.affordableSetAsidePct}% set-aside
          </span>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniMetric label="Affordable SF" value={formatNum(option.affordableFloorArea)} />
            <MiniMetric label="Affordable Units" value={String(option.affordableUnits)} />
            <MiniMetric label="Avg AMI" value={`${option.avgAmi}%`} />
            {option.benefitYears && (
              <MiniMetric label="Benefit" value={`${option.benefitYears} yrs`} />
            )}
          </div>
          {typeof option.details?.totalProjectedUnits === 'number' && option.details.totalProjectedUnits > 0 && (
            <div className="bg-slate-50 rounded-md px-2.5 py-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-600">{option.details.totalProjectedUnits} total projected units</span>
              {' '}&middot;{' '}
              <span className="font-mono text-[11px]">
                {formatAffordableExplanation(Number(option.details.totalProjectedUnits), option.affordableSetAsidePct)}
              </span>
            </div>
          )}

          {(option.amiBands ?? []).length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-medium">Income Bands</p>
              <div className="space-y-1">
                {(option.amiBands ?? []).map((band, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-400 rounded-full"
                        style={{ width: `${Math.min(band.minPctOfAffordable, 100)}%` }}
                      />
                    </div>
                    <span className="text-slate-500 w-16 text-right">{band.minPctOfAffordable}%</span>
                    <span className="text-slate-700 w-20">at {band.maxAmi}% AMI</span>
                    <span className="text-slate-400 w-16 text-right">{formatNum(band.floorArea)} SF</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UapSlider({
  pct,
  onChange,
  maxBonusSf,
  deepThreshold,
}: {
  pct: number;
  onChange: (v: number) => void;
  maxBonusSf: number;
  deepThreshold: number;
}) {
  const computedSf = Math.round(maxBonusSf * (pct / 100));
  const isUnder10k = computedSf > 0 && computedSf < deepThreshold;

  return (
    <div className="bg-teal-50/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide">
          Affordable Floor Area Utilization
        </p>
        <span className="text-xs font-bold text-teal-700">{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-teal-200 rounded-full appearance-none cursor-pointer accent-teal-600"
      />
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>0%</span>
        <span>{computedSf.toLocaleString()} SF of {maxBonusSf.toLocaleString()} SF</span>
        <span>100%</span>
      </div>
      {isUnder10k && (
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-md p-2">
          <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700">
            Affordable floor area ({computedSf.toLocaleString()} SF) is under 10,000 SF.
            Deep affordability thresholds will not be triggered.
          </p>
        </div>
      )}
    </div>
  );
}

function EligibleProgramCard({ evaluation, uapSlider }: { evaluation: ProgramEvaluation; uapSlider?: React.ReactNode }) {
  const colors = PROGRAM_COLORS[evaluation.program] || PROGRAM_COLORS.MIH;
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const applicable = evaluation.applicableOption;
  const otherOptions = evaluation.options.filter((o) => o.name !== applicable?.name);

  return (
    <div className={`bg-white rounded-xl border ${colors.border} shadow-sm overflow-hidden`}>
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
            {evaluation.program}
          </span>
          <EligibilityBadge status={evaluation.eligible} />
        </div>
        {applicable && applicable.affordableUnits > 0 && (
          <span className="text-xs text-slate-400">
            ~{applicable.affordableUnits} affordable units
          </span>
        )}
      </div>

      {uapSlider && (
        <div className="px-4 pb-3">{uapSlider}</div>
      )}

      {applicable && applicable.affordableFloorArea > 0 && (
        <div className="px-4 pb-3">
          <OptionCard option={applicable} accent={colors.accent} isApplicable={true} />
        </div>
      )}

      {(evaluation.missingData ?? []).length > 0 && (
        <div className="px-4 pb-2">
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Missing data for verification</p>
            {(evaluation.missingData ?? []).map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherOptions.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowOtherOptions(!showOtherOptions)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-1.5"
          >
            {showOtherOptions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            See other options ({otherOptions.length})
          </button>
          {showOtherOptions && (
            <div className="space-y-1.5">
              {otherOptions.map((opt, i) => (
                <OptionCard key={i} option={opt} accent={colors.accent} isApplicable={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {(evaluation.notes ?? []).length > 0 && (
        <div className="border-t border-slate-50 px-4 py-2">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showNotes ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Notes ({(evaluation.notes ?? []).length})
          </button>
          {showNotes && (
            <ul className="mt-1.5 space-y-1">
              {(evaluation.notes ?? []).map((note, i) => (
                <li key={i} className="text-xs text-slate-500 pl-4">{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CollapsedProgramRow({ evaluation }: { evaluation: ProgramEvaluation }) {
  const colors = PROGRAM_COLORS[evaluation.program] || PROGRAM_COLORS.MIH;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
            {evaluation.program}
          </span>
          <EligibilityBadge status={evaluation.eligible} />
        </div>
        <div className="flex items-center gap-2">
          {(evaluation.gaps ?? []).length > 0 && (
            <span className="text-[10px] text-slate-400">{(evaluation.gaps ?? []).length} issue{(evaluation.gaps ?? []).length > 1 ? 's' : ''}</span>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 space-y-2">
          {(evaluation.gaps ?? []).length > 0 && (
            <div className="space-y-1">
              {(evaluation.gaps ?? []).map((gap, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                  <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{gap}</span>
                </div>
              ))}
            </div>
          )}
          {(evaluation.missingData ?? []).length > 0 && (
            <div className="space-y-1">
              {(evaluation.missingData ?? []).map((item, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
          {(evaluation.notes ?? []).length > 0 && (
            <ul className="space-y-1 mt-1">
              {(evaluation.notes ?? []).slice(0, 2).map((note, i) => (
                <li key={i} className="text-xs text-slate-500">{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MihStatusRow({
  mihOverlay,
  mihLoading,
  onRetry,
}: {
  mihOverlay?: MihEligibilityResult | null;
  mihLoading?: boolean;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (mihLoading) {
    return (
      <div className="border border-sky-100 rounded-lg px-3 py-2.5 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-500">Checking MIH designated area...</span>
      </div>
    );
  }

  if (!mihOverlay) return null;

  if (mihOverlay.status === 'unavailable') {
    return (
      <div className="border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700">MIH</span>
          <span className="text-xs text-slate-500">Unable to verify right now</span>
          <div className="relative group">
            <Info className="h-3 w-3 text-slate-400 cursor-help" />
            <div className="absolute left-0 bottom-full mb-1 w-52 p-2 bg-slate-800 text-white text-[10px] rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
              MIH is a zoning overlay; verification requires loading the MIH map layer from NYC Open Data.
            </div>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (mihOverlay.status === 'not_eligible') {
    return (
      <div className="border border-slate-100 rounded-lg px-3 py-2.5 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700">MIH</span>
        <XCircle className="h-3 w-3 text-slate-400" />
        <span className="text-xs text-slate-500">Not in designated area</span>
      </div>
    );
  }

  return (
    <div className="border border-sky-200 rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-sky-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700">MIH</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Eligible
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mihOverlay.derived.areaName && (
            <span className="text-[10px] text-slate-400 hidden sm:inline">{mihOverlay.derived.areaName}</span>
          )}
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-sky-100 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-sky-50/50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Area</p>
              <p className="text-xs font-medium text-slate-700">
                {mihOverlay.derived.areaName || '(not provided in dataset)'}
              </p>
            </div>
            <div className="bg-sky-50/50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Option</p>
              <p className="text-xs font-medium text-slate-700">
                {mihOverlay.derived.option || '(not provided in dataset)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <MapPin className="h-3 w-3" />
            <span>Source: {mihOverlay.source.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeasibilityPanel({ feasibility, mihOverlay, mihLoading, onRetryMih, overrideContext, uapUtilizationPct, onUapUtilizationChange }: FeasibilityPanelProps) {
  const { capacity, programs, stackingConflicts } = feasibility;
  const [showOtherPrograms, setShowOtherPrograms] = useState(false);

  const hasMihOverlay = mihOverlay != null || mihLoading;

  const { eligible, needsVerification, notEligible } = useMemo(() => {
    const eligible: ProgramEvaluation[] = [];
    const needsVerification: ProgramEvaluation[] = [];
    const notEligible: ProgramEvaluation[] = [];
    for (const p of programs) {
      if (p.program === 'MIH' && hasMihOverlay) continue;
      if (p.eligible === 'yes') eligible.push(p);
      else if (p.eligible === 'needs_verification' || p.eligible === 'unknown') needsVerification.push(p);
      else notEligible.push(p);
    }
    return { eligible, needsVerification, notEligible };
  }, [programs, hasMihOverlay]);

  const expandedPrograms = [...eligible, ...needsVerification];
  const collapsedPrograms = notEligible;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Program Feasibility
      </h3>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-400 font-medium">
            Capacity Model ({capacity.zoningSource === 'table' ? 'ZR 23-22' : 'PLUTO'}-based, DU factor {capacity.duFactor})
          </p>
          {overrideContext && (
            <span className="text-[9px] font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
              {overrideContext}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <MiniMetric label="Max Res FA" value={formatNum(capacity.maxResFa) + ' SF'} />
          <MiniMetric label="New Res FA" value={formatNum(capacity.newResFa) + ' SF'} />
          <MiniMetric label="Projected Units (Full Build)" value={String(calcTotalProjectedUnits(capacity.maxResFa, capacity.duFactor))} />
          <MiniMetric label="Buildable Slack" value={formatNum(capacity.buildableSlackSf) + ' SF'} />
          <MiniMetric
            label="Zone Allows Res"
            value={capacity.zoneAllowsResidential ? 'Yes' : 'No'}
          />
        </div>
      </div>

      {stackingConflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-1">Stacking Conflicts</p>
            {stackingConflicts.map((c, i) => (
              <p key={i} className="text-xs text-amber-600">{c}</p>
            ))}
          </div>
        </div>
      )}

      {hasMihOverlay && (
        <div className="mb-4">
          <MihStatusRow mihOverlay={mihOverlay} mihLoading={mihLoading} onRetry={onRetryMih} />
        </div>
      )}

      {expandedPrograms.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-400 font-medium mb-2">
            {eligible.length > 0 ? 'Eligible programs' : 'Programs requiring verification'}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {expandedPrograms.map((p) => {
              const isUap = p.program === 'UAP' && p.eligible === 'yes';
              const maxBonusSf = isUap ? Number(p.applicableOption?.details?.maxBonusFloorArea ?? 0) : 0;
              const deepThreshold = isUap ? Number(p.applicableOption?.details?.deepAffordableThresholdSf ?? 10000) : 10000;
              return (
                <EligibleProgramCard
                  key={p.program}
                  evaluation={p}
                  uapSlider={isUap && onUapUtilizationChange ? (
                    <UapSlider
                      pct={uapUtilizationPct ?? 100}
                      onChange={onUapUtilizationChange}
                      maxBonusSf={maxBonusSf}
                      deepThreshold={deepThreshold}
                    />
                  ) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {collapsedPrograms.length > 0 && (
        <div>
          <button
            onClick={() => setShowOtherPrograms(!showOtherPrograms)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-2"
          >
            {showOtherPrograms ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Other programs ({collapsedPrograms.length} not eligible)
          </button>
          {showOtherPrograms && (
            <div className="space-y-2">
              {collapsedPrograms.map((p) => (
                <CollapsedProgramRow key={p.program} evaluation={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
