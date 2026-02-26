import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera, Upload, Loader2, X, CheckCircle2, AlertCircle,
  ImagePlus, RotateCcw, AlertTriangle, Eye, ShieldCheck,
} from 'lucide-react';
import { extractAcrisVision } from '../../lib/acrisAssist/api';
import type { ParsedTxn, PipelineMeta, VisionPipeline } from '../../types/acrisAssist';

type ScreenshotStatus = 'pending' | 'extracting' | 'done' | 'error' | 'docai_failed';

interface ScreenshotEntry {
  id: string;
  blob: Blob;
  previewUrl: string;
  status: ScreenshotStatus;
  errorMsg?: string;
  extractionStartedAt?: number;
  pipelineUsed?: VisionPipeline;
}

interface ScreenshotModeProps {
  onResults: (txns: ParsedTxn[], warnings: string[], meta?: PipelineMeta) => void;
}

let nextId = 0;

function createEntry(blob: Blob): ScreenshotEntry {
  return {
    id: `ss_${++nextId}_${Date.now()}`,
    blob,
    previewUrl: URL.createObjectURL(blob),
    status: 'pending',
  };
}

type ExtractionStage = 'ocr' | 'normalize' | 'finalize';

interface StageInfo {
  stage: ExtractionStage;
  label: string;
  shortLabel: string;
  elapsed: number;
}

function getStageInfo(startedAt: number): StageInfo {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 5) return { stage: 'ocr', label: 'Running OCR via Document AI', shortLabel: 'OCR', elapsed };
  if (elapsed < 30) return { stage: 'normalize', label: 'Normalizing with GPT-4o', shortLabel: 'Normalizing', elapsed };
  return { stage: 'finalize', label: 'Almost done...', shortLabel: 'Finishing', elapsed };
}

const STAGE_STEPS: { key: ExtractionStage; name: string }[] = [
  { key: 'ocr', name: 'OCR' },
  { key: 'normalize', name: 'Normalize' },
  { key: 'finalize', name: 'Finalize' },
];

