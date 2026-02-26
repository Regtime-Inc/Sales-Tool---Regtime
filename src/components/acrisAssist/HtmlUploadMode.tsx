import { useState, useCallback, useRef } from 'react';
import { FileText, Upload, CheckCircle, AlertTriangle, X, FileUp } from 'lucide-react';
import { parseAcrisHtml } from '../../lib/acrisAssist/parseHtml';
import type { ParsedTxn, PipelineMeta } from '../../types/acrisAssist';

interface HtmlUploadModeProps {
  onResults: (txns: ParsedTxn[], warnings: string[], meta?: PipelineMeta) => void;
}

interface UploadedFile {
  id: string;
  name: string;
  rowCount: number;
  status: 'success' | 'empty';
}

export default function HtmlUploadMode({ onResults }: HtmlUploadModeProps) {
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const text = await file.text();
    const result = parseAcrisHtml(text);
    const entry: UploadedFile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      rowCount: result.transactions.length,
      status: result.transactions.length > 0 ? 'success' : 'empty',
    };
    setUploads((prev) => [...prev, entry]);
    onResults(result.transactions, result.warnings);
    return entry;
  }, [onResults]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setProcessing(true);
    const fileArray = Array.from(files).filter(
      (f) => f.name.endsWith('.html') || f.name.endsWith('.htm') || f.type === 'text/html'
    );

    if (fileArray.length === 0) {
      onResults([], ['No .html or .htm files found in the selection']);
      setProcessing(false);
      return;
    }

    for (const file of fileArray) {
      await processFile(file);
    }
    setProcessing(false);
  }, [processFile, onResults]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleFiles]);

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const totalRows = uploads.reduce((sum, u) => sum + u.rowCount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-medium text-slate-700">How to use:</span>{' '}
          Open the{' '}
          <a
            href="https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentType"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
          >
            ACRIS search page
          </a>
          , run your search, then save the results page as an HTML file
          (Ctrl+S / Cmd+S). Upload the saved HTML file below.
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-200 text-center ${
          dragOver
            ? 'border-teal-500 bg-teal-50/60'
            : 'border-slate-300 bg-white hover:border-teal-400 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            dragOver ? 'bg-teal-100' : 'bg-slate-100'
          }`}>
            {processing ? (
              <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileUp className={`h-6 w-6 ${dragOver ? 'text-teal-600' : 'text-slate-400'}`} />
            )}
          </div>
          <div>
            <p className={`text-sm font-medium ${dragOver ? 'text-teal-700' : 'text-slate-600'}`}>
              {processing ? 'Processing...' : 'Drop ACRIS HTML files here'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              or click to browse -- accepts .html and .htm files
            </p>
          </div>
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Uploaded Files
            </span>
            <span className="text-xs text-slate-400">
              {totalRows} total row{totalRows !== 1 ? 's' : ''} extracted
            </span>
          </div>
          <div className="space-y-1.5">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg group"
              >
                <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{u.name}</span>
                {u.status === 'success' ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium flex-shrink-0">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {u.rowCount} rows
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium flex-shrink-0">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No data found
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeUpload(u.id); }}
                  className="p-0.5 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploads.length === 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-sky-50/50 border border-sky-100 rounded-lg">
          <Upload className="h-4 w-4 text-sky-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-sky-700 leading-relaxed">
            <p className="font-medium mb-1">Supported format</p>
            <p className="text-sky-600">
              ACRIS "Search Results By Document Type" pages saved as HTML. Each file can contain up to 99 rows.
              Upload multiple files to combine results from different searches.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
