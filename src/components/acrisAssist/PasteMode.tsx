import { useState } from 'react';
import { ClipboardPaste, Loader2 } from 'lucide-react';
import { parseClipboard } from '../../lib/acrisAssist/parseClipboard';
import type { ParsedTxn } from '../../types/acrisAssist';

interface PasteModeProps {
  onResults: (txns: ParsedTxn[], warnings: string[]) => void;
}

export default function PasteMode({ onResults }: PasteModeProps) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);

  const handleParse = () => {
    setParsing(true);
    try {
      const result = parseClipboard(text);
      onResults(result.transactions, result.warnings);
    } finally {
      setParsing(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) setText(clipText);
    } catch {
      // clipboard API may be blocked
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste copied ACRIS search results here (table rows, TSV, or space-separated columns)..."
          className="w-full h-56 p-4 pr-12 border border-slate-300 rounded-lg text-sm font-mono bg-white
            focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y placeholder:text-slate-400"
        />
        <button
          onClick={handlePasteFromClipboard}
          title="Paste from clipboard"
          className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleParse}
          disabled={!text.trim() || parsing}
          className="flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium
            hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
          Parse Clipboard
        </button>
        {text.trim() && (
          <span className="text-xs text-slate-400">
            {text.split('\n').filter((l) => l.trim()).length} lines
          </span>
        )}
      </div>
    </div>
  );
}
