const ENTITY_SUFFIXES = /\b(LLC|L\.L\.C|LP|L\.P|INC|CORP|CORPORATION|CO|LTD|PLLC|P\.L\.L\.C)\b\.?$/i;

export function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^\w\s,.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripEntitySuffixes(name: string): string {
  let result = name;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(ENTITY_SUFFIXES, '').trim();
  }
  return result;
}

export function normalizePersonName(name: string): string {
  const parts = name.split(',').map((s) => s.trim());
  if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

export function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(stripEntitySuffixes(normalizeName(a)).split(/\s+/).filter(Boolean));
  const tokensB = new Set(stripEntitySuffixes(normalizeName(b)).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}
