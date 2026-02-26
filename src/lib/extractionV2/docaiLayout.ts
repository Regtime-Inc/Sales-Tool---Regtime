import type { DocAiLayoutResult, DocAiTable } from './types';

interface DocAiResponse {
  pages?: Array<{
    page: number;
    text: string;
    confidence: number;
    lines: string[];
  }>;
  tables?: Array<{
    page: number;
    headerRows: string[][];
    bodyRows: string[][];
    rows: string[][];
  }>;
  error?: string;
  message?: string;
}

export async function checkDocAiAvailable(): Promise<boolean> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-ocr?check=1`;
    const resp = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      return !!data.available;
    }
  } catch (err) {
    console.warn('[DocAI] Availability check failed:', err instanceof Error ? err.message : String(err));
  }
  return false;
}

export async function fetchDocAiLayout(
  file: File,
  pageNumbers: number[],
): Promise<DocAiLayoutResult> {
  const bytes = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(bytes).reduce((s, b) => s + String.fromCharCode(b), '')
  );

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-ocr`;
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileBase64: base64, pages: pageNumbers }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Cloud OCR failed: ${resp.status}`);
  }

  const data: DocAiResponse = await resp.json();

  if (data.error === 'no_provider') {
    throw new Error('no_provider');
  }

  const pages = (data.pages || []).map((p) => ({
    pageIndex: p.page,
    text: p.text,
    lines: p.lines,
  }));

  const tables: DocAiTable[] = [];
  let tableIdx = 0;
  for (const t of data.tables || []) {
    tables.push({
      pageIndex: t.page,
      tableIndex: tableIdx++,
      headerRows: t.headerRows ?? (t.rows?.length > 0 ? [t.rows[0]] : []),
      bodyRows: t.bodyRows ?? (t.rows?.length > 1 ? t.rows.slice(1) : []),
    });
  }

  return { pages, tables };
}
