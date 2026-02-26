import { BarChart3, Home, Building, ShieldCheck, Sparkles } from 'lucide-react';
import type { UnitMixExtraction, UnitMixOverrides } from '../types/pdf';

interface UnitMixSummaryProps {
  unitMix: UnitMixExtraction;
  overrides?: UnitMixOverrides | null;
}

const BED_TYPE_LABELS: Record<string, string> = {
  STUDIO: 'Studio',
  '1BR': '1 BR',
  '2BR': '2 BR',
  '3BR': '3 BR',
  '4BR_PLUS': '4+ BR',
  UNKNOWN: 'Unknown',
};

const ALLOC_LABELS: Record<string, string> = {
  MARKET: 'Market',
  AFFORDABLE: 'Affordable',
  MIH_RESTRICTED: 'MIH/Restricted',
  UNKNOWN: 'Unclassified',
};

const BED_COLORS: Record<string, string> = {
  STUDIO: 'bg-sky-500',
  '1BR': 'bg-teal-500',
  '2BR': 'bg-emerald-500',
  '3BR': 'bg-amber-500',
  '4BR_PLUS': 'bg-rose-500',
  UNKNOWN: 'bg-slate-300',
};

const ALLOC_COLORS: Record<string, string> = {
  MARKET: 'bg-slate-500',
  AFFORDABLE: 'bg-teal-500',
  MIH_RESTRICTED: 'bg-sky-500',
  UNKNOWN: 'bg-slate-300',
};

function DistributionBar({
  data,
  labels,
  colors,
  total,
}: {
  data: Record<string, number>;
  labels: Record<string, string>;
  colors: Record<string, string>;
  total: number;
}) {
  if (total === 0) return null;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden">
        {entries.map(([key, count]) => (
          <div
            key={key}
            className={`${colors[key] || 'bg-slate-300'} transition-all`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${labels[key] || key}: ${count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${colors[key] || 'bg-slate-300'}`} />
            <span className="text-[10px] text-slate-500">
              {labels[key] || key}: {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function scaleBreakdown(data: Record<string, number>, target: number): Record<string, number> {
  const sum = Object.values(data).reduce((a, b) => a + b, 0);
  if (sum === 0 || sum === target) return data;
  const scale = target / sum;
  const keys = Object.keys(data);
  const scaled: Record<string, number> = {};
  let running = 0;
  for (const k of keys) {
    const v = Math.round(data[k] * scale);
    scaled[k] = v;
    running += v;
  }
  if (keys.length > 0 && running !== target) {
    scaled[keys[0]] += target - running;
  }
  return scaled;
}

function applyOverrides(
  totals: UnitMixExtraction['totals'],
  overrides: UnitMixOverrides,
): UnitMixExtraction['totals'] {
  const byBed = { ...totals.byBedroomType };
  if (overrides.studio != null) byBed['STUDIO'] = overrides.studio;
  if (overrides.br1 != null) byBed['1BR'] = overrides.br1;
  if (overrides.br2 != null) byBed['2BR'] = overrides.br2;
  if (overrides.br3 != null) byBed['3BR'] = overrides.br3;
  if (overrides.br4plus != null) byBed['4BR_PLUS'] = overrides.br4plus;

  const byAlloc = { ...totals.byAllocation };
  if (overrides.affordableUnits != null) {
    const existing = (byAlloc['AFFORDABLE'] ?? 0) + (byAlloc['MIH_RESTRICTED'] ?? 0);
    if (existing > 0 && byAlloc['MIH_RESTRICTED']) {
      const ratio = (byAlloc['MIH_RESTRICTED'] ?? 0) / existing;
      byAlloc['MIH_RESTRICTED'] = Math.round(overrides.affordableUnits * ratio);
      byAlloc['AFFORDABLE'] = overrides.affordableUnits - byAlloc['MIH_RESTRICTED'];
    } else {
      byAlloc['AFFORDABLE'] = overrides.affordableUnits;
    }
  }
  if (overrides.marketUnits != null) byAlloc['MARKET'] = overrides.marketUnits;

  return {
    ...totals,
    totalUnits: overrides.totalUnits ?? totals.totalUnits,
    byBedroomType: byBed,
    byAllocation: byAlloc,
  };
}

export default function UnitMixSummary({ unitMix, overrides }: UnitMixSummaryProps) {
  const { confidence } = unitMix;
  const hasOverrides = overrides != null && Object.keys(overrides).length > 0;
  const totals = hasOverrides ? applyOverrides(unitMix.totals, overrides!) : unitMix.totals;

  const bedData = scaleBreakdown(totals.byBedroomType, totals.totalUnits);
  const allocData = scaleBreakdown(totals.byAllocation, totals.totalUnits);

  const qualityLabel =
    confidence.overall >= 0.75
      ? 'Text-based (high confidence)'
      : confidence.overall >= 0.45
        ? 'OCR-based (medium confidence)'
        : 'Needs review (low confidence)';

  const qualityColor =
    confidence.overall >= 0.75
      ? 'bg-emerald-100 text-emerald-700'
      : confidence.overall >= 0.45
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';

  const affordableCount =
    (allocData['AFFORDABLE'] || 0) +
    (allocData['MIH_RESTRICTED'] || 0);
  const marketCount = allocData['MARKET'] || 0;

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          <h4 className="text-sm font-semibold text-slate-700">Unit Mix Summary</h4>
          {hasOverrides && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600">
              <Sparkles className="h-2.5 w-2.5" /> AI Override
            </span>
          )}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${qualityColor}`}>
          {qualityLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <Home className="h-4 w-4 text-slate-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">{totals.totalUnits}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Units</p>
        </div>
        <div className="bg-teal-50 rounded-lg p-3 text-center">
          <ShieldCheck className="h-4 w-4 text-teal-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-teal-700">{affordableCount}</p>
          <p className="text-[10px] text-teal-500 uppercase tracking-wide">Affordable</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <Building className="h-4 w-4 text-slate-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">{marketCount}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Market</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">
            By Bedroom Type
          </p>
          <DistributionBar
            data={bedData}
            labels={BED_TYPE_LABELS}
            colors={BED_COLORS}
            total={totals.totalUnits}
          />
        </div>

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">
            By Allocation
          </p>
          <DistributionBar
            data={allocData}
            labels={ALLOC_LABELS}
            colors={ALLOC_COLORS}
            total={totals.totalUnits}
          />
        </div>

        {totals.byAmiBand && Object.keys(totals.byAmiBand).length > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">
              By AMI Band
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(totals.byAmiBand)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([band, count]) => (
                  <div
                    key={band}
                    className="bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5 text-center"
                  >
                    <p className="text-xs font-bold text-sky-700">{count}</p>
                    <p className="text-[10px] text-sky-500">{band} AMI</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {confidence.warnings.length > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {confidence.warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-amber-700">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
