import { CheckCircle, AlertTriangle } from 'lucide-react';
import type { OptimizerScenario } from '../types/optimizer';

interface ScenarioComparisonProps {
  scenarios: OptimizerScenario[];
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

const SOURCE_LABELS: Record<string, string> = {
  optimized: 'Optimizer',
  imported: 'From Plans',
  manual: 'Manual',
};

interface MetricDef {
  label: string;
  getValue: (s: OptimizerScenario) => string;
  getNumeric: (s: OptimizerScenario) => number;
  higherIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  {
    label: 'Total Units',
    getValue: (s) => s.result?.totalUnits.toString() ?? '--',
    getNumeric: (s) => s.result?.totalUnits ?? 0,
    higherIsBetter: true,
  },
  {
    label: 'Affordable',
    getValue: (s) => s.result?.affordableUnitCount.toString() ?? '--',
    getNumeric: (s) => s.result?.affordableUnitCount ?? 0,
    higherIsBetter: true,
  },
  {
    label: 'Total SF',
    getValue: (s) => s.result?.totalSF.toLocaleString() ?? '--',
    getNumeric: (s) => s.result?.totalSF ?? 0,
    higherIsBetter: true,
  },
  {
    label: 'Annual Revenue',
    getValue: (s) => s.result ? formatCurrency(s.result.annualRevenue) : '--',
    getNumeric: (s) => s.result?.annualRevenue ?? 0,
    higherIsBetter: true,
  },
  {
    label: 'ROI Proxy',
    getValue: (s) => s.result ? formatPct(s.result.roiProxy) : '--',
    getNumeric: (s) => s.result?.roiProxy ?? 0,
    higherIsBetter: true,
  },
  {
    label: 'Blended AMI',
    getValue: (s) => s.result && s.result.blendedAmi > 0 ? `${s.result.blendedAmi}%` : '--',
    getNumeric: (s) => s.result?.blendedAmi ?? 0,
    higherIsBetter: false,
  },
];

export default function ScenarioComparison({ scenarios }: ScenarioComparisonProps) {
  const activeScenarios = scenarios.filter((s) => s.result !== null);
  if (activeScenarios.length < 2) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Scenario Comparison
        </p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-3 font-medium text-slate-400">Metric</th>
            {activeScenarios.map((s) => (
              <th key={s.id} className="text-right py-2 px-3 font-medium text-slate-600">
                <div className="flex items-center justify-end gap-1.5">
                  <span>{s.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    s.source === 'optimized' ? 'bg-cyan-50 text-cyan-600' :
                    s.source === 'imported' ? 'bg-teal-50 text-teal-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {SOURCE_LABELS[s.source]}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => {
            const values = activeScenarios.map((s) => metric.getNumeric(s));
            const best = metric.higherIsBetter ? Math.max(...values) : Math.min(...values.filter((v) => v > 0));
            return (
              <tr key={metric.label} className="border-b border-slate-50">
                <td className="py-1.5 px-3 text-slate-500">{metric.label}</td>
                {activeScenarios.map((s, i) => {
                  const isBest = values[i] === best && values[i] > 0;
                  return (
                    <td key={s.id} className={`py-1.5 px-3 text-right font-medium ${
                      isBest ? 'text-emerald-700' : 'text-slate-700'
                    }`}>
                      {metric.getValue(s)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t border-slate-200 bg-slate-50/50">
            <td className="py-2 px-3 font-medium text-slate-500">Feasible</td>
            {activeScenarios.map((s) => (
              <td key={s.id} className="py-2 px-3 text-right">
                {s.result?.feasible ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <CheckCircle className="h-3 w-3" /> Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                    <AlertTriangle className="h-3 w-3" /> No
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
