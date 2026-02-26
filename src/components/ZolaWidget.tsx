import { useState, useRef, useCallback } from 'react';
import { Globe, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';

interface ZolaWidgetProps {
  borough: string;
  block: string;
  lot: string;
}

export default function ZolaWidget({ borough, block, lot }: ZolaWidgetProps) {
  const [open, setOpen] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const boro = parseInt(borough);
  const blk = parseInt(block);
  const lt = parseInt(lot);
  const zolaUrl = `https://zola.planning.nyc.gov/lot/${boro}/${blk}/${lt}`;

  const handleIframeError = useCallback(() => {
    setIframeError(true);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
            <Globe className="h-4 w-4 text-sky-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">ZoLa - Zoning & Land Use</p>
            <p className="text-[11px] text-slate-400">
              NYC DCP interactive zoning map
            </p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-50">
          {!iframeError ? (
            <div className="relative">
              <iframe
                ref={iframeRef}
                src={zolaUrl}
                title="ZoLa Zoning Map"
                className="w-full border-0 rounded-b-xl"
                style={{ height: '500px' }}
                onError={handleIframeError}
                sandbox="allow-scripts allow-same-origin allow-popups"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-1">
                Interactive map cannot be embedded here.
              </p>
              <p className="text-xs text-slate-400 mb-4">
                ZoLa restricts iframe embedding. Open the map in a new tab instead.
              </p>
            </div>
          )}

          <div className="px-5 py-3 bg-slate-50 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              BBL {borough}-{blk}-{lt}
            </p>
            <a
              href={zolaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
            >
              Open in ZoLa
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
