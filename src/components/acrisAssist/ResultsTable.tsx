import { useState } from 'react';
import { Copy, Check, Save, Loader2, AlertCircle, ChevronDown, ChevronUp, ShieldCheck, Eye } from 'lucide-react';
import { upsertAcrisAssistDocs } from '../../lib/acrisAssist/api';
import type { UpsertProgress } from '../../lib/acrisAssist/api';
import type { ParsedTxn, AssistIngestionSource, PipelineMeta } from '../../types/acrisAssist';

interface ResultsTableProps {
  transactions: ParsedTxn[];
  warnings: string[];
  source: AssistIngestionSource;
  pipelineMeta?: PipelineMeta | null;
  onTransactionsChange: (txns: ParsedTxn[]) => void;
  onDataSaved?: () => void;
}

function PipelineBadge({ meta }: { meta: PipelineMeta }) {
  const isDocAi = meta.pipeline === 'docai_plus_llm';
  const confidence = meta.ocrConfidence;

  let confidenceLabel: string;
  let confidenceColor: string;
  if (confidence === null) {
    confidenceLabel = 'N/A';
    confidenceColor = 'text-slate-400';
  } else if (confidence >= 0.9) {
    confidenceLabel = 'High';
    confidenceColor = 'text-emerald-600';
  } else if (confidence >= 0.75) {
    confidenceLabel = 'Medium';
    confidenceColor = 'text-amber-600';
  } else {
    confidenceLabel = 'Low';
    confidenceColor = 'text-red-600';
  }

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
        isDocAi
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      }`}>
        {isDocAi ? <ShieldCheck className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {isDocAi ? 'Doc AI + LLM' : 'Vision Only'}
      </span>
      {confidence !== null && (
        <span className={`font-medium ${confidenceColor}`}>
          OCR: {(confidence * 100).toFixed(0)}% ({confidenceLabel})
        </span>
      )}
    </div>
  );
}

function RawOcrPanel({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-medium text-slate-600"
      >
        <span>Raw OCR Output</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] text-slate-500 bg-white overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}

const PHASE_LABELS: Record<UpsertProgress['phase'], string> = {
  preparing: 'Preparing rows...',
  checking: 'Checking for duplicates...',
  saving: 'Saving to database...',
  backfilling: 'Backfilling sales data...',
  done: 'Done',
};

export default function ResultsTable({ transactions, warnings, source, pipelineMeta, onTransactionsChange, onDataSaved }: ResultsTableProps) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<UpsertProgress | null>(null);
  const [saveResult, setSaveResult] = useState<{ ingested: number; skipped: number; errors: string[] } | null>(null);

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(transactions, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    setProgress(null);
    try {
      const result = await upsertAcrisAssistDocs(transactions, source, (p) => setProgress(p));
      setSaveResult(result);
      if (result.ingested > 0) {
        onDataSaved?.();
      }
    } catch (e) {
      setSaveResult({ ingested: 0, skipped: 0, errors: [e instanceof Error ? e.message : 'Save failed'] });
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const handleCellEdit = (idx: number, field: keyof ParsedTxn, value: string) => {
    const updated = [...transactions];
    updated[idx] = { ...updated[idx], [field]: value };
    onTransactionsChange(updated);
  };

  if (transactions.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-4 mt-6">
      {warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 space-y-1">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} parsed
              </span>
              {pipelineMeta && <PipelineBadge meta={pipelineMeta} />}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-300"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                  bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Saving...' : 'Save to DB'}
              </button>
            </div>
          </div>

          {saving && progress && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-600">{PHASE_LABELS[progress.phase]}</span>
                <span className="text-[10px] text-slate-400">
                  {progress.saved} saved, {progress.skipped} unchanged
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? Math.round(((progress.saved + progress.skipped) / progress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {saveResult && !saving && (
            <div className={`p-3 rounded-lg text-sm ${
              saveResult.errors.length > 0
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-green-50 border border-green-200 text-green-800'
            }`}>
              Saved {saveResult.ingested} of {transactions.length} transactions.
              {saveResult.skipped > 0 && (
                <span className="text-xs ml-1 opacity-75">
                  ({saveResult.skipped} unchanged, skipped)
                </span>
              )}
              {saveResult.errors.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs">
                  {saveResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {saveResult.errors.length > 5 && (
                    <li>...and {saveResult.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {pipelineMeta?.rawOcrText && (
            <RawOcrPanel text={pipelineMeta.rawOcrText} />
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Type</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Borough</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Block</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Lot</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">CRFN</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Doc Date</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Recorded</th>
                  <th className="px-2 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Pg</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Party 1</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Party 2</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Party 3</th>
                  <th className="px-2 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, i) => (
                  <tr key={txn.dedupeKey} className="border-b border-slate-100 hover:bg-slate-50">
                    <EditableCell value={txn.docType ?? ''} onChange={(v) => handleCellEdit(i, 'docType', v)} />
                    <EditableCell value={txn.borough ?? ''} onChange={(v) => handleCellEdit(i, 'borough', v)} />
                    <EditableCell value={txn.block ?? ''} onChange={(v) => handleCellEdit(i, 'block', v)} />
                    <EditableCell value={txn.lot ?? ''} onChange={(v) => handleCellEdit(i, 'lot', v)} />
                    <EditableCell value={txn.crfn ?? ''} onChange={(v) => handleCellEdit(i, 'crfn', v)} />
                    <EditableCell value={txn.docDate ?? ''} onChange={(v) => handleCellEdit(i, 'docDate', v)} />
                    <EditableCell value={txn.recordedDate ?? ''} onChange={(v) => handleCellEdit(i, 'recordedDate', v)} />
                    <EditableCell value={txn.pages ?? ''} onChange={(v) => handleCellEdit(i, 'pages', v)} align="center" />
                    <EditableCell value={txn.party1 ?? ''} onChange={(v) => handleCellEdit(i, 'party1', v)} />
                    <EditableCell value={txn.party2 ?? ''} onChange={(v) => handleCellEdit(i, 'party2', v)} />
                    <EditableCell value={txn.party3 ?? ''} onChange={(v) => handleCellEdit(i, 'party3', v)} />
                    <EditableCell
                      value={txn.amount ?? ''}
                      onChange={(v) => handleCellEdit(i, 'amount', v)}
                      align="right"
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const ALIGN_CLASS: Record<string, string> = {
  left: '',
  right: 'text-right',
  center: 'text-center',
};

function EditableCell({
  value,
  onChange,
  align = 'left',
}: {
  value: string;
  onChange: (v: string) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <td className="px-1 py-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
          className={`w-full px-2 py-0.5 text-xs border border-teal-400 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 ${ALIGN_CLASS[align]}`}
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`px-2 py-2 text-slate-700 cursor-pointer hover:bg-teal-50 transition-colors truncate max-w-[150px] ${
        ALIGN_CLASS[align]
      } ${!value ? 'text-slate-300 italic' : ''}`}
      title={value || 'Click to edit'}
    >
      {value || '-'}
    </td>
  );
}
