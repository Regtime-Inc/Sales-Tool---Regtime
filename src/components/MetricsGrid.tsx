import { Users } from 'lucide-react';
import type { Metrics, PlutoData } from '../types/analysis';

interface MetricsGridProps {
  metrics: Metrics | null;
  pluto: PlutoData | null;
  onSelectOwner?: (name: string) => void;
}

function MetricCard({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  const interactive = !!onClick && value !== 'N/A';
  return (
    <div
      className={`bg-white rounded-lg p-4 border border-slate-100 shadow-sm ${interactive ? 'cursor-pointer hover:border-teal-300 hover:shadow-md transition-all group' : ''}`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
    >
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-xl font-bold ${interactive ? 'text-teal-700 group-hover:text-teal-800' : 'text-slate-800'}`}>{value}</p>
        {interactive && <Users className="h-3.5 w-3.5 text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function MetricsGrid({ metrics, pluto, onSelectOwner }: MetricsGridProps) {
  if (!metrics && !pluto) {
    return (
      <div className="bg-slate-50 rounded-xl p-6 text-center text-slate-400">
        No PLUTO data available for metric calculations
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Zoning & FAR Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {metrics && (
          <>
            <MetricCard label="Built FAR" value={String(metrics.builtFarCalc)} sub="Actual" />
            <MetricCard label="Max FAR" value={String(metrics.maxAllowableFar)} sub="Allowable" />
            <MetricCard label="Max Buildable SF" value={metrics.maxBuildableSf.toLocaleString()} />
            <MetricCard label="Buildable Slack SF" value={metrics.buildableSlackSf.toLocaleString()} />
            <MetricCard
              label="Underbuilt Ratio"
              value={metrics.underbuiltRatio >= 999 ? 'Vacant' : `${metrics.underbuiltRatio}x`}
            />
            {metrics.ppsf !== null && <MetricCard label="PPSF" value={`$${metrics.ppsf.toLocaleString()}`} sub="Price / Existing SF" />}
            {metrics.ppbsf !== null && <MetricCard label="PPBSF" value={`$${metrics.ppbsf.toLocaleString()}`} sub="Price / Buildable SF" />}
          </>
        )}
        {pluto && (
          <>
            <MetricCard label="Zoning" value={pluto.zonedist1 || 'N/A'} />
            <MetricCard label="Lot Area" value={`${pluto.lotarea.toLocaleString()} SF`} />
            <MetricCard label="Building Area" value={`${pluto.bldgarea.toLocaleString()} SF`} />
            <MetricCard label="Res FAR" value={String(pluto.residfar)} sub="Residential" />
            <MetricCard label="Comm FAR" value={String(pluto.commfar)} sub="Commercial" />
            <MetricCard label="Facil FAR" value={String(pluto.facilfar)} sub="Facility" />
            <MetricCard label="Floors" value={String(pluto.numfloors)} />
            <MetricCard label="Year Built" value={pluto.yearbuilt ? String(pluto.yearbuilt) : 'N/A'} />
            <MetricCard label="Res Units" value={String(pluto.unitsres)} />
            <MetricCard label="Bldg Class" value={pluto.bldgclass || 'N/A'} />
            <MetricCard
              label="Owner"
              value={pluto.ownername || 'N/A'}
              onClick={pluto.ownername ? () => onSelectOwner?.(pluto.ownername!) : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
