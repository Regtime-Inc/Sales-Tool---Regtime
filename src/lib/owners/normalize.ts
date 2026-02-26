const ENTITY_SUFFIXES_TAIL = /\s*,?\s*\b(LLC|L\.?L\.?C\.?|LP|L\.?P\.?|INC\.?|CORP\.?|CORPORATION|CO\.?|LTD\.?|PLLC|P\.?L\.?L\.?C\.?|LLP|L\.?L\.?P\.?)\b\.?\s*,?\s*$/gi;

const COMMON_PREFIXES = /^(THE|A|AN)\s+/i;
const PUNCTUATION = /[^\w\s,]/g;
const MULTI_SPACE = /\s+/g;

export function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(PUNCTUATION, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

export function matchKey(name: string): string {
  return stripEntitySuffixes(normalizeName(name))
    .replace(COMMON_PREFIXES, '')
    .trim();
}

export function stripEntitySuffixes(name: string): string {
  let result = name;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(ENTITY_SUFFIXES_TAIL, '').trim();
  }
  return result.replace(/,\s*$/, '').trim();
}

export function guessEntityType(name: string): 'person' | 'org' | 'unknown' {
  const upper = name.toUpperCase();
  if (/\b(LLC|LP|INC|CORP|CORPORATION|LTD|PLLC|LLP|TRUST|ASSOCIATES|REALTY|HOLDINGS|ENTERPRISES|PROPERTIES|GROUP|PARTNERS|DEVELOPMENT|MGMT|MANAGEMENT)\b/i.test(upper)) {
    return 'org';
  }
  const stripped = stripEntitySuffixes(normalizeName(name));
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 4 && tokens.every(t => /^[A-Z][A-Z]+$/.test(t))) {
    return 'person';
  }
  return 'unknown';
}

export function nameVariants(name: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeName(name);
  variants.add(normalized);

  const stripped = stripEntitySuffixes(normalized);
  if (stripped !== normalized && stripped.length > 2) {
    variants.add(stripped);
  }

  const noPrefix = stripped.replace(COMMON_PREFIXES, '').trim();
  if (noPrefix !== stripped && noPrefix.length > 2) {
    variants.add(noPrefix);
  }

  const parts = normalized.split(',').map(s => s.trim());
  if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
    variants.add(`${parts[1]} ${parts[0]}`);
    const flippedStripped = stripEntitySuffixes(`${parts[1]} ${parts[0]}`);
    if (flippedStripped.length > 2) variants.add(flippedStripped);
  }

  return [...variants].filter(v => v.length > 2);
}

export function dedupeAliases(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(a => normalizeName(a)));
  const result = [...existing];
  for (const alias of incoming) {
    const normalized = normalizeName(alias);
    if (!seen.has(normalized) && normalized.length > 2) {
      seen.add(normalized);
      result.push(alias);
    }
  }
  return result;
}
