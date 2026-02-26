import type { ScoreBreakdown } from '../types/analysis';

interface ScoredIndicatorsProps {
  breakdown: ScoreBreakdown[];
}

export default function ScoredIndicators({ breakdown }: ScoredIndicatorsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Score Breakdown</h3>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
        {breakdown.map((item, i) => {
          const isPenalty = item.score < 0;
          const isOverlay = item.category === 'Rental Overlay';
          const pct = item.maxScore > 0 ? Math.max(0, (item.score / item.maxScore) * 100) : 0;
          const penaltyPct = isPenalty ? Math.min(Math.abs(item.score) * 8, 100) : 0;

          return (
            <div key={i} className={`p-4 ${isOverlay ? 'bg-sky-50/40' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${isPenalty ? 'text-red-600' : isOverlay ? 'text-sky-700' : 'text-slate-700'}`}>
                  {item.category}
                </span>
                <span className={`text-sm font-bold ${isPenalty ? 'text-red-600' : isOverlay ? 'text-sky-700' : 'text-slate-800'}`}>
                  {item.score}<span className="text-slate-400 font-normal">/{item.maxScore}</span>
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                {isPenalty ? (
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-700 ease-out"
                    style={{ width: `${penaltyPct}%` }}
                  />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${isOverlay ? 'bg-sky-500' : 'bg-teal-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <p className="text-xs text-slate-400">{item.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
