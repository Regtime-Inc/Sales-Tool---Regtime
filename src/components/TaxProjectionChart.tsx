import { useState, useMemo } from 'react';
import { TrendingDown, Info, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import type { TaxProjections, TaxScenario, AnnualTaxRow, AVEstimateInfo } from '../types/tax';

interface TaxProjectionChartProps {
  projections: TaxProjections;
}

const SCENARIO_COLORS = [
  { line: '#0ea5e9', fill: 'rgba(14,165,233,0.12)', label: 'text-sky-700', bg: 'bg-sky-50' },
  { line: '#14b8a6', fill: 'rgba(20,184,166,0.12)', label: 'text-teal-700', bg: 'bg-teal-50' },
  { line: '#f59e0b', fill: 'rgba(245,158,11,0.12)', label: 'text-amber-700', bg: 'bg-amber-50' },
  { line: '#10b981', fill: 'rgba(16,185,129,0.12)', label: 'text-emerald-700', bg: 'bg-emerald-50' },
  { line: '#64748b', fill: 'rgba(100,116,139,0.12)', label: 'text-slate-700', bg: 'bg-slate-100' },
  { line: '#ef4444', fill: 'rgba(239,68,68,0.12)', label: 'text-red-700', bg: 'bg-red-50' },
  { line: '#8b5cf6', fill: 'rgba(139,92,246,0.12)', label: 'text-violet-700', bg: 'bg-violet-50' },
  { line: '#ec4899', fill: 'rgba(236,72,153,0.12)', label: 'text-pink-700', bg: 'bg-pink-50' },
];

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatFullCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function MiniChart({
  baseline,
  baselineWithGrowth,
  scenarios,
  activeScenarios,
}: {
  baseline: AnnualTaxRow[];
  baselineWithGrowth: AnnualTaxRow[];
  scenarios: TaxScenario[];
  activeScenarios: Set<number>;
}) {
  const maxYear = Math.max(
    baseline.length,
    ...scenarios.filter((_, i) => activeScenarios.has(i)).map((s) => s.rows.length)
  );
  const allValues = [
    ...baselineWithGrowth.map((r) => r.netTax),
    ...baseline.map((r) => r.netTax),
    ...scenarios
      .filter((_, i) => activeScenarios.has(i))
      .flatMap((s) => s.rows.map((r) => r.netTax)),
  ];
  const maxVal = Math.max(...allValues, 1);
  const chartW = 640;
  const chartH = 200;
  const padL = 60;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const w = chartW - padL - padR;
  const h = chartH - padT - padB;

  function x(year: number): number {
    return padL + ((year - 1) / Math.max(maxYear - 1, 1)) * w;
  }
  function y(val: number): number {
    return padT + h - (val / maxVal) * h;
  }

  const baselinePath = baseline
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.year).toFixed(1)},${y(r.netTax).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
  const xTicks = Array.from({ length: Math.min(maxYear, 8) }, (_, i) =>
    Math.round(1 + (i / 7) * (maxYear - 1))
  );

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={y(tick)}
            x2={chartW - padR}
            y2={y(tick)}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray={i === 0 ? 'none' : '4,4'}
          />
          <text x={padL - 6} y={y(tick) + 4} textAnchor="end" className="text-[9px]" fill="#94a3b8">
            {formatCurrency(tick)}
          </text>
        </g>
      ))}

      {xTicks.map((yr) => (
        <text key={yr} x={x(yr)} y={chartH - 4} textAnchor="middle" className="text-[9px]" fill="#94a3b8">
          Yr {yr}
        </text>
      ))}

      <path d={baselinePath} fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.5" />
      <path
        d={baselineWithGrowth
          .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.year).toFixed(1)},${y(r.netTax).toFixed(1)}`)
          .join(' ')}
        fill="none"
        stroke="#334155"
        strokeWidth="2"
      />

      {scenarios.map((scenario, idx) => {
        if (!activeScenarios.has(idx)) return null;
        const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
        const path = scenario.rows
          .map(
            (r, i) =>
              `${i === 0 ? 'M' : 'L'}${x(r.year).toFixed(1)},${y(r.netTax).toFixed(1)}`
          )
          .join(' ');
        const fillPath =
          path +
          ` L${x(scenario.rows[scenario.rows.length - 1].year).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z`;
        return (
          <g key={idx}>
            <path d={fillPath} fill={color.fill} />
            <path d={path} fill="none" stroke={color.line} strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}

function ScenarioDetail({ scenario, colorIdx, baseline }: { scenario: TaxScenario; colorIdx: number; baseline: AnnualTaxRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const color = SCENARIO_COLORS[colorIdx % SCENARIO_COLORS.length];

  const fullExemptYears = scenario.rows.filter((r) => r.exemptionAmount > 0 && r.taxableValue === 0).length;
  const phaseOutYears = scenario.rows.length - fullExemptYears;
  const avgAnnualSavings = scenario.rows.length > 0 ? Math.round(scenario.totalSavings / scenario.rows.length) : 0;

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color.line }}
          />
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-700 block truncate">{scenario.label}</span>
            {scenario.reason && (
              <span className="text-[10px] text-slate-400 block truncate">{scenario.reason}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <span className={`text-xs font-semibold ${color.label}`}>
              {formatFullCurrency(scenario.realSavings)} saved
            </span>
            <span className="text-[9px] text-slate-400 block">{scenario.savingsPct.toFixed(1)}%</span>
          </div>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-slate-50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Full Exemption</p>
              <p className="text-sm font-semibold text-slate-700">{fullExemptYears} yrs</p>
            </div>
            <div className="bg-slate-50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Phase-Out</p>
              <p className="text-sm font-semibold text-slate-700">{phaseOutYears} yrs</p>
            </div>
            <div className="bg-slate-50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Total Benefit</p>
              <p className="text-sm font-semibold text-slate-700">{scenario.rows.length} yrs</p>
            </div>
            <div className="bg-slate-50 rounded-md px-2 py-1.5">
              <p className="text-[10px] text-slate-400 leading-tight">Avg Annual Savings</p>
              <p className="text-sm font-semibold text-emerald-700">{formatFullCurrency(avgAnnualSavings)}</p>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-left py-1 pr-2 font-medium">Year</th>
                  <th className="text-right py-1 px-2 font-medium">Exempt %</th>
                  <th className="text-right py-1 px-2 font-medium">Net Tax</th>
                  <th className="text-right py-1 pl-2 font-medium">Savings</th>
                </tr>
              </thead>
              <tbody>
                {scenario.rows.map((row, idx) => {
                  const exemptPct = row.assessedValue > 0 ? Math.round((row.exemptionAmount / row.assessedValue) * 100) : 0;
                  const baselineRow = baseline[idx] ?? baseline[baseline.length - 1];
                  const rowSavings = baselineRow ? Math.max(0, baselineRow.netTax - row.netTax) : 0;

                  return (
                    <tr key={row.year} className="border-b border-slate-50">
                      <td className="py-1 pr-2 text-slate-600">{row.year}</td>
                      <td className="py-1 px-2 text-right text-slate-600">{exemptPct}%</td>
                      <td className="py-1 px-2 text-right font-medium text-slate-700">
                        {formatFullCurrency(row.netTax)}
                      </td>
                      <td className="py-1 pl-2 text-right text-emerald-600 font-medium">
                        {formatFullCurrency(rowSavings)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ info }: { info: AVEstimateInfo }) {
  const conf = info.confidence;
  const Icon = conf === 'HIGH' ? ShieldCheck : conf === 'MED' ? Shield : ShieldAlert;
  const colors = conf === 'HIGH'
    ? 'bg-emerald-50 text-emerald-700'
    : conf === 'MED'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-red-50 text-red-600';

  return (
    <div className="relative group inline-flex">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors}`}>
        <Icon className="h-3 w-3" />
        {conf}
      </span>
      <div className="absolute left-0 bottom-full mb-1.5 w-64 p-2.5 bg-slate-800 text-white text-[10px] leading-relaxed rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20 shadow-lg">
        <p className="font-semibold mb-1">{info.methodUsed}</p>
        <p>{info.reasoning}</p>
        {info.marketValueEstimate > 0 && (
          <p className="mt-1 text-slate-300">
            MV: {formatFullCurrency(info.marketValueEstimate)} | AV/GSF: ${info.avPerGsf.toFixed(2)} | Ratio: {(info.assessmentRatio * 100).toFixed(0)}%
          </p>
        )}
      </div>
    </div>
  );
}

