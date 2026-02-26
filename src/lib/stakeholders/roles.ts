import type { StakeholderRole } from '../../types/stakeholders';

export function mapAcrisPartyType(partyType: string): StakeholderRole {
  switch (partyType) {
    case '2':
      return 'OWNER';
    case '1':
      return 'SELLER';
    default:
      return 'OTHER';
  }
}

const HPD_OWNER_TYPES = new Set([
  'corporateowner',
  'individualowner',
  'jointowner',
  'headofficer',
]);

const HPD_AGENT_TYPES = new Set([
  'agent',
  'sitemanager',
]);

export function mapHpdContactType(type: string): StakeholderRole {
  const lower = (type || '').toLowerCase().replace(/\s+/g, '');
  if (HPD_AGENT_TYPES.has(lower)) return 'MANAGING_AGENT';
  if (HPD_OWNER_TYPES.has(lower)) return 'OWNER';
  return 'OTHER';
}

export function mapDobLicenseType(licenseType: string): StakeholderRole {
  const upper = (licenseType || '').toUpperCase().trim();
  if (upper === 'PE') return 'ENGINEER';
  if (upper === 'RA') return 'ARCHITECT';
  if (upper === 'GC' || upper === 'GENERAL CONTRACTOR') return 'GC';
  return 'OTHER';
}

export function mapDobFilingRole(fieldName: string): StakeholderRole {
  const lower = (fieldName || '').toLowerCase();
  if (lower.includes('permittee') || lower.includes('contractor')) return 'GC';
  if (lower.includes('owner')) return 'OWNER';
  if (lower.includes('applicant')) return 'APPLICANT';
  if (lower.includes('filing_rep') || lower.includes('filing representative')) return 'FILING_REP';
  return 'OTHER';
}
