import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';
import { GlobalWorkerOptions, getDocument, version } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

interface AcrisDocViewerProps {
  data: ArrayBuffer;
  contentType: string;
  documentId: string;
}

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const DEFAULT_ZOOM_INDEX = 2;

export default function AcrisDocViewer({ data, contentType, documentId }: AcrisDocViewerProps) {
  const isPdf = contentType.includes('pdf');
  const isImage = contentType.includes('image/');

  if (isPdf) {
    return <PdfViewer data={data} documentId={documentId} />;
  }

  if (isImage) {
    return <ImageViewer data={data} contentType={contentType} documentId={documentId} />;
  }

  return <BinaryDownload data={data} contentType={contentType} documentId={documentId} />;
}

function PdfViewer({ data, documentId }: { data: ArrayBuffer; documentId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [rendering, setRendering] = useState(false);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('PDF load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  const renderPage = useCallback(async (pageNum: number, scale: number) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    setRendering(true);
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error('Page render failed:', err);
    } finally {
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    if (pageCount > 0) {
      renderPage(currentPage, ZOOM_STEPS[zoomIndex]);
    }
  }, [currentPage, zoomIndex, pageCount, renderPage]);

  function handleDownload() {
    const blob = new Blob([data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ACRIS-${documentId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || rendering}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <span className="text-xs text-slate-500 font-medium min-w-[80px] text-center">
            {pageCount > 0 ? `${currentPage} / ${pageCount}` : '...'}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount || rendering}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
            disabled={zoomIndex <= 0}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <span className="text-[10px] text-slate-400 font-mono min-w-[36px] text-center">
            {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
          </span>
          <button
            onClick={() => setZoomIndex((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-slate-100 transition-colors"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-4">
        {rendering && pageCount === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="shadow-lg rounded bg-white"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        )}
      </div>
    </div>
  );
}

function ImageViewer({ data, contentType, documentId }: { data: ArrayBuffer; contentType: string; documentId: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([data], { type: contentType });
    const url = URL.createObjectURL(blob);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, contentType]);

  function handleDownload() {
    if (!imgUrl) return;
    const ext = contentType.includes('tiff') ? 'tiff' : contentType.includes('png') ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `ACRIS-${documentId}.${ext}`;
    a.click();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-3 py-2 border-b border-slate-200 bg-white">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center p-4">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={`ACRIS Document ${documentId}`}
            className="max-w-full h-auto shadow-lg rounded bg-white"
          />
        ) : (
          <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}

function BinaryDownload({ data, contentType, documentId }: { data: ArrayBuffer; contentType: string; documentId: string }) {
  function handleDownload() {
    const blob = new Blob([data], { type: contentType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ACRIS-${documentId}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sizeKb = Math.round(data.byteLength / 1024);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <Maximize2 className="h-10 w-10 text-slate-300" />
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">Document Retrieved</p>
        <p className="text-xs text-slate-400 mt-1">
          {contentType || 'Unknown format'} ({sizeKb} KB)
        </p>
      </div>
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Download Document
      </button>
    </div>
  );
}
