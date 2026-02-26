import type { DobNowOwnerContact } from './types';

const LABEL_MAP: Record<string, keyof Pick<DobNowOwnerContact, 'ownerType' | 'firstName' | 'middleInitial' | 'lastName' | 'businessName' | 'title' | 'email' | 'phone' | 'addressLine1' | 'city' | 'state' | 'zip'>> = {
  'owner type': 'ownerType',
  'type of owner': 'ownerType',
  'first name': 'firstName',
  'middle initial': 'middleInitial',
  'middle name': 'middleInitial',
  'last name': 'lastName',
  'business name': 'businessName',
  'owner business name': 'businessName',
  'title': 'title',
  'email': 'email',
  'email address': 'email',
  'telephone number': 'phone',
  'telephone': 'phone',
  'phone': 'phone',
  'phone number': 'phone',
  'street address': 'addressLine1',
  'address': 'addressLine1',
  'owner street address': 'addressLine1',
  'city': 'city',
  'state': 'state',
  'zip': 'zip',
  'zip code': 'zip',
  'zipcode': 'zip',
};

function normalize(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^not\s+applicable$/i.test(trimmed)) return null;
  if (/^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
}

export function parseOwnerBlock(text: string, jobNumber: string): DobNowOwnerContact {
  const result: DobNowOwnerContact = {
    ownerType: null,
    firstName: null,
    middleInitial: null,
    lastName: null,
    businessName: null,
    title: null,
    email: null,
    phone: null,
    addressLine1: null,
    city: null,
    state: null,
    zip: null,
    source: 'dobnow_manual_import',
    evidence: [{ jobNumber, snippet: text.slice(0, 200) }],
  };

  const lines = text
    .split('\n')
    .map(l => l.replace(/\t/g, '  ').trim())
    .filter(Boolean);

  for (const line of lines) {
    const colonMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (colonMatch) {
      const rawLabel = colonMatch[1].replace(/\*+/g, '').trim().toLowerCase();
      const rawValue = colonMatch[2].trim();
      const field = LABEL_MAP[rawLabel];
      if (field) {
        const val = normalize(rawValue);
        if (val) (result as any)[field] = field === 'phone' ? val.replace(/\D/g, '') : val;
        continue;
      }
    }

    const tabSplit = line.split(/\s{2,}/);
    if (tabSplit.length >= 2) {
      for (let i = 0; i < tabSplit.length - 1; i += 2) {
        const rawLabel = tabSplit[i].replace(/\*+/g, '').trim().toLowerCase();
        const rawValue = (tabSplit[i + 1] || '').trim();
        const field = LABEL_MAP[rawLabel];
        if (field) {
          const val = normalize(rawValue);
          if (val) (result as any)[field] = field === 'phone' ? val.replace(/\D/g, '') : val;
        }
      }
    }
  }

  if (!result.email) {
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/i);
    if (emailMatch) result.email = emailMatch[0];
  }

  if (!result.phone) {
    const phoneMatch = text.match(/\b(\d[\d\s().-]{8,}\d)\b/);
    if (phoneMatch) {
      const digits = phoneMatch[1].replace(/\D/g, '');
      if (digits.length >= 10) result.phone = digits;
    }
  }

  return result;
}

export function ownerContactDisplayName(c: DobNowOwnerContact): string | null {
  const parts = [c.firstName, c.middleInitial, c.lastName].filter(Boolean);
  const personName = parts.join(' ').trim();
  return personName || c.businessName || null;
}
