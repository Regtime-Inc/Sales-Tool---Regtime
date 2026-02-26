import { ArrowRight } from 'lucide-react';

interface NextActionsProps {
  actions: string[];
}

export default function NextActions({ actions }: NextActionsProps) {
  if (!actions.length) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Recommended Next Steps</h3>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
        {actions.map((action, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center">
              <ArrowRight className="h-3 w-3 text-teal-600" />
            </div>
            <span className="text-sm text-slate-700">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