function ExtractionProgressBanner({
  entry,
  batchInfo,
}: {
  entry: ScreenshotEntry;
  batchInfo?: { current: number; total: number } | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  if (!entry.extractionStartedAt) return null;

  const { stage, label, elapsed } = getStageInfo(entry.extractionStartedAt);
  const currentIdx = STAGE_STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="bg-slate-800 rounded-xl px-4 py-3 text-white">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
          <span className="text-sm font-medium">
            {batchInfo && batchInfo.total > 1
              ? `Processing screenshot ${batchInfo.current} of ${batchInfo.total}`
              : 'Processing screenshot'}
          </span>
        </div>
        <span className="text-xs text-slate-400 tabular-nums font-mono">{elapsed}s</span>
      </div>

      <div className="flex items-center gap-1">
        {STAGE_STEPS.map((step, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={step.key} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  isDone ? 'bg-teal-400' : isActive ? 'bg-teal-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <span
                className={`text-[10px] mt-1 block ${
                  isActive ? 'text-teal-300 font-medium' : isDone ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {isActive ? label : step.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThumbnailStageLabel({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const { shortLabel, elapsed } = getStageInfo(startedAt);

  return (
    <span className="text-xs text-amber-300 font-medium flex items-center gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {shortLabel}
      <span className="text-amber-400/60 tabular-nums text-[10px]">{elapsed}s</span>
    </span>
  );
}

export default function ScreenshotMode({ onResults }: ScreenshotModeProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [extractingAll, setExtractingAll] = useState(false);
  const [batchInfo, setBatchInfo] = useState<{ current: number; total: number } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fallbackPrompt, setFallbackPrompt] = useState<{ id: string; errorMsg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const addScreenshots = useCallback((blobs: Blob[]) => {
    const entries = blobs.map(createEntry);
    setScreenshots((prev) => [...prev, ...entries]);
    setGlobalError(null);
  }, []);

  const removeScreenshot = useCallback((id: string) => {
    setScreenshots((prev) => {
      const entry = prev.find((s) => s.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageBlobs: Blob[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) imageBlobs.push(blob);
        }
      }
      if (imageBlobs.length > 0) {
        e.preventDefault();
        addScreenshots(imageBlobs);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addScreenshots]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const blobs: Blob[] = [];
      const files = e.dataTransfer.files;
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) blobs.push(file);
      }
      if (blobs.length > 0) {
        addScreenshots(blobs);
      } else {
        setGlobalError('Only image files (PNG, JPEG, WebP) are accepted.');
      }
    },
    [addScreenshots],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const blobs: Blob[] = [];
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) blobs.push(file);
      }
      if (blobs.length > 0) addScreenshots(blobs);
      e.target.value = '';
    },
    [addScreenshots],
  );

  const markExtracting = useCallback((id: string) => {
    setScreenshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'extracting' as const, errorMsg: undefined, extractionStartedAt: Date.now() }
          : s,
      ),
    );
  }, []);

  const markDone = useCallback((id: string, pipeline?: VisionPipeline) => {
    setScreenshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'done' as const, pipelineUsed: pipeline, extractionStartedAt: undefined }
          : s,
      ),
    );
  }, []);

  const markError = useCallback((id: string, msg: string) => {
    setScreenshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'error' as const, errorMsg: msg, extractionStartedAt: undefined }
          : s,
      ),
    );
  }, []);

  const markDocAiFailed = useCallback((id: string, msg: string) => {
    setScreenshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'docai_failed' as const, errorMsg: msg, extractionStartedAt: undefined }
          : s,
      ),
    );
  }, []);

  const runExtraction = useCallback(
    async (id: string, forceVisionOnly: boolean) => {
      markExtracting(id);

      const entry = screenshots.find((s) => s.id === id);
      if (!entry) return;

      try {
        const result = await extractAcrisVision(entry.blob, { forceVisionOnly });

        if (result.docAiFailed && !forceVisionOnly && result.transactions.length === 0) {
          const docAiMsg =
            result.warnings.find((w) => w.startsWith('Document AI issue:')) ||
            'Document AI OCR unavailable';
          markDocAiFailed(id, docAiMsg);
          setFallbackPrompt({ id, errorMsg: docAiMsg });
          return;
        }

        markDone(id, result.pipelineMeta?.pipeline);
        onResults(result.transactions, result.warnings, result.pipelineMeta);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Vision extraction failed';
        markError(id, msg);
      }
    },
    [screenshots, onResults, markExtracting, markDone, markError, markDocAiFailed],
  );

  const extractSingle = useCallback(
    (id: string) => runExtraction(id, false),
    [runExtraction],
  );

  const extractWithVisionFallback = useCallback(
    (id: string) => {
      setFallbackPrompt(null);
      runExtraction(id, true);
    },
    [runExtraction],
  );

  const dismissFallback = useCallback((id: string) => {
    setFallbackPrompt(null);
    setScreenshots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'pending' as const, errorMsg: undefined } : s)),
    );
  }, []);

  const extractAll = useCallback(async () => {
    const pending = screenshots.filter((s) => s.status === 'pending' || s.status === 'error');
    if (pending.length === 0) return;

    setExtractingAll(true);
    const total = pending.length;

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];
      setBatchInfo({ current: i + 1, total });
      markExtracting(entry.id);

      try {
        const result = await extractAcrisVision(entry.blob);

        if (result.docAiFailed && result.transactions.length > 0) {
          markDone(entry.id, result.pipelineMeta?.pipeline);
          onResults(result.transactions, result.warnings, result.pipelineMeta);
        } else if (result.docAiFailed && result.transactions.length === 0) {
          const fallbackResult = await extractAcrisVision(entry.blob, { forceVisionOnly: true });
          markDone(entry.id, fallbackResult.pipelineMeta?.pipeline);
          onResults(fallbackResult.transactions, fallbackResult.warnings, fallbackResult.pipelineMeta);
        } else {
          markDone(entry.id, result.pipelineMeta?.pipeline);
          onResults(result.transactions, result.warnings, result.pipelineMeta);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Vision extraction failed';
        markError(entry.id, msg);
      }
    }
    setExtractingAll(false);
    setBatchInfo(null);
  }, [screenshots, onResults, markExtracting, markDone, markError]);

  const extractingEntry = screenshots.find((s) => s.status === 'extracting');
  const pendingCount = screenshots.filter(
    (s) => s.status === 'pending' || s.status === 'error' || s.status === 'docai_failed',
  ).length;
  const doneCount = screenshots.filter((s) => s.status === 'done').length;

  return (
    <div className="space-y-4">
      {globalError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {globalError}
        </div>
      )}

      {extractingEntry && (
        <ExtractionProgressBanner entry={extractingEntry} batchInfo={batchInfo} />
      )}

      {fallbackPrompt && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">
                Document AI OCR could not process this image
              </p>
              <p className="text-xs text-amber-700 mt-1 font-mono break-all">
                {fallbackPrompt.errorMsg.replace(/^Document AI issue:\s*/i, '')}
              </p>
              <p className="text-xs text-amber-600 mt-2">
                You can proceed with GPT-4o vision-only extraction. This sends the image directly to the LLM,
                which may be less accurate on digits (CRFNs, amounts) but will still extract the data.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => extractWithVisionFallback(fallbackPrompt.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                    bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Use GPT-4o Vision Only
                </button>
                <button
                  onClick={() => dismissFallback(fallbackPrompt.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                    bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        ref={dropZoneRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-teal-500 bg-teal-50/60'
            : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <div
          className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
            dragOver ? 'bg-teal-100 text-teal-600' : 'bg-slate-200/80 text-slate-500'
          }`}
        >
          <ImagePlus className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">
            Paste a screenshot
            <span className="text-slate-400 font-normal mx-1.5">|</span>
            Drag an image here
            <span className="text-slate-400 font-normal mx-1.5">|</span>
            Click to upload
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+V to paste from clipboard
            &middot; Supports PNG, JPEG, WebP
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileSelect}
          className="sr-only"
        />
      </div>

      {screenshots.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{screenshots.length}</span> screenshot
              {screenshots.length !== 1 ? 's' : ''}
              {doneCount > 0 && (
                <span className="text-teal-600 ml-2">&middot; {doneCount} extracted</span>
              )}
            </p>
            {pendingCount > 0 && !fallbackPrompt && (
              <button
                onClick={extractAll}
                disabled={extractingAll}
                className="flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium
                  hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {extractingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting {batchInfo ? `${batchInfo.current}/${batchInfo.total}` : '...'}
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Extract All ({pendingCount})
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {screenshots.map((ss) => (
              <div
                key={ss.id}
                className="group relative rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm"
              >
                <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                  <img
                    src={ss.previewUrl}
                    alt="ACRIS screenshot"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                  {ss.status !== 'extracting' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeScreenshot(ss.id);
                      }}
                      className="p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100
                        hover:bg-black/70 transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {ss.status === 'extracting' && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="bg-black/70 rounded-lg px-3 py-2 flex flex-col items-center gap-1">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                      {ss.extractionStartedAt && (
                        <ThumbnailStageLabel startedAt={ss.extractionStartedAt} />
                      )}
                    </div>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent">
                  {ss.status === 'pending' && (
                    <button
                      onClick={() => extractSingle(ss.id)}
                      className="text-xs text-white/90 hover:text-white font-medium flex items-center gap-1 transition-colors"
                    >
                      <Upload className="h-3 w-3" />
                      Extract
                    </button>
                  )}
                  {ss.status === 'done' && (
                    <span
                      className={`text-xs font-medium flex items-center gap-1 ${
                        ss.pipelineUsed === 'docai_plus_llm' ? 'text-emerald-300' : 'text-sky-300'
                      }`}
                    >
                      {ss.pipelineUsed === 'docai_plus_llm' ? (
                        <>
                          <ShieldCheck className="h-3 w-3" /> Doc AI + LLM
                        </>
                      ) : ss.pipelineUsed === 'llm_vision_only' ? (
                        <>
                          <Eye className="h-3 w-3" /> Vision Only
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </>
                      )}
                    </span>
                  )}
                  {ss.status === 'docai_failed' && (
                    <span
                      className="text-xs text-amber-300 font-medium flex items-center gap-1"
                      title={ss.errorMsg}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      OCR failed
                    </span>
                  )}
                  {ss.status === 'error' && (
                    <button
                      onClick={() => extractSingle(ss.id)}
                      className="text-xs text-red-300 hover:text-red-200 font-medium flex items-center gap-1 transition-colors"
                      title={ss.errorMsg}
                    >
                      <AlertCircle className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {screenshots.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
                  setScreenshots([]);
                  setFallbackPrompt(null);
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Clear all screenshots
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
