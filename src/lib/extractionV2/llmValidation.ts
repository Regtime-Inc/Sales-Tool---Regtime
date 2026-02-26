import type { PageText, PageRelevanceResult, ExtractionV2Result } from './types';
import type { LlmExtractedPlanData } from '../../types/pdf';
import { getRelevantPagesForLlm } from './pageRelevance';

interface PlutoData {
  lotarea: number;
  residfar: number;
  bldgarea: number;
}

interface LlmValidationOptions {
  v2Result: ExtractionV2Result;
  pages: PageText[];
  pageRelevance: PageRelevanceResult[];
  plutoData?: PlutoData | null;
  zoneDist?: string | null;
  signal?: AbortSignal;
}

interface LlmValidationResult {
  extraction: LlmExtractedPlanData | null;
  error: string | null;
}

function buildCityContext(plutoData?: PlutoData | null, zoneDist?: string | null): string {
  if (!plutoData) return '';

  const parts: string[] = [];
  parts.push(`PLUTO database indicates:`);
  parts.push(`- Lot Area: ${plutoData.lotarea.toLocaleString()} SF`);
  parts.push(`- Residential FAR: ${plutoData.residfar}`);
  parts.push(`- Building Area: ${plutoData.bldgarea.toLocaleString()} SF`);
  parts.push(`- Max Residential Floor Area: ~${Math.round(plutoData.lotarea * plutoData.residfar).toLocaleString()} SF`);

  if (zoneDist) {
    parts.push(`- Zone District: ${zoneDist}`);
  }

  parts.push('');
  parts.push('Verify that your extraction is consistent with these city parameters.');
  parts.push('If any extracted value deviates significantly from city data, add a warning explaining the discrepancy.');

  return parts.join('\n');
}

function mapPageCategory(relevance: PageRelevanceResult): string {
  const map: Record<string, string> = {
    COVER_SHEET: 'COVER_SHEET',
    ZONING_ANALYSIS: 'ZONING',
    UNIT_SCHEDULE: 'OCCUPANT_LOAD',
    FLOOR_PLAN: 'FLOOR_PLAN',
    AFFORDABLE_HOUSING: 'GENERAL',
    IRRELEVANT: 'GENERAL',
  };
  return map[relevance.category] ?? 'GENERAL';
}

export async function runLlmValidation(options: LlmValidationOptions): Promise<LlmValidationResult> {
  const { v2Result, pages, pageRelevance, plutoData, zoneDist, signal } = options;

  const relevantPages = getRelevantPagesForLlm(pages, pageRelevance);
  if (relevantPages.length === 0) {
    return { extraction: null, error: 'No relevant pages found for LLM validation' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { extraction: null, error: 'Supabase not configured' };
  }

  const relevanceMap = new Map(pageRelevance.map((r) => [r.pageIndex, r]));

  const pagePayloads = relevantPages.map((p) => ({
    page: p.pageIndex,
    type: mapPageCategory(relevanceMap.get(p.pageIndex)!),
    text: p.text.substring(0, 4000),
  }));

  const cityContext = buildCityContext(plutoData, zoneDist);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/llm-extract-plans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pages: pagePayloads,
        cityContext: cityContext || undefined,
      }),
      signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = (errData as Record<string, string>).reason ?? `HTTP ${response.status}`;
      return { extraction: null, error: reason };
    }

    const data = await response.json();
    const extraction: LlmExtractedPlanData = data.extraction;

    return { extraction, error: null };
  } catch (err) {
    if (signal?.aborted) {
      return { extraction: null, error: 'Aborted' };
    }
    return { extraction: null, error: err instanceof Error ? err.message : String(err) };
  }
}
