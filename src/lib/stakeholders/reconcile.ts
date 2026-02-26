import type {
  StakeholderRecord,
  ContactPhone,
  ContactEmail,
  StakeholderAddress,
  ProvenanceEntry,
} from '../../types/stakeholders';
import { normalizeName, stripEntitySuffixes, tokenSetSimilarity } from './normalize';
import { computeConfidence, enrichmentBoost } from './confidence';

const MATCH_THRESHOLD = 0.85;

function mergePhones(a: ContactPhone[], b: ContactPhone[]): ContactPhone[] {
  const seen = new Map<string, ContactPhone>();
  for (const p of [...a, ...b]) {
    const key = p.raw.replace(/\D/g, '');
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || p.confidence > existing.confidence) {
      seen.set(key, p);
    }
  }
  return [...seen.values()];
}

function mergeEmails(a: ContactEmail[], b: ContactEmail[]): ContactEmail[] {
  const seen = new Map<string, ContactEmail>();
  for (const e of [...a, ...b]) {
    const key = e.email.toLowerCase();
    const existing = seen.get(key);
    if (!existing || e.confidence > existing.confidence) {
      seen.set(key, e);
    }
  }
  return [...seen.values()];
}

function mergeAddresses(a: StakeholderAddress[], b: StakeholderAddress[]): StakeholderAddress[] {
  const seen = new Map<string, StakeholderAddress>();
  for (const addr of [...a, ...b]) {
    const key = [addr.line1, addr.city, addr.state, addr.zip]
      .filter(Boolean)
      .join('|')
      .toUpperCase();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || addr.confidence > existing.confidence) {
      seen.set(key, addr);
    }
  }
  return [...seen.values()];
}

function mergeProvenance(a: ProvenanceEntry[], b: ProvenanceEntry[]): ProvenanceEntry[] {
  const seen = new Set<string>();
  const result: ProvenanceEntry[] = [];
  for (const p of [...a, ...b]) {
    const key = `${p.sourceSystem}:${p.recordKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

function mergeTwo(primary: StakeholderRecord, secondary: StakeholderRecord): StakeholderRecord {
  const phones = mergePhones(
    primary.contacts?.phones ?? [],
    secondary.contacts?.phones ?? []
  );
  const emails = mergeEmails(
    primary.contacts?.emails ?? [],
    secondary.contacts?.emails ?? []
  );
  const addresses = mergeAddresses(
    primary.addresses ?? [],
    secondary.addresses ?? []
  );
  const provenance = mergeProvenance(primary.provenance, secondary.provenance);

  const sources = provenance.map((p) => p.sourceSystem);
  const { score } = computeConfidence(sources);

  return {
    role: primary.role,
    name: primary.name,
    orgName: primary.orgName || secondary.orgName,
    license: primary.license || secondary.license,
    contacts: phones.length > 0 || emails.length > 0 ? { phones, emails } : undefined,
    addresses: addresses.length > 0 ? addresses : undefined,
    provenance,
    confidence: score,
    notes: [primary.notes, secondary.notes].filter(Boolean).join('; ') || undefined,
  };
}

function matchKey(record: StakeholderRecord): string {
  return `${record.role}::${stripEntitySuffixes(normalizeName(record.name))}`;
}

export function reconcileStakeholders(rawEntries: StakeholderRecord[]): StakeholderRecord[] {
  if (rawEntries.length === 0) return [];

  const groups: StakeholderRecord[][] = [];

  for (const entry of rawEntries) {
    if (!entry.name || !entry.name.trim()) continue;

    let merged = false;
    for (const group of groups) {
      const representative = group[0];
      if (representative.role !== entry.role) continue;

      const sim = tokenSetSimilarity(representative.name, entry.name);
      if (sim >= MATCH_THRESHOLD) {
        group.push(entry);
        merged = true;
        break;
      }
    }

    if (!merged) {
      groups.push([entry]);
    }
  }

  const results: StakeholderRecord[] = [];
  for (const group of groups) {
    let merged = group[0];
    for (let i = 1; i < group.length; i++) {
      merged = mergeTwo(merged, group[i]);
    }
    results.push(merged);
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export function applyLicenseEnrichment(
  stakeholders: StakeholderRecord[],
  licenseRecords: Array<{
    licenseNumber: string;
    businessPhone?: string;
    businessEmail?: string;
    status?: string;
    provenance: ProvenanceEntry;
  }>
): StakeholderRecord[] {
  if (licenseRecords.length === 0) return stakeholders;

  const licenseMap = new Map(licenseRecords.map((l) => [l.licenseNumber, l]));

  return stakeholders.map((s) => {
    if (!s.license?.number) return s;
    const enrichment = licenseMap.get(s.license.number);
    if (!enrichment) return s;

    const phones = [...(s.contacts?.phones ?? [])];
    const emails = [...(s.contacts?.emails ?? [])];

    if (enrichment.businessPhone) {
      const digits = enrichment.businessPhone.replace(/\D/g, '');
      if (digits && !phones.some((p) => p.raw.replace(/\D/g, '') === digits)) {
        phones.push({ raw: enrichment.businessPhone, confidence: 0.95 });
      }
    }
    if (enrichment.businessEmail) {
      const lower = enrichment.businessEmail.toLowerCase();
      if (!emails.some((e) => e.email.toLowerCase() === lower)) {
        emails.push({ email: enrichment.businessEmail, confidence: 0.95 });
      }
    }

    const provenance = mergeProvenance(s.provenance, [enrichment.provenance]);
    const boosted = enrichmentBoost(s.confidence);

    return {
      ...s,
      contacts: phones.length > 0 || emails.length > 0 ? { phones, emails } : s.contacts,
      provenance,
      confidence: boosted,
      license: {
        ...s.license,
        status: enrichment.status || s.license.status,
        source: 'DOB_LICENSE_INFO' as const,
      },
    };
  });
}
