import type { PageText, PageRelevanceResult, PageCategory } from './types';

interface ScoringRule {
  regex: RegExp;
  weight: number;
  category: PageCategory;
}

const SCORING_RULES: ScoringRule[] = [
  { regex: /(APARTMENT|DWELLING|RESIDENTIAL)\s+(UNIT|APT)\s+(SCHEDULE|MIX)/i, weight: 5, category: 'UNIT_SCHEDULE' },
  { regex: /(UNIT\s+MIX|UNIT\s+COUNT|UNIT\s+SCHEDULE|SCHEDULE\s+OF\s+UNITS)/i, weight: 4, category: 'UNIT_SCHEDULE' },
  { regex: /OCCUPANT\s+LOAD/i, weight: 4, category: 'UNIT_SCHEDULE' },
  { regex: /BC\s*1004/i, weight: 3, category: 'UNIT_SCHEDULE' },
  { regex: /AREA\s+PER\s+OCCUPANT/i, weight: 3, category: 'UNIT_SCHEDULE' },
  { regex: /(NO\.?\s+OF\s+UNITS|NUMBER\s+OF\s+UNITS|TOTAL\s+UNITS)/i, weight: 3, category: 'UNIT_SCHEDULE' },

  { regex: /(FAR|ZFA|ZONING\s+FLOOR\s+AREA|LOT\s+AREA)/i, weight: 3, category: 'ZONING_ANALYSIS' },
  { regex: /FLOOR\s+AREA\s+RATIO/i, weight: 3, category: 'ZONING_ANALYSIS' },
  { regex: /ZONING\s+(ANALYSIS|COMPLIANCE|SUMMARY|DIAGRAM)/i, weight: 4, category: 'ZONING_ANALYSIS' },
  { regex: /USE\s+GROUP/i, weight: 2, category: 'ZONING_ANALYSIS' },
  { regex: /(PERMITTED|PROPOSED)\s+(FAR|FLOOR\s+AREA)/i, weight: 3, category: 'ZONING_ANALYSIS' },

  { regex: /(COVER\s+SHEET|PROJECT\s+INFORMATION|TITLE\s+SHEET)/i, weight: 5, category: 'COVER_SHEET' },
  { regex: /(PROJECT\s+SUMMARY|PROJECT\s+DATA)/i, weight: 4, category: 'COVER_SHEET' },
  { regex: /SCOPE\s+OF\s+WORK/i, weight: 3, category: 'COVER_SHEET' },
  { regex: /PROPOSED\s+\d+\s*[-]?\s*(?:UNIT|DWELLING|STORY)/i, weight: 3, category: 'COVER_SHEET' },

  { regex: /(AFFORDABLE|MIH|INCLUSIONARY|UAP|RESTRICTED)/i, weight: 3, category: 'AFFORDABLE_HOUSING' },
  { regex: /AMI\s*(?:BAND|LEVEL|%)/i, weight: 3, category: 'AFFORDABLE_HOUSING' },
  { regex: /INCOME\s+(?:BAND|LEVEL|RESTRICT)/i, weight: 3, category: 'AFFORDABLE_HOUSING' },
  { regex: /RENT\s+STABIL/i, weight: 2, category: 'AFFORDABLE_HOUSING' },

  { regex: /(NET|GROSS)\s*(SF|SQ\.?\s*FT|AREA)/i, weight: 2, category: 'UNIT_SCHEDULE' },
  { regex: /FLOOR\s+PLAN/i, weight: 2, category: 'FLOOR_PLAN' },
  { regex: /TYPICAL\s+FLOOR/i, weight: 2, category: 'FLOOR_PLAN' },
];

const MIN_SCORE_THRESHOLD = 3;
const MAX_LLM_PAGES = 8;

export function scorePageRelevance(page: PageText): { score: number; categories: Map<PageCategory, number> } {
  let score = 0;
  const categories = new Map<PageCategory, number>();

  for (const rule of SCORING_RULES) {
    if (rule.regex.test(page.text)) {
      score += rule.weight;
      categories.set(rule.category, (categories.get(rule.category) ?? 0) + rule.weight);
    }
  }

  return { score, categories };
}

function pickPrimaryCategory(categories: Map<PageCategory, number>): PageCategory {
  if (categories.size === 0) return 'IRRELEVANT';
  let best: PageCategory = 'IRRELEVANT';
  let bestScore = 0;
  for (const [cat, score] of categories) {
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

export function classifyPages(pages: PageText[]): PageRelevanceResult[] {
  const scored = pages.map((page) => {
    const { score, categories } = scorePageRelevance(page);
    return {
      pageIndex: page.pageIndex,
      score,
      category: score >= MIN_SCORE_THRESHOLD ? pickPrimaryCategory(categories) : 'IRRELEVANT' as PageCategory,
      selectedForLlm: false,
    };
  });

  const relevant = scored
    .filter((s) => s.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasCover = relevant.some((r) => r.category === 'COVER_SHEET');
  const hasZoning = relevant.some((r) => r.category === 'ZONING_ANALYSIS');
  const hasSchedule = relevant.some((r) => r.category === 'UNIT_SCHEDULE');

  const selected = new Set<number>();
  for (const r of relevant) {
    if (selected.size >= MAX_LLM_PAGES) break;
    selected.add(r.pageIndex);
  }

  if (!hasCover) {
    const cover = scored.find((s) => s.category === 'COVER_SHEET' && !selected.has(s.pageIndex));
    if (cover) selected.add(cover.pageIndex);
  }
  if (!hasZoning) {
    const zoning = scored.find((s) => s.category === 'ZONING_ANALYSIS' && !selected.has(s.pageIndex));
    if (zoning) selected.add(zoning.pageIndex);
  }
  if (!hasSchedule) {
    const schedule = scored.find((s) => s.category === 'UNIT_SCHEDULE' && !selected.has(s.pageIndex));
    if (schedule) selected.add(schedule.pageIndex);
  }

  for (const r of scored) {
    r.selectedForLlm = selected.has(r.pageIndex);
  }

  return scored;
}

export function getRelevantPagesForLlm(pages: PageText[], relevance: PageRelevanceResult[]): PageText[] {
  const selected = relevance.filter((r) => r.selectedForLlm).map((r) => r.pageIndex);
  const selectedSet = new Set(selected);
  return pages.filter((p) => selectedSet.has(p.pageIndex)).sort((a, b) => a.pageIndex - b.pageIndex);
}
