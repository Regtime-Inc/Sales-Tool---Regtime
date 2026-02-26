import type { LlmExtractedPlanData, SheetIndex, RecipeType } from '../../types/pdf';

interface PageInput {
  page: number;
  type: string;
  text: string;
}

interface LlmExtractionResult {
  extraction: LlmExtractedPlanData | null;
  success: boolean;
  fallbackReason?: string;
}

function classifyPageType(
  pageNum: number,
  sheetIndex: SheetIndex | undefined,
  recipeTypeMap: Map<number, RecipeType>
): string {
  if (recipeTypeMap.has(pageNum)) {
    const rt = recipeTypeMap.get(pageNum)!;
    if (rt === 'COVER_SHEET') return 'COVER_SHEET';
    if (rt === 'ZONING_SCHEDULE') return 'ZONING';
    if (rt === 'OCCUPANT_LOAD') return 'OCCUPANT_LOAD';
    if (rt === 'FLOOR_PLAN_LABEL') return 'FLOOR_PLAN';
    return 'GENERAL';
  }

  if (!sheetIndex) return 'GENERAL';

  const sheet = sheetIndex.pages.find((s) => s.pageNumber === pageNum);
  if (!sheet) return 'GENERAL';

  const title = sheet.drawingTitle?.toUpperCase() || '';
  const no = sheet.drawingNo?.toUpperCase() || '';

  if (/^T[-.]?\d/.test(no) || /COVER|TITLE/.test(title)) return 'COVER_SHEET';
  if (/^Z[-.]?\d/.test(no) || /ZONING/.test(title)) return 'ZONING';
  if (/^G[-.]?\d/.test(no) || /OCCUPANT|CODE/.test(title)) return 'OCCUPANT_LOAD';
  if (/FLOOR\s+PLAN|TYPICAL\s+FLOOR|UNIT\s+PLAN/.test(title)) return 'FLOOR_PLAN';
  return 'GENERAL';
}

export function buildPageInputs(
  pageTexts: string[],
  sheetIndex: SheetIndex | undefined,
  recipeTypeMap: Map<number, RecipeType>
): PageInput[] {
  const inputs: PageInput[] = [];

  for (let i = 0; i < pageTexts.length; i++) {
    const pageNum = i + 1;
    const text = pageTexts[i]?.trim() || '';
    if (text.length < 20) continue;

    const type = classifyPageType(pageNum, sheetIndex, recipeTypeMap);
    inputs.push({ page: pageNum, type, text });
  }

  const priority = ['COVER_SHEET', 'ZONING', 'OCCUPANT_LOAD', 'FLOOR_PLAN', 'GENERAL'];
  inputs.sort((a, b) => {
    const ai = priority.indexOf(a.type);
    const bi = priority.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return a.page - b.page;
  });

  return inputs.slice(0, 12);
}

export async function llmExtractFromPages(
  pageTexts: string[],
  sheetIndex: SheetIndex | undefined,
  recipeTypeMap: Map<number, RecipeType>,
  options?: { signal?: AbortSignal }
): Promise<LlmExtractionResult> {
  const pages = buildPageInputs(pageTexts, sheetIndex, recipeTypeMap);

  if (pages.length === 0) {
    return { extraction: null, success: false, fallbackReason: 'No pages with sufficient text' };
  }

  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-extract-plans`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pages }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await resp.json();

    if (!resp.ok || data.error || data.fallback) {
      const reason = data.reason || data.error || `HTTP ${resp.status}`;
      console.warn('[llm-extract-plans] Falling back:', reason);
      return { extraction: null, success: false, fallbackReason: reason };
    }

    if (data.extraction) {
      return { extraction: data.extraction as LlmExtractedPlanData, success: true };
    }

    return { extraction: null, success: false, fallbackReason: 'No extraction field in response' };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { extraction: null, success: false, fallbackReason: 'LLM extraction timed out' };
    }
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[llm-extract-plans] Error:', reason);
    return { extraction: null, success: false, fallbackReason: reason };
  }
}
