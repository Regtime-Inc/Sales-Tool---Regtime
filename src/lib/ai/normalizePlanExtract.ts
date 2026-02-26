import type { RecipeResult, NormalizedPlanExtract, RecipeEvidence, NormalizationSource } from '../../types/pdf';

interface NormalizeOptions {
  signal?: AbortSignal;
}

export interface NormalizeResult {
  extract: NormalizedPlanExtract;
  source: NormalizationSource;
  fallbackReason?: string;
}

function buildContextString(recipeResults: RecipeResult[]): string {
  const sections: string[] = [];

  for (const result of recipeResults) {
    sections.push(`--- Recipe: ${result.recipe} (pages: ${result.pages.join(', ')}, confidence: ${result.confidence}) ---`);

    for (const [key, value] of Object.entries(result.fields)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        sections.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        sections.push(`${key}: ${value}`);
      }
    }

    if (result.evidence.length > 0) {
      sections.push('Evidence:');
      for (const ev of result.evidence.slice(0, 20)) {
        sections.push(`  [p.${ev.page}/${ev.method}] ${ev.field}: "${ev.snippet}"`);
      }
    }
  }

  return sections.join('\n');
}

function buildLocalFallback(recipeResults: RecipeResult[]): NormalizedPlanExtract {
  let lotAreaSf: number | null = null;
  let zoningFloorAreaSf: number | null = null;
  let far: number | null = null;
  let totalUnits: number | null = null;
  const unitMix: Record<string, number> = {};
  const unitSizesByType: Record<string, number[]> = {};
  const allEvidence: RecipeEvidence[] = [];
  let maxConfidence = 0;

  for (const result of recipeResults) {
    allEvidence.push(...result.evidence);
    maxConfidence = Math.max(maxConfidence, result.confidence);

    if (result.recipe === 'COVER_SHEET') {
      const f = result.fields as Record<string, unknown>;
      const cs = f.coverSheet as Record<string, unknown> | undefined;
      if (cs) {
        if (cs.lotAreaSf && !lotAreaSf) lotAreaSf = cs.lotAreaSf as number;
        if (cs.far && !far) far = cs.far as number;
        if (cs.totalUnits && !totalUnits) totalUnits = cs.totalUnits as number;
      }
    }

    if (result.recipe === 'ZONING_SCHEDULE') {
      const f = result.fields as Record<string, unknown>;
      if (f.lotAreaSf && !lotAreaSf) lotAreaSf = f.lotAreaSf as number;
      if (f.zoningFloorAreaSf && !zoningFloorAreaSf) zoningFloorAreaSf = f.zoningFloorAreaSf as number;
      if (f.far && !far) far = f.far as number;
      if (f.totalUnits && !totalUnits) totalUnits = f.totalUnits as number;
      if (f.unitMix && typeof f.unitMix === 'object') {
        const mix = f.unitMix as Record<string, number>;
        for (const [k, v] of Object.entries(mix)) {
          unitMix[k] = (unitMix[k] || 0) + v;
        }
      }
    }

    if (result.recipe === 'FLOOR_PLAN_LABEL') {
      const f = result.fields as Record<string, unknown>;
      if (f.unitSizesByType && typeof f.unitSizesByType === 'object') {
        const sizes = f.unitSizesByType as Record<string, number[]>;
        for (const [type, arr] of Object.entries(sizes)) {
          if (!unitSizesByType[type]) unitSizesByType[type] = [];
          unitSizesByType[type].push(...arr);
        }
      }
    }

    if (result.recipe === 'GENERIC') {
      const f = result.fields as Record<string, unknown>;
      if (f.totalUnits && !totalUnits) totalUnits = f.totalUnits as number;
      if (f.unitMix && typeof f.unitMix === 'object') {
        const mix = f.unitMix as Record<string, number>;
        for (const [k, v] of Object.entries(mix)) {
          if (!unitMix[k]) unitMix[k] = v;
        }
      }
    }
  }

  const avgByType: Record<string, number | null> = {};
  for (const [type, sizes] of Object.entries(unitSizesByType)) {
    avgByType[type] = sizes.length > 0
      ? Math.round(sizes.reduce((s, v) => s + v, 0) / sizes.length)
      : null;
  }

  const mixTotal = Object.values(unitMix).reduce((s, v) => s + v, 0);

  return {
    totals: {
      totalUnits: totalUnits ?? (mixTotal > 0 ? mixTotal : null),
      affordableUnits: null,
      marketUnits: null,
    },
    unitMix: {
      studio: unitMix['STUDIO'] ?? null,
      br1: unitMix['1BR'] ?? null,
      br2: unitMix['2BR'] ?? null,
      br3: unitMix['3BR'] ?? null,
      br4plus: unitMix['4BR_PLUS'] ?? null,
    },
    unitSizes: { byType: unitSizesByType, avgByType },
    zoning: { lotAreaSf, zoningFloorAreaSf, far },
    evidence: allEvidence,
    confidence: {
      overall: Math.min(0.6, maxConfidence),
      warnings: ['LLM normalization unavailable; using pattern-match results only'],
    },
  };
}

export async function normalizePlanExtract(
  recipeResults: RecipeResult[],
  options?: NormalizeOptions
): Promise<NormalizeResult> {
  if (recipeResults.length === 0) {
    return { extract: buildLocalFallback([]), source: 'local_fallback', fallbackReason: 'No recipe results to normalize' };
  }

  try {
    const context = buildContextString(recipeResults);
    const evidence = recipeResults.flatMap((r) => r.evidence);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-normalize`;

    const fetchWithRetry = async () => {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context, evidence }),
        signal: options?.signal,
      });
      if (resp.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        return fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ context, evidence }),
          signal: options?.signal,
        });
      }
      return resp;
    };

    const resp = await fetchWithRetry();
    const data = await resp.json();

    if (!resp.ok || data.error || data.fallback) {
      const reason = data.reason || data.error || `HTTP ${resp.status}`;
      console.warn('[llm-normalize] Falling back to local:', reason);
      return { extract: buildLocalFallback(recipeResults), source: 'local_fallback', fallbackReason: reason };
    }

    if (data.normalized) {
      return { extract: data.normalized as NormalizedPlanExtract, source: 'llm' };
    }

    console.warn('[llm-normalize] No normalized field in response');
    return { extract: buildLocalFallback(recipeResults), source: 'local_fallback', fallbackReason: 'Unexpected response format' };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[llm-normalize] Network/parse error:', reason);
    return { extract: buildLocalFallback(recipeResults), source: 'local_fallback', fallbackReason: reason };
  }
}

export { buildLocalFallback };
