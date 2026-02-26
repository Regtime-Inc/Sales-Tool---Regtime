import { useState, useCallback } from 'react';
import { ExternalLink, ClipboardPaste, Camera, FileCode } from 'lucide-react';
import PasteMode from './acrisAssist/PasteMode';
import ScreenshotMode from './acrisAssist/ScreenshotMode';
import HtmlUploadMode from './acrisAssist/HtmlUploadMode';
import ResultsTable from './acrisAssist/ResultsTable';
import type { ParsedTxn, AssistMode, AssistIngestionSource, PipelineMeta } from '../types/acrisAssist';

const ACRIS_URL = 'https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentType';

interface AcrisAssistPageProps {
  onAnalyze?: (input: string) => void;
  onDataIngested?: () => void;
}

export default function AcrisAssistPage({ onAnalyze: _onAnalyze, onDataIngested }: AcrisAssistPageProps) {
  const [mode, setMode] = useState<AssistMode>('html');
  const [transactions, setTransactions] = useState<ParsedTxn[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pipelineMeta, setPipelineMeta] = useState<PipelineMeta | null>(null);

  const handleResults = useCallback((txns: ParsedTxn[], warns: string[], meta?: PipelineMeta) => {
    setTransactions((prev) => {
      const seen = new Set(prev.map((t) => t.dedupeKey));
      const merged = [...prev];
      let dupes = 0;
      for (const txn of txns) {
        if (seen.has(txn.dedupeKey)) { dupes++; continue; }
        seen.add(txn.dedupeKey);
        merged.push(txn);
      }
      if (dupes > 0) {
        warns.push(`${dupes} duplicate(s) merged with existing results`);
      }
      return merged;
    });
    setWarnings(warns);
    if (meta) setPipelineMeta(meta);
  }, []);

  const source: AssistIngestionSource = mode === 'html' ? 'html_upload' : mode === 'paste' ? 'manual_paste' : 'screen_capture';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">ACRIS Assist</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Browse ACRIS manually, then paste or capture results here for parsing
          </p>
        </div>
        <a
          href={ACRIS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium
            hover:bg-slate-900 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open ACRIS Search (New Tab)
        </a>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setMode('html')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
              mode === 'html'
                ? 'text-teal-700 bg-white'
                : 'text-slate-500 bg-slate-50 hover:text-slate-700'
            }`}
          >
            <FileCode className="h-4 w-4" />
            HTML Upload
            {mode === 'html' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-700" />
            )}
          </button>
          <button
            onClick={() => setMode('paste')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
              mode === 'paste'
                ? 'text-teal-700 bg-white'
                : 'text-slate-500 bg-slate-50 hover:text-slate-700'
            }`}
          >
            <ClipboardPaste className="h-4 w-4" />
            Paste Mode
            {mode === 'paste' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-700" />
            )}
          </button>
          <button
            onClick={() => setMode('capture')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
              mode === 'capture'
                ? 'text-teal-700 bg-white'
                : 'text-slate-500 bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Camera className="h-4 w-4" />
            Screenshot Mode
            {mode === 'capture' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-700" />
            )}
          </button>
        </div>

        <div className="p-5">
          {mode === 'html' && <HtmlUploadMode onResults={handleResults} />}
          {mode === 'paste' && <PasteMode onResults={handleResults} />}
          {mode === 'capture' && <ScreenshotMode onResults={handleResults} />}
        </div>
      </div>

      <ResultsTable
        transactions={transactions}
        warnings={warnings}
        source={source}
        pipelineMeta={pipelineMeta}
        onTransactionsChange={setTransactions}
        onDataSaved={onDataIngested}
      />

      {transactions.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => { setTransactions([]); setWarnings([]); setPipelineMeta(null); }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear all results
          </button>
        </div>
      )}
    </div>
  );
}
