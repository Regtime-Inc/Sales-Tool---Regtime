import { CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import type { LlmReconciliation } from '../lib/extractionV2/types';

interface LlmReconciliationSummaryProps {
  reconciliations: LlmReconciliation[];
}

const FIELD_LABELS: Record<string, string> = {
  totalUnits: 'Total Units',
  far: 'Floor Area Ratio',
  lotArea: 'Lot Area (SF)',
};

function formatValue(field: string, value: number | string | null): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string') return value;
  if (field === 'lotArea') return value.toLocaleString() + ' SF';
  if (field === 'far') return value.toFixed(2);
  return value.toLocaleString();
}

export default function LlmReconciliationSummary({ reconciliations }: LlmReconciliationSummaryProps) {
  if (reconciliations.length === 0) return null;

  const allAgree = reconciliations.every((r) => r.agreement);

  return (
    <div className="border border-sky-200 rounded-xl overflow-hidden bg-sky-50/50">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-100/60">
        <Sparkles className="h-3.5 w-3.5 text-sky-600" />
        <span className="text-xs font-semibold text-sky-800">AI Verification Findings</span>
        {allAgree ? (
          <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-auto">
            All values agree
          </span>
        ) : (
          <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full ml-auto">
            Discrepancies found
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {reconciliations.map((r, i) => (
          <div
            key={i}
            className={`rounded-lg border px-3 py-2.5 ${
              r.agreement
                ? 'border-emerald-200 bg-emerald-50/60'
                : 'border-amber-200 bg-amber-50/60'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {r.agreement ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              )}
              <span className="text-[11px] font-semibold text-slate-700">
                {FIELD_LABELS[r.field] ?? r.field}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                r.agreement ? 'text-emerald-600 bg-emerald-100' : 'text-amber-600 bg-amber-100'
              }`}>
                {r.agreement ? 'Match' : 'Mismatch'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] mb-1.5">
              <div className="bg-white/80 rounded px-2 py-1.5">
                <span className="text-slate-400 block">Rule-based</span>
                <span className="text-slate-700 font-semibold">{formatValue(r.field, r.ruleBasedValue)}</span>
              </div>
              <div className="bg-white/80 rounded px-2 py-1.5">
                <span className="text-slate-400 block">AI (GPT-4o)</span>
                <span className="text-slate-700 font-semibold">{formatValue(r.field, r.llmValue)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500 leading-relaxed flex-1">{r.note}</p>
              <span className="text-[10px] font-mono text-slate-400 ml-2 flex-shrink-0">
                {Math.round(r.finalConfidence * 100)}% conf.
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