const PROGRAM_TAB_STYLES: Record<string, { active: string; inactive: string }> = {
  'all': { active: 'bg-slate-700 text-white', inactive: 'text-slate-500 hover:bg-slate-100' },
  '485-x': { active: 'bg-emerald-600 text-white', inactive: 'text-emerald-700 hover:bg-emerald-50' },
  '467-m': { active: 'bg-amber-600 text-white', inactive: 'text-amber-700 hover:bg-amber-50' },
};

export default function TaxProjectionChart({ projections: raw }: TaxProjectionChartProps) {
  const projections = useMemo(() => {
    const growthRate = raw.assessmentGrowthRate ?? 0.02;
    const bwg = raw.baselineWithGrowth ?? raw.baseline;
    const noExTotal = raw.noExemptionTotalTax ?? bwg.reduce((s, r) => s + r.netTax, 0);
    const scenarios = raw.scenarios.map((s) => ({
      ...s,
      realSavings: s.realSavings ?? s.totalSavings,
      savingsPct: s.savingsPct ?? 0,
    }));
    return { ...raw, assessmentGrowthRate: growthRate, baselineWithGrowth: bwg, noExemptionTotalTax: noExTotal, scenarios };
  }, [raw]);

  const programsInData = useMemo(() => {
    const set = new Set<string>();
    for (const s of projections.scenarios) if (s.program) set.add(s.program);
    return Array.from(set);
  }, [projections.scenarios]);

  const [selectedProgram, setSelectedProgram] = useState<string>('all');

  const filteredScenarios = useMemo(() => {
    if (selectedProgram === 'all') return projections.scenarios;
    return projections.scenarios.filter((s) => s.program === selectedProgram);
  }, [projections.scenarios, selectedProgram]);

  const filteredIndices = useMemo(() => {
    if (selectedProgram === 'all') return projections.scenarios.map((_, i) => i);
    return projections.scenarios
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.program === selectedProgram)
      .map(({ i }) => i);
  }, [projections.scenarios, selectedProgram]);

  const [activeScenarios, setActiveScenarios] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let i = 0; i < projections.scenarios.length; i++) s.add(i);
    return s;
  });
  const [showMore, setShowMore] = useState(false);

  const toggleScenario = (idx: number) => {
    setActiveScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const baselineAnnual = projections.baseline.length > 0 ? projections.baseline[0].netTax : 0;

  const bestScenario = useMemo(() => {
    if (filteredScenarios.length === 0) return null;
    return filteredScenarios.reduce((best, s) =>
      s.realSavings > best.realSavings ? s : best
    );
  }, [filteredScenarios]);

  const primaryScenarios = filteredScenarios.slice(0, 2);
  const extraScenarios = filteredScenarios.slice(2);

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Tax Projections
      </h3>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-slate-400" />
          <p className="text-xs text-slate-400 font-medium">
            Baseline vs Incentive Scenarios (Class {projections.taxClass}, Rate{' '}
            {(projections.taxRate * 100).toFixed(3)}%)
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <div className="bg-slate-50 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-slate-400 leading-tight">Est. Assessed Value (New Build)</p>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-700">
                {formatFullCurrency(projections.estimatedAssessedValue)}
              </p>
              {projections.avEstimate && (
                <ConfidenceBadge info={projections.avEstimate} />
              )}
            </div>
          </div>
          <div className="bg-slate-50 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-slate-400 leading-tight">Annual Baseline Tax</p>
            <p className="text-sm font-semibold text-slate-700">
              {formatFullCurrency(baselineAnnual)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-slate-400 leading-tight">40-Yr No-Exemption Total</p>
            <p className="text-sm font-semibold text-slate-700">
              {formatFullCurrency(projections.noExemptionTotalTax)}
            </p>
            <p className="text-[9px] text-slate-400">+{(projections.assessmentGrowthRate * 100).toFixed(0)}%/yr AV growth</p>
          </div>
          <div className="bg-slate-50 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-slate-400 leading-tight">Tax Class</p>
            <p className="text-sm font-semibold text-slate-700">{projections.taxClass}</p>
          </div>
          <div className="bg-slate-50 rounded-md px-2 py-1.5">
            <p className="text-[10px] text-slate-400 leading-tight">Best Real Savings</p>
            <p className="text-sm font-semibold text-emerald-700">
              {bestScenario ? formatFullCurrency(bestScenario.realSavings) : 'N/A'}
            </p>
            {bestScenario && (
              <p className="text-[9px] text-emerald-600">{bestScenario.savingsPct.toFixed(1)}% vs baseline</p>
            )}
          </div>
        </div>

        {projections.scenarios.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-400">
            No applicable incentive scenarios for this property. Only baseline tax is shown.
          </div>
        )}

        {projections.scenarios.length > 0 && (
          <>
            {programsInData.length > 1 && (
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mr-1">Program</span>
                {['all', ...programsInData].map((prog) => {
                  const styles = PROGRAM_TAB_STYLES[prog] || PROGRAM_TAB_STYLES['all'];
                  const isActive = selectedProgram === prog;
                  return (
                    <button
                      key={prog}
                      onClick={() => setSelectedProgram(prog)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        isActive ? styles.active : styles.inactive
                      }`}
                    >
                      {prog === 'all' ? 'All' : prog}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-6 h-0.5 bg-slate-400 inline-block" />
                Baseline (+{(projections.assessmentGrowthRate * 100).toFixed(0)}%/yr)
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-6 h-0.5 border-t-2 border-dashed border-slate-300 inline-block" />
                Flat
              </span>
              {filteredIndices.map((origIdx) => {
                const s = projections.scenarios[origIdx];
                const color = SCENARIO_COLORS[origIdx % SCENARIO_COLORS.length];
                const isActive = activeScenarios.has(origIdx);
                return (
                  <button
                    key={origIdx}
                    onClick={() => toggleScenario(origIdx)}
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full transition-all ${
                      isActive ? `${color.bg} ${color.label} font-medium` : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isActive ? color.line : '#cbd5e1' }}
                    />
                    {s.option}
                  </button>
                );
              })}
            </div>

            <MiniChart
              baseline={projections.baseline}
              baselineWithGrowth={projections.baselineWithGrowth}
              scenarios={projections.scenarios}
              activeScenarios={new Set(filteredIndices.filter((i) => activeScenarios.has(i)))}
            />
          </>
        )}
      </div>

      {primaryScenarios.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs text-slate-400 font-medium">
            {selectedProgram === 'all' ? 'Incentive Scenarios' : `${selectedProgram} Scenarios`}
          </p>
          {primaryScenarios.map((s, i) => (
            <ScenarioDetail key={filteredIndices[i]} scenario={s} colorIdx={filteredIndices[i]} baseline={projections.baseline} />
          ))}
        </div>
      )}

      {extraScenarios.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-2"
          >
            {showMore ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            More scenarios ({extraScenarios.length})
          </button>
          {showMore && (
            <div className="space-y-2">
              {extraScenarios.map((s, i) => (
                <ScenarioDetail key={filteredIndices[i + 2]} scenario={s} colorIdx={filteredIndices[i + 2]} baseline={projections.baseline} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-1.5 px-1">
        <Info className="h-3 w-3 text-slate-300 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed">{projections.disclaimer}</p>
      </div>
    </div>
  );
}
