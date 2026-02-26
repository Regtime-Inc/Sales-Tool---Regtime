import { TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Minus } from 'lucide-react';
import type { OptimizerResult, UnitAllocation } from '../types/optimizer';

interface OptimizerResultsProps {
  result: OptimizerResult;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function sumAllocations(allocs: UnitAllocation[]) {
  return {
    units: allocs.reduce((s, a) => s + a.count, 0),
    sf: allocs.reduce((s, a) => s + a.totalSF, 0),
    monthlyRent: allocs.reduce((s, a) => s + a.count * a.monthlyRent, 0),
  };
}

export default function OptimizerResults({ result }: OptimizerResultsProps) {
  const marketAllocs = result.allocations.filter((a) => a.amiBand === 0);
  const affordAllocs = result.allocations.filter((a) => a.amiBand > 0);

  const sfConstraint = result.constraintSlack.find((cs) => cs.constraint.includes('Total SF'));
  const programConstraints = result.constraintSlack.filter(
    (cs) => !cs.constraint.includes('Total SF') && !(cs.required <= 0)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Units"
          value={result.totalUnits.toString()}
          sub={`${result.affordableUnitCount} affordable + ${result.marketUnitCount} market`}
        />
        <StatCard label="Total SF" value={result.totalSF.toLocaleString()} />
        <StatCard label="Total Monthly Rent" value={formatCurrency(result.totalMonthlyRent)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {result.blendedAmi > 0 && (
          <StatCard
            label="Blended AMI"
            value={`${result.blendedAmi}%`}
            sub="Weighted avg of affordable units"
            accent="teal"
          />
        )}
        <StatCard label="Annual Revenue" value={formatCurrency(result.annualRevenue)} />
        <StatCard
          label="ROI Proxy"
          value={formatPct(result.roiProxy)}
          accent={result.roiProxy > 0.06 ? 'green' : result.roiProxy > 0.04 ? 'amber' : 'red'}
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        {result.feasible ? (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-emerald-700 font-medium">All constraints satisfied</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-red-700 font-medium">Some constraints violated</span>
          </>
        )}
      </div>

      {sfConstraint && (
        <SfUtilizationBar used={sfConstraint.actual} total={sfConstraint.required} />
      )}

      {marketAllocs.length > 0 && (
        <AllocationTable
          title="Market-Rate Units"
          allocations={marketAllocs}
          totals={sumAllocations(marketAllocs)}
          rentFootnote="Estimated free market rents"
        />
      )}

      {affordAllocs.length > 0 && (
        <AllocationTable
          title="Affordable Units (by AMI Band)"
          allocations={affordAllocs}
          totals={sumAllocations(affordAllocs)}
          blendedAmi={result.blendedAmi}
          rentFootnote="Per HPD 2025 AMI rent limits"
        />
      )}

      {programConstraints.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Program Constraints
          </p>
          <div className="space-y-1.5">
            {programConstraints.map((cs, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 truncate mr-2">{cs.constraint}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cs.slack >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {cs.slack >= 0 ? '+' : ''}{typeof cs.required === 'number' && cs.required <= 1
                      ? `${(cs.slack * 100).toFixed(1)}pp`
                      : `${Math.round(cs.slack)} SF`}
                  </span>
                  {cs.binding && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-medium">
                      BINDING
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.sensitivity.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Sensitivity Analysis
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left py-1 pr-2 font-medium">Scenario</th>
                <th className="text-right py-1 px-2 font-medium">ROI</th>
                <th className="text-right py-1 px-2 font-medium">Delta</th>
                <th className="text-right py-1 pl-2 font-medium">Feasible</th>
              </tr>
            </thead>
            <tbody>
              {result.sensitivity.map((s, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-1.5 pr-2 text-slate-600">{s.change}</td>
                  <td className="py-1.5 px-2 text-right font-medium text-slate-700">
                    {formatPct(s.newROI)}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <span className={`inline-flex items-center gap-0.5 ${
                      s.roiDelta > 0 ? 'text-emerald-600' : s.roiDelta < 0 ? 'text-red-600' : 'text-slate-400'
                    }`}>
                      {s.roiDelta > 0 ? <TrendingUp className="h-3 w-3" /> :
                       s.roiDelta < 0 ? <TrendingDown className="h-3 w-3" /> :
                       <Minus className="h-3 w-3" />}
                      {s.roiDelta > 0 ? '+' : ''}{(s.roiDelta * 100).toFixed(2)}pp
                    </span>
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <FeasibilityPill feasible={s.stillFeasible} newROI={s.newROI} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeasibilityPill({ feasible, newROI }: { feasible: boolean; newROI: number }) {
  if (!feasible) {
    return (
      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
        <AlertTriangle className="h-2.5 w-2.5" /> No
      </span>
    );
  }
  if (newROI < 0.04) {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
        <AlertTriangle className="h-2.5 w-2.5" /> Marginal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
      <CheckCircle className="h-2.5 w-2.5" /> Yes
    </span>
  );
}

function SfUtilizationBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="bg-white border border-slate-100 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-500">SF Utilization</span>
        <span className="text-slate-700 font-medium">
          {used.toLocaleString()} / {total.toLocaleString()} SF ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 95 ? 'bg-emerald-500' : pct > 80 ? 'bg-sky-500' : 'bg-slate-300'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  const colors = accent === 'green' ? 'text-emerald-700'
    : accent === 'red' ? 'text-red-700'
    : accent === 'amber' ? 'text-amber-700'
    : accent === 'teal' ? 'text-teal-700'
    : 'text-slate-800';
  return (
    <div className="bg-white border border-slate-100 rounded-lg px-3 py-2">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${colors} mt-0.5`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

interface AllocationTableProps {
  title: string;
  allocations: UnitAllocation[];
  totals: { units: number; sf: number; monthlyRent: number };
  blendedAmi?: number;
  rentFootnote?: string;
}

function AllocationTable({ title, allocations, totals, blendedAmi, rentFootnote }: AllocationTableProps) {
  const isAffordable = allocations[0]?.amiBand > 0;
  const avgRent = totals.units > 0 ? Math.round(totals.monthlyRent / totals.units) : 0;

  return (
    <div className="bg-white border border-slate-100 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100">
            <th className="text-left py-1 pr-2 font-medium">Type</th>
            {isAffordable && <th className="text-right py-1 px-2 font-medium">AMI</th>}
            {isAffordable && <th className="text-left py-1 px-2 font-medium">Program</th>}
            <th className="text-right py-1 px-2 font-medium">Units</th>
            <th className="text-right py-1 px-2 font-medium">Avg SF</th>
            <th className="text-right py-1 px-2 font-medium">Total SF</th>
            <th className="text-right py-1 pl-2 font-medium">{isAffordable ? 'Rent/mo' : 'Est. Rent/mo'}</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((a, i) => (
            <tr key={i} className="border-b border-slate-50">
              <td className="py-1.5 pr-2 text-slate-600">{a.unitType}</td>
              {isAffordable && <td className="py-1.5 px-2 text-right text-slate-500">{a.amiBand}%</td>}
              {isAffordable && (
                <td className="py-1.5 px-2 text-left text-[10px] text-slate-400">
                  {(a.programTags ?? []).join(' + ') || '--'}
                </td>
              )}
              <td className="py-1.5 px-2 text-right font-medium text-slate-700">{a.count}</td>
              <td className="py-1.5 px-2 text-right text-slate-600">{a.avgSF.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right text-slate-600">{a.totalSF.toLocaleString()}</td>
              <td className="py-1.5 pl-2 text-right text-slate-700">${a.monthlyRent.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50/50">
            <td className="py-1.5 pr-2 font-semibold text-slate-700">Total</td>
            {isAffordable && (
              <td className="py-1.5 px-2 text-right font-medium text-teal-700">
                {blendedAmi ? `${blendedAmi}%` : ''}
              </td>
            )}
            {isAffordable && <td className="py-1.5 px-2" />}
            <td className="py-1.5 px-2 text-right font-bold text-slate-800">{totals.units}</td>
            <td className="py-1.5 px-2 text-right text-slate-500">--</td>
            <td className="py-1.5 px-2 text-right font-semibold text-slate-700">{totals.sf.toLocaleString()}</td>
            <td className="py-1.5 pl-2 text-right font-semibold text-slate-700">${avgRent.toLocaleString()}<span className="text-[9px] text-slate-400 ml-0.5">avg</span></td>
          </tr>
        </tbody>
      </table>
      {rentFootnote && (
        <p className="text-[9px] text-slate-400 mt-1.5 italic">{rentFootnote}</p>
      )}
    </div>
  );
}
