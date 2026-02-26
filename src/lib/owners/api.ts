import type {
  OwnerSearchResult,
  OwnerPortfolio,
  ContactDossier,
  WebEnrichmentResult,
  SerpEnrichmentResult,
  HunterEnrichmentResult,
  OwnerEntityType,
} from '../../types/owners';

const BASE = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

export async function searchOwners(query: string, limit = 25): Promise<OwnerSearchResult[]> {
  const url = `${BASE}/functions/v1/owner-search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.owners || [];
}

export async function aiSearchOwners(
  query: string
): Promise<{ owners: OwnerSearchResult[]; expansion: { expanded_names: string[]; entity_type_guess: string } | null }> {
  const url = `${BASE}/functions/v1/owner-ai-search`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`AI Search failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchOwnerPortfolio(ownerId: string): Promise<OwnerPortfolio> {
  const url = `${BASE}/functions/v1/owner-portfolio?id=${encodeURIComponent(ownerId)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Portfolio fetch failed: HTTP ${res.status}`);
  return res.json();
}

export async function ingestDobNow(bbls: string[], ownerEntityId?: string): Promise<{
  bbls_processed: number;
  filings_found: number;
  records_upserted: number;
  events_created: number;
}> {
  const url = `${BASE}/functions/v1/dobnow-ingest`;
  const payload: Record<string, unknown> = { bbls };
  if (ownerEntityId) payload.owner_entity_id = ownerEntityId;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `DOB ingest failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchOwnerContacts(ownerId: string, enrich = false): Promise<ContactDossier> {
  const params = new URLSearchParams({ id: ownerId });
  if (enrich) params.set('enrich', 'true');
  const url = `${BASE}/functions/v1/owner-contacts?${params}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Contacts fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function triggerReindex(): Promise<{ created: number; updated: number; linksCreated: number; eventsCreated: number }> {
  const url = `${BASE}/functions/v1/owner-reindex`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers });
  } catch {
    throw new Error('Network error: could not reach reindex service');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Reindex failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runWebEnrichment(ownerName: string, ownerId?: string, forceRefresh?: boolean, cacheOnly?: boolean): Promise<WebEnrichmentResult & { noCache?: boolean }> {
  const url = `${BASE}/functions/v1/owner-web-enrich`;
  const payload: Record<string, unknown> = { ownerName };
  if (ownerId) payload.ownerId = ownerId;
  if (forceRefresh) payload.forceRefresh = true;
  if (cacheOnly) payload.cacheOnly = true;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Web enrichment failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runSerpEnrichment(
  ownerName: string,
  ownerId?: string,
  entityType?: OwnerEntityType,
  locationHint?: string,
  forceRefresh?: boolean,
  cacheOnly?: boolean
): Promise<SerpEnrichmentResult & { noCache?: boolean }> {
  const url = `${BASE}/functions/v1/owner-serp-enrich`;
  const payload: Record<string, unknown> = { ownerName };
  if (ownerId) payload.ownerId = ownerId;
  if (entityType) payload.entityType = entityType;
  if (locationHint) payload.locationHint = locationHint;
  if (forceRefresh) payload.forceRefresh = true;
  if (cacheOnly) payload.cacheOnly = true;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `SERP enrichment failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function runHunterEnrichment(
  ownerName: string,
  ownerId?: string,
  entityType?: OwnerEntityType,
  websiteOrDomain?: string,
  companyName?: string,
  forceRefresh?: boolean
): Promise<HunterEnrichmentResult> {
  const url = `${BASE}/functions/v1/owner-hunter-enrich`;
  const payload: Record<string, unknown> = { ownerName };
  if (ownerId) payload.ownerId = ownerId;
  if (entityType) payload.entityType = entityType;
  if (websiteOrDomain) payload.websiteOrDomain = websiteOrDomain;
  if (companyName) payload.companyName = companyName;
  if (forceRefresh) payload.forceRefresh = true;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Hunter enrichment failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateOwnerWebsite(
  ownerId: string,
  website: string
): Promise<{ ok: boolean; domain: string }> {
  const url = `${BASE}/functions/v1/owner-update-website`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ownerId, website }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Website update failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function removeContact(params: {
  ownerId: string;
  contactType: 'phone' | 'email' | 'address';
  value: string;
}): Promise<{ ok: boolean; message: string; removed?: number }> {
  const url = `${BASE}/functions/v1/owner-remove-contact`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Remove contact failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function acceptContact(params: {
  ownerId: string;
  contactType: 'phone' | 'email' | 'address';
  value: string;
  source: string;
  confidence: number;
  evidence: string;
  sourceUrl?: string;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  const url = `${BASE}/functions/v1/owner-accept-contact`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Accept contact failed: HTTP ${res.status}`);
  }
  return res.json();
}
