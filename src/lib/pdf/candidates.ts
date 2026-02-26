import type { PageLine, CandidatePage } from '../../types/pdf';

interface ScoringRule {
  regex: RegExp;
  weight: number;
  tag: 'schedule' | 'far';
}

const SCORING_RULES: ScoringRule[] = [
  { regex: /(APARTMENT|DWELLING|RESIDENTIAL)\s+(UNIT|APT)\s+(SCHEDULE|MIX)/i, weight: 5, tag: 'schedule' },
  { regex: /(UNIT\s+MIX|UNIT\s+COUNT|UNIT\s+SCHEDULE|SCHEDULE\s+OF\s+UNITS)/i, weight: 4, tag: 'schedule' },
  { regex: /OCCUPANT\s+LOAD/i, weight: 4, tag: 'schedule' },
  { regex: /BC\s*1004/i, weight: 3, tag: 'schedule' },
  { regex: /AREA\s+PER\s+OCCUPANT/i, weight: 3, tag: 'schedule' },
  { regex: /(FAR|ZFA|ZONING\s+FLOOR\s+AREA|LOT\s+AREA)/i, weight: 3, tag: 'far' },
  { regex: /(AFFORDABLE|MIH|INCLUSIONARY|UAP|AMI|RESTRICTED)/i, weight: 3, tag: 'schedule' },
  { regex: /TOTAL\s+OCCUPANCY/i, weight: 2, tag: 'schedule' },
  { regex: /(NET|GROSS)\s*(SF|SQ\.?\s*FT|AREA)/i, weight: 2, tag: 'schedule' },
];

export function scorePage(lines: PageLine[]): { score: number; tags: Set<'schedule' | 'far'> } {
  let score = 0;
  const tags = new Set<'schedule' | 'far'>();

  for (const line of lines) {
    for (const rule of SCORING_RULES) {
      if (rule.regex.test(line.text)) {
        score += rule.weight;
        tags.add(rule.tag);
      }
    }
  }

  return { score, tags };
}

export function detectCandidatePages(
  pageLines: Map<number, PageLine[]>,
  maxCandidates = 6
): CandidatePage[] {
  const scored: CandidatePage[] = [];

  for (const [page, lines] of pageLines) {
    const { score, tags } = scorePage(lines);
    if (score > 0) {
      scored.push({ page, score, tags: Array.from(tags) });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: CandidatePage[] = [];
  let hasSchedule = false;
  let hasFar = false;

  for (const c of scored) {
    if (selected.length >= maxCandidates) break;
    selected.push(c);
    if (c.tags.includes('schedule')) hasSchedule = true;
    if (c.tags.includes('far')) hasFar = true;
  }

  if (!hasSchedule) {
    const first = scored.find(
      (c) => c.tags.includes('schedule') && !selected.includes(c)
    );
    if (first) {
      if (selected.length >= maxCandidates) selected.pop();
      selected.push(first);
    }
  }

  if (!hasFar) {
    const first = scored.find(
      (c) => c.tags.includes('far') && !selected.includes(c)
    );
    if (first) {
      if (selected.length >= maxCandidates) selected.pop();
      selected.push(first);
    }
  }

  return selected.sort((a, b) => a.page - b.page);
}

export function isScheduleCandidatePage(lines: PageLine[]): boolean {
  const { score } = scorePage(lines);
  return score >= 3;
}
