import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { SheetIndex, RecipeType } from '../types/pdf';

interface SheetIndexTableProps {
  sheetIndex: SheetIndex;
  onOverride?: (pageNum: number, assignment: RecipeType | 'skip') => void;
}

const RECIPE_OPTIONS: Array<{ value: RecipeType | 'skip' | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'ZONING_SCHEDULE', label: 'Zoning Schedule' },
  { value: 'FLOOR_PLAN_LABEL', label: 'Floor Plan' },
  { value: 'GENERIC', label: 'Generic' },
  { value: 'skip', label: 'Skip' },
];

function confidenceColor(conf: number): string {
  if (conf >= 0.8) return 'text-emerald-700 bg-emerald-50';
  if (conf >= 0.5) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

function detectRecipeLabel(sheet: { drawingTitle?: string; drawingNo?: string }): string {
  const title = sheet.drawingTitle?.toUpperCase() || '';
  const no = sheet.drawingNo?.toUpperCase() || '';
  if (/ZONING\s*(COMPLIANCE|ANALYSIS|SCHEDULE|DATA)/.test(title) || /^Z-/.test(no)) {
    return 'Zoning Schedule';
  }
  if (/(FLOOR\s+PLAN|TYPICAL\s+FLOOR|UNIT\s+PLAN)/.test(title) && !/(SITE|FOUNDATION)/.test(title)) {
    return 'Floor Plan';
  }
  return '-';
}

export default function SheetIndexTable({ sheetIndex, onOverride }: SheetIndexTableProps) {
  const [open, setOpen] = useState(false);

  const meaningfulPages = sheetIndex.pages.filter((s) => s.confidence >= 0.3);
  if (meaningfulPages.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-700 font-medium transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        Sheet Index ({sheetIndex.pages.length} pages)
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left py-1.5 pr-2 font-medium">Pg</th>
                <th className="text-left py-1.5 px-2 font-medium">Drawing No.</th>
                <th className="text-left py-1.5 px-2 font-medium">Title</th>
                <th className="text-left py-1.5 px-2 font-medium">Recipe</th>
                <th className="text-center py-1.5 px-2 font-medium">Conf.</th>
                <th className="text-right py-1.5 pl-2 font-medium">Method</th>
              </tr>
            </thead>
            <tbody>
              {sheetIndex.pages.map((sheet) => (
                <tr key={sheet.pageNumber} className="border-b border-slate-50 hover:bg-slate-25">
                  <td className="py-1.5 pr-2 text-slate-600 font-mono">{sheet.pageNumber}</td>
                  <td className="py-1.5 px-2 text-slate-700 font-medium">
                    {sheet.drawingNo || '-'}
                  </td>
                  <td className="py-1.5 px-2 text-slate-600 max-w-[180px] truncate">
                    {sheet.drawingTitle || '-'}
                  </td>
                  <td className="py-1.5 px-2">
                    {onOverride ? (
                      <select
                        className="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                        defaultValue="auto"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val !== 'auto') {
                            onOverride(sheet.pageNumber, val as RecipeType | 'skip');
                          }
                        }}
                      >
                        {RECIPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-500">{detectRecipeLabel(sheet)}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${confidenceColor(sheet.confidence)}`}>
                      {Math.round(sheet.confidence * 100)}%
                    </span>
                  </td>
                  <td className="py-1.5 pl-2 text-right text-slate-400">
                    {sheet.method === 'PDF_TEXT' ? 'Text' : 'OCR'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
