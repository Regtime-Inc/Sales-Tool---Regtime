export type OwnerEntityType = 'person' | 'org' | 'unknown';
export type RelationshipType = 'owner' | 'developer' | 'authorized_signer' | 'borrower' | 'lender' | 'other';
export type OwnerEventType = 'purchase' | 'dobnow_job' | 'acris_doc' | 'other';

export interface ContactEntry {
  value: string;
  source: string;
  confidence: number;
  updatedAt: string;
  evidence?: string;
}

export interface OwnerEntity {
  id: string;
  canonical_name: string;
  entity_type: OwnerEntityType;
  aliases: string[];
  emails: ContactEntry[];
  phones: ContactEntry[];
  addresses: ContactEntry[];
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface OwnerEntityProperty {
  id: string;
  owner_entity_id: string;
  bbl: string;
  relationship_type: RelationshipType;
  confidence: number;
  evidence: {
    source: string;
    documentId?: string;
    jobNumber?: string;
    snippet?: string;
    recordedDate?: string;
    url?: string;
  };
  created_at: string;
}

export interface OwnerEntityEvent {
  id: string;
  owner_entity_id: string;
  event_type: OwnerEventType;
  bbl: string;
  occurred_at: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface OwnerSearchResult {
  id: string;
  canonical_name: string;
  entity_type: OwnerEntityType;
  aliases: string[];
  emails: ContactEntry[];
  phones: ContactEntry[];
  addresses: ContactEntry[];
  match_score: number;
  property_count: number;
}

export interface PortfolioProperty {
  bbl: string;
  address?: string;
  borough?: string;
  relationship_types: RelationshipType[];
  confidence: number;
  evidence_count: number;
  last_purchase_date?: string;
  last_purchase_price?: number;
  last_dob_job?: string;
  last_dob_job_type?: string;
}

export interface AssociatedEntity {
  id: string;
  canonical_name: string;
  entity_type: OwnerEntityType;
  relationship_types: RelationshipType[];
  shared_bbls: string[];
  shared_bbl_count: number;
  property_count: number;
}

export interface OwnerPortfolio {
  owner: OwnerEntity;
  properties: PortfolioProperty[];
  recent_purchases: OwnerEntityEvent[];
  recent_dob_jobs: OwnerEntityEvent[];
  associated_entities: AssociatedEntity[];
  warnings: string[];
}

export type ContactSource =
  | 'stakeholder_cache'
  | 'dobnow_owner_contacts'
  | 'dobnow_api'
  | 'acris_documents'
  | 'ai_enrichment'
  | 'web_enrichment'
  | 'serpapi_serp'
  | 'serpapi_page'
  | 'hunter_domain_search'
  | 'hunter_email_finder';

export interface WebContactCandidate {
  type: 'email' | 'phone' | 'address';
  value: string;
  confidence: number;
  sourceUrl: string;
  evidenceSnippet: string;
  extractedAt: string;
}

export interface WebEnrichmentSource {
  url: string;
  title: string;
  snippet?: string;
}

export interface WebEnrichmentResult {
  sources: WebEnrichmentSource[];
  candidates: WebContactCandidate[];
  warnings: string[];
  cached?: boolean;
}

export interface DossierContact {
  value: string;
  source: ContactSource | string;
  confidence: number;
  lastSeen: string;
  bbl?: string;
  evidence?: string;
}

export interface AssociatedContact {
  name: string;
  role: string;
  entityType: OwnerEntityType;
  phones: DossierContact[];
  emails: DossierContact[];
  addresses: DossierContact[];
  linkedBbls: string[];
}

export interface OsintResult {
  query: string;
  findings: string;
  contacts: {
    phones: DossierContact[];
    emails: DossierContact[];
    addresses: DossierContact[];
    websites: string[];
    businessInfo: string[];
  };
  disclaimer: string;
}

export interface ContactDossier {
  entityId: string;
  entityName: string;
  entityType: OwnerEntityType;
  aliases: string[];
  phones: DossierContact[];
  emails: DossierContact[];
  addresses: DossierContact[];
  associatedContacts: AssociatedContact[];
  osint: OsintResult | null;
  enrichedAt: string;
  totalContactCount: number;
}

export interface AcceptedContact {
  contactType: 'phone' | 'email' | 'address';
  value: string;
  source: string;
  confidence: number;
  evidence?: string;
}

export interface SerpKnowledgeGraph {
  title?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
}

export interface SerpEnrichmentResult extends WebEnrichmentResult {
  knowledgeGraph?: SerpKnowledgeGraph;
}

export type HunterVerificationStatus =
  | 'valid'
  | 'invalid'
  | 'accept_all'
  | 'webmail'
  | 'disposable'
  | 'unknown';

export interface HunterCandidate extends WebContactCandidate {
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  seniority?: string;
  verificationStatus?: HunterVerificationStatus;
}

export interface HunterEnrichmentResult {
  domain: string;
  sources: WebEnrichmentSource[];
  candidates: HunterCandidate[];
  warnings: string[];
  cached?: boolean;
}
