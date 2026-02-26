import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { TraceEntry } from '../types/analysis';

interface TraceLogProps {
  trace: TraceEntry[];
}

const icons = {
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />,
  error: <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />,
};

export default function TraceLog({ trace }: TraceLogProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Analysis Trace ({trace.length} steps)
      </button>
      {open && (
        <div className="mt-3 bg-slate-900 rounded-xl p-4 space-y-1.5 font-mono text-xs overflow-x-auto">
          {trace.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              {icons[t.status]}
              <span className="text-slate-400 w-16 flex-shrink-0">{t.step}</span>
              <span className={
                t.status === 'success' ? 'text-emerald-400' :
                t.status === 'warning' ? 'text-amber-400' :
                'text-red-400'
              }>{t.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
