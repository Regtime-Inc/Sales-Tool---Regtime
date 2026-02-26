import type { Scoring } from '../types/analysis';

interface ScoreGaugeProps {
  scoring: Scoring;
}

const classColors: Record<string, { bg: string; text: string; bar: string }> = {
  Low: { bg: 'bg-slate-100', text: 'text-slate-600', bar: 'bg-slate-400' },
  Moderate: { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500' },
  High: { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-500' },
  'Very High': { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
};

export default function ScoreGauge({ scoring }: ScoreGaugeProps) {
  const colors = classColors[scoring.classification] || classColors.Low;
  const pct = Math.min((scoring.totalScore / 130) * 100, 100);

  return (
    <div className={`rounded-xl p-6 ${colors.bg} border border-opacity-20`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Development Score</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-4xl font-bold ${colors.text}`}>{scoring.totalScore}</span>
            <span className="text-slate-400 text-lg">/130</span>
          </div>
        </div>
        <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${colors.text} ${colors.bg} border ${colors.text.replace('text-', 'border-')}/30`}>
          {scoring.classification}
        </span>
      </div>

      <div className="w-full h-3 bg-white/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.bar} transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500">Dev Score</p>
          <p className={`text-lg font-semibold ${colors.text}`}>{scoring.devScore}<span className="text-slate-400 text-sm">/100</span></p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Rental Overlay</p>
          <p className={`text-lg font-semibold ${colors.text}`}>{scoring.rentalOverlay}<span className="text-slate-400 text-sm">/30</span></p>
        </div>
      </div>
    </div>
  );
}
