export const DEED_TYPES = [
  'DEED', 'DEEDO', 'ADED', 'EXED', 'RDED', 'TORD',
] as const;

export const MORTGAGE_TYPES = [
  'MTGE', 'AGMT', 'ASPM', 'SMTG',
] as const;

export const REGULATORY_TYPES = [
  'RCOV', 'RSTD', 'RPTT', 'DECL',
] as const;

export const ALL_TRACKED_DOC_TYPES = [
  ...DEED_TYPES,
  ...MORTGAGE_TYPES,
  ...REGULATORY_TYPES,
] as const;

export type TrackedDocType = (typeof ALL_TRACKED_DOC_TYPES)[number];

export function isDeedType(docType: string): boolean {
  return (DEED_TYPES as readonly string[]).includes(docType);
}

export function isMortgageType(docType: string): boolean {
  return (MORTGAGE_TYPES as readonly string[]).includes(docType);
}

export function isRegulatoryType(docType: string): boolean {
  return (REGULATORY_TYPES as readonly string[]).includes(docType);
}

export function docTypeCategory(docType: string): 'deed' | 'mortgage' | 'regulatory' | 'unknown' {
  if (isDeedType(docType)) return 'deed';
  if (isMortgageType(docType)) return 'mortgage';
  if (isRegulatoryType(docType)) return 'regulatory';
  return 'unknown';
}

export function socrataDocTypeFilter(): string {
  return ALL_TRACKED_DOC_TYPES.map((t) => `'${t}'`).join(',');
}
