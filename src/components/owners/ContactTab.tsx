import { useState, useEffect, useCallback } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Globe,
  Briefcase,
  Users,
  Search,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  Shield,
  Zap,
  Info,
  X,
} from 'lucide-react';
import { fetchOwnerContacts, ingestDobNow, runWebEnrichment, runSerpEnrichment, acceptContact, removeContact } from '../../lib/owners/api';
import type { ContactDossier, DossierContact, AssociatedContact, OsintResult, WebEnrichmentResult, SerpEnrichmentResult, AcceptedContact } from '../../types/owners';
import WebEnrichmentPanel from './WebEnrichmentPanel';
import SerpEnrichmentPanel from './SerpEnrichmentPanel';

interface ContactTabProps {
  ownerId: string;
  entityName: string;
  bbls: string[];
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8 ? 'bg-emerald-400' :
    confidence >= 0.6 ? 'bg-amber-400' :
    'bg-slate-300';
  const label =
    confidence >= 0.8 ? 'High' :
    confidence >= 0.6 ? 'Medium' :
    'Low';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span className="text-[10px] text-slate-400">{label}</span>
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    stakeholder_cache: { label: 'HPD', color: 'bg-sky-50 text-sky-700' },
    dobnow_owner_contacts: { label: 'DOB Filing', color: 'bg-teal-50 text-teal-700' },
    dobnow_api: { label: 'DOB API', color: 'bg-teal-50 text-teal-700' },
    acris_documents: { label: 'ACRIS', color: 'bg-amber-50 text-amber-700' },
    ai_enrichment: { label: 'AI Search', color: 'bg-rose-50 text-rose-600' },
    web_enrichment: { label: 'Web', color: 'bg-cyan-50 text-cyan-700' },
    serpapi_serp: { label: 'SERP', color: 'bg-orange-50 text-orange-700' },
    serpapi_page: { label: 'SERP Page', color: 'bg-amber-50 text-amber-700' },
  };
  const match = labels[source] || { label: source, color: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${match.color}`}>
      {match.label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-300 hover:text-slate-500"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function ContactCard({ contact, icon, href, onRemove }: { contact: DossierContact; icon: React.ReactNode; href?: string; onRemove?: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      onRemove?.();
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 bg-white border border-slate-150 rounded-lg px-3 py-2.5 hover:border-slate-300 transition-colors group">
      <div className="text-slate-400 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        {href ? (
          <a href={href} className="text-sm text-teal-700 hover:text-teal-900 hover:underline truncate block">
            {contact.value}
          </a>
        ) : (
          <span className="text-sm text-slate-700 truncate block">{contact.value}</span>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <SourceBadge source={contact.source} />
          <ConfidenceDot confidence={contact.confidence} />
          {contact.evidence && (
            <span className="text-[10px] text-slate-300 truncate max-w-[140px]">{contact.evidence}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <CopyButton value={contact.value} />
        {onRemove && !confirmOpen && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="p-1 rounded hover:bg-red-50 transition-colors text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100"
            title="Remove contact"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {confirmOpen && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {removing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function ContactSection({
  title,
  icon,
  contacts,
  emptyMessage,
  renderCard,
}: {
  title: string;
  icon: React.ReactNode;
  contacts: DossierContact[];
  emptyMessage: string;
  renderCard: (c: DossierContact, i: number) => React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h4>
        {contacts.length > 0 && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">
            {contacts.length}
          </span>
        )}
      </div>
      {contacts.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg px-4 py-3 text-center">
          <p className="text-xs text-slate-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">{contacts.map(renderCard)}</div>
      )}
    </div>
  );
}

function AssociatedContactCard({ assoc }: { assoc: AssociatedContact }) {
  const [expanded, setExpanded] = useState(false);
  const totalContacts = assoc.phones.length + assoc.emails.length + assoc.addresses.length;

  return (
    <div className="bg-white border border-slate-150 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <div className={`p-1.5 rounded-lg ${assoc.entityType === 'org' ? 'bg-sky-50' : 'bg-teal-50'}`}>
          {assoc.entityType === 'org'
            ? <Building2 className="h-3.5 w-3.5 text-sky-600" />
            : <User className="h-3.5 w-3.5 text-teal-600" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700 truncate block">{assoc.name}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-400">{assoc.role}</span>
            <span className="text-[10px] text-slate-300">
              {totalContacts} contact{totalContacts !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-slate-300">
              {assoc.linkedBbls.length} BBL{assoc.linkedBbls.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        }
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100 pt-2">
          {assoc.phones.map((p, i) => (
            <div key={`p-${i}`} className="flex items-center gap-2 text-xs text-slate-600">
              <Phone className="h-3 w-3 text-slate-400" />
              <span>{p.value}</span>
              <SourceBadge source={p.source} />
              <CopyButton value={p.value} />
            </div>
          ))}
          {assoc.emails.map((e, i) => (
            <div key={`e-${i}`} className="flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-3 w-3 text-slate-400" />
              <a href={`mailto:${e.value}`} className="text-teal-700 hover:underline">{e.value}</a>
              <SourceBadge source={e.source} />
              <CopyButton value={e.value} />
            </div>
          ))}
          {assoc.addresses.map((a, i) => (
            <div key={`a-${i}`} className="flex items-start gap-2 text-xs text-slate-600">
              <MapPin className="h-3 w-3 text-slate-400 mt-0.5" />
              <span>{a.value}</span>
              <SourceBadge source={a.source} />
            </div>
          ))}
          {assoc.linkedBbls.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {assoc.linkedBbls.map((bbl) => (
                <span key={bbl} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">
                  {bbl}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrichmentAccordion({
  icon,
  title,
  badge,
  summary,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">{badge}</span>
        )}
        <span className="text-[10px] text-slate-400 ml-auto mr-1">{summary}</span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

function OsintCandidateCard({
  contact,
  contactType,
  icon,
  href,
  ownerId,
  onAccepted,
}: {
  contact: DossierContact;
  contactType: 'phone' | 'email' | 'address';
  icon: React.ReactNode;
  href?: string;
  ownerId: string;
  onAccepted: (info: AcceptedContact) => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await acceptContact({
        ownerId,
        contactType,
        value: contact.value,
        source: 'ai_enrichment',
        confidence: contact.confidence,
        evidence: contact.evidence || 'AI web search',
      });
      setAccepted(true);
      onAccepted({
        contactType,
        value: contact.value,
        source: 'ai_enrichment',
        confidence: contact.confidence,
        evidence: contact.evidence || 'AI web search',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-150 rounded-lg px-3 py-2.5 hover:border-slate-300 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {href ? (
              <a href={href} className="text-sm text-teal-700 hover:text-teal-900 hover:underline truncate">
                {contact.value}
              </a>
            ) : (
              <span className="text-sm text-slate-700 truncate">{contact.value}</span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-600">
              AI Search
            </span>
            <span className={`text-[10px] font-medium ${
              contact.confidence >= 0.7 ? 'text-emerald-600' :
              contact.confidence >= 0.5 ? 'text-amber-600' :
              'text-slate-400'
            }`}>
              {Math.round(contact.confidence * 100)}%
            </span>
          </div>
          {contact.evidence && (
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed truncate" title={contact.evidence}>
              {contact.evidence}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <CopyButton value={contact.value} />
          {accepted ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded">
              <Check className="h-3 w-3" />
              Accepted
            </span>
          ) : (
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 disabled:opacity-50 transition-colors"
            >
              {accepting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Accept
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function OsintResultsPanel({
  osint,
  ownerId,
  onContactAccepted,
}: {
  osint: OsintResult;
  ownerId: string;
  onContactAccepted: (info: AcceptedContact) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">{osint.disclaimer}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-150 rounded-lg p-3">
        <p className="text-xs text-slate-600 leading-relaxed">{osint.findings}</p>
      </div>

      {osint.contacts.phones.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {osint.contacts.phones.map((p, i) => (
            <OsintCandidateCard
              key={`osint-p-${i}`}
              contact={p}
              contactType="phone"
              icon={<Phone className="h-3.5 w-3.5" />}
              ownerId={ownerId}
              onAccepted={onContactAccepted}
            />
          ))}
        </div>
      )}

      {osint.contacts.emails.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {osint.contacts.emails.map((e, i) => (
            <OsintCandidateCard
              key={`osint-e-${i}`}
              contact={e}
              contactType="email"
              icon={<Mail className="h-3.5 w-3.5" />}
              href={`mailto:${e.value}`}
              ownerId={ownerId}
              onAccepted={onContactAccepted}
            />
          ))}
        </div>
      )}

      {osint.contacts.addresses.length > 0 && (
        <div className="grid gap-2">
          {osint.contacts.addresses.map((a, i) => (
            <OsintCandidateCard
              key={`osint-a-${i}`}
              contact={a}
              contactType="address"
              icon={<MapPin className="h-3.5 w-3.5" />}
              ownerId={ownerId}
              onAccepted={onContactAccepted}
            />
          ))}
        </div>
      )}

      {osint.contacts.websites.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Websites</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {osint.contacts.websites.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 transition-colors"
              >
                <Globe className="h-3 w-3" />
                {url.replace(/^https?:\/\//, '').slice(0, 40)}
              </a>
            ))}
          </div>
        </div>
      )}

      {osint.contacts.businessInfo.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Business Records</span>
          </div>
          <div className="space-y-1.5">
            {osint.contacts.businessInfo.map((info, i) => (
              <div key={i} className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
                {info}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContactTab({ ownerId, entityName, bbls }: ContactTabProps) {
  const [dossier, setDossier] = useState<ContactDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [webEnriching, setWebEnriching] = useState(false);
  const [webResults, setWebResults] = useState<WebEnrichmentResult | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [serpEnriching, setSerpEnriching] = useState(false);
  const [serpResults, setSerpResults] = useState<SerpEnrichmentResult | null>(null);
  const [serpError, setSerpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDossier(null);
    setWebResults(null);
    setSerpResults(null);

    fetchOwnerContacts(ownerId)
      .then((data) => {
        if (!cancelled) setDossier(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contacts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    runWebEnrichment(entityName, ownerId, false, true)
      .then((data) => {
        if (!cancelled && data.candidates.length > 0) setWebResults(data);
      })
      .catch(() => {});

    runSerpEnrichment(entityName, ownerId, undefined, undefined, false, true)
      .then((data) => {
        if (!cancelled && data.candidates.length > 0) setSerpResults(data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [ownerId, entityName]);

  const handleEnrich = useCallback(async () => {
    setEnriching(true);
    try {
      const data = await fetchOwnerContacts(ownerId, true);
      setDossier(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  }, [ownerId]);

  const handleDobIngest = useCallback(async () => {
    if (bbls.length === 0) return;
    setIngesting(true);
    setIngestMessage(null);
    try {
      const result = await ingestDobNow(bbls, ownerId);
      const parts = [`Found ${result.filings_found} filings, saved ${result.records_upserted} contacts`];
      if (result.events_created > 0) parts.push(`${result.events_created} job events linked`);
      setIngestMessage(parts.join(', '));
      const refreshed = await fetchOwnerContacts(ownerId);
      setDossier(refreshed);
    } catch (e) {
      setIngestMessage(e instanceof Error ? e.message : 'DOB ingest failed');
    } finally {
      setIngesting(false);
    }
  }, [ownerId, bbls]);

  const handleWebEnrich = useCallback(async (forceRefresh = false) => {
    setWebEnriching(true);
    setWebError(null);
    try {
      const data = await runWebEnrichment(entityName, ownerId, forceRefresh);
      setWebResults(data);
    } catch (e) {
      setWebError(e instanceof Error ? e.message : 'Web enrichment failed');
    } finally {
      setWebEnriching(false);
    }
  }, [entityName, ownerId]);

  const handleContactAccepted = useCallback((info: AcceptedContact) => {
    setDossier(prev => {
      if (!prev) return prev;
      const newContact: DossierContact = {
        value: info.value,
        source: info.source,
        confidence: info.confidence,
        lastSeen: new Date().toISOString(),
        evidence: info.evidence,
      };
      const key = info.contactType === 'phone' ? 'phones' :
                   info.contactType === 'email' ? 'emails' : 'addresses';
      const existing = prev[key];
      const isDupe = existing.some(c => c.value === info.value);
      if (isDupe) return prev;
      return {
        ...prev,
        [key]: [newContact, ...existing],
        totalContactCount: prev.totalContactCount + 1,
      };
    });
    setTimeout(async () => {
      try {
        const refreshed = await fetchOwnerContacts(ownerId);
        setDossier(refreshed);
      } catch {
        // background refresh failure - optimistic update already applied
      }
    }, 1000);
  }, [ownerId]);

  const handleContactRemoved = useCallback((contactType: 'phone' | 'email' | 'address', value: string) => {
    setDossier(prev => {
      if (!prev) return prev;
      const key = contactType === 'phone' ? 'phones' :
                   contactType === 'email' ? 'emails' : 'addresses';
      const filtered = prev[key].filter(c => c.value !== value);
      return {
        ...prev,
        [key]: filtered,
        totalContactCount: prev.totalContactCount - (prev[key].length - filtered.length),
      };
    });
    removeContact({ ownerId, contactType, value }).catch(() => {
      fetchOwnerContacts(ownerId).then(setDossier).catch(() => {});
    });
  }, [ownerId]);

  const handleSerpEnrich = useCallback(async (forceRefresh = false) => {
    setSerpEnriching(true);
    setSerpError(null);
    try {
      const data = await runSerpEnrichment(entityName, ownerId, undefined, undefined, forceRefresh);
      setSerpResults(data);
    } catch (e) {
      setSerpError(e instanceof Error ? e.message : 'SERP enrichment failed');
    } finally {
      setSerpEnriching(false);
    }
  }, [entityName, ownerId]);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-6 w-6 text-teal-500 animate-spin mb-3" />
        <p className="text-xs text-slate-400">Aggregating contact data across all sources...</p>
      </div>
    );
  }

  if (error && !dossier) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!dossier) return null;

  const hasAnyContacts = dossier.phones.length > 0 || dossier.emails.length > 0 || dossier.addresses.length > 0;
  const hasAssociated = dossier.associatedContacts.length > 0;

  return (
    <div className="space-y-5">
      {ingestMessage && (
        <div className="flex items-center gap-2 text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {ingestMessage}
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${dossier.entityType === 'org' ? 'bg-sky-100' : 'bg-teal-100'}`}>
            {dossier.entityType === 'org'
              ? <Building2 className="h-4 w-4 text-sky-600" />
              : <User className="h-4 w-4 text-teal-600" />
            }
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{dossier.entityName}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              dossier.entityType === 'org' ? 'bg-sky-50 text-sky-700' : 'bg-teal-50 text-teal-700'
            }`}>
              {dossier.entityType}
            </span>
          </div>
        </div>
        {dossier.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-slate-400 mr-1 self-center">AKA</span>
            {dossier.aliases.slice(0, 8).map((alias, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                {alias}
              </span>
            ))}
            {dossier.aliases.length > 8 && (
              <span className="text-[10px] text-slate-400">+{dossier.aliases.length - 8} more</span>
            )}
          </div>
        )}
      </div>

      {!hasAnyContacts && !hasAssociated && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center space-y-3">
          <Shield className="h-8 w-8 text-slate-200 mx-auto" />
          <div>
            <p className="text-sm font-medium text-slate-500">No contact information found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Contact data is sourced from DOB filings, HPD registrations, ACRIS deeds, and other public records.
              Try the actions below to discover contacts.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={handleDobIngest}
              disabled={ingesting || bbls.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
            >
              {ingesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {ingesting ? 'Fetching DOB filings...' : 'Fetch DOB Filings'}
            </button>
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {enriching ? 'Searching...' : 'AI Search Public Records'}
            </button>
            <button
              onClick={() => handleWebEnrich()}
              disabled={webEnriching}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 disabled:opacity-50 transition-colors"
            >
              {webEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {webEnriching ? 'Searching web...' : 'Web Enrichment (ScrapingBee)'}
            </button>
            <button
              onClick={() => handleSerpEnrich()}
              disabled={serpEnriching}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            >
              {serpEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {serpEnriching ? 'Searching SERP...' : 'SERP Enrichment'}
            </button>
          </div>
        </div>
      )}

      <ContactSection
        title="Phone Numbers"
        icon={<Phone className="h-4 w-4" />}
        contacts={dossier.phones}
        emptyMessage="No phone numbers found across DOB, HPD, or ACRIS records"
        renderCard={(c, i) => (
          <ContactCard
            key={`phone-${i}`}
            contact={c}
            icon={<Phone className="h-3.5 w-3.5" />}
            href={`tel:${c.value.replace(/\D/g, '')}`}
            onRemove={() => handleContactRemoved('phone', c.value)}
          />
        )}
      />

      <ContactSection
        title="Email Addresses"
        icon={<Mail className="h-4 w-4" />}
        contacts={dossier.emails}
        emptyMessage="No email addresses found -- try AI Search to discover public listings"
        renderCard={(c, i) => (
          <ContactCard
            key={`email-${i}`}
            contact={c}
            icon={<Mail className="h-3.5 w-3.5" />}
            href={`mailto:${c.value}`}
            onRemove={() => handleContactRemoved('email', c.value)}
          />
        )}
      />

      <ContactSection
        title="Addresses"
        icon={<MapPin className="h-4 w-4" />}
        contacts={dossier.addresses}
        emptyMessage="No addresses found across filing records"
        renderCard={(c, i) => (
          <ContactCard
            key={`addr-${i}`}
            contact={c}
            icon={<MapPin className="h-3.5 w-3.5" />}
            onRemove={() => handleContactRemoved('address', c.value)}
          />
        )}
      />

      {hasAssociated && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Users className="h-4 w-4 text-slate-400" />
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Associated Contacts</h4>
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">
              {dossier.associatedContacts.length}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2">
            People and organizations appearing on filings for the same properties
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {dossier.associatedContacts.map((assoc, i) => (
              <AssociatedContactCard key={i} assoc={assoc} />
            ))}
          </div>
        </div>
      )}

      {dossier.osint && (
        <EnrichmentAccordion
          icon={<Zap className="h-4 w-4 text-amber-500" />}
          title="AI Enrichment Results"
          summary={`${dossier.osint.contacts.phones.length} phones, ${dossier.osint.contacts.emails.length} emails, ${dossier.osint.contacts.addresses.length} addresses`}
        >
          <OsintResultsPanel
            osint={dossier.osint}
            ownerId={ownerId}
            onContactAccepted={handleContactAccepted}
          />
        </EnrichmentAccordion>
      )}

      {webError && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {webError}
        </div>
      )}

      {webResults && (
        <EnrichmentAccordion
          icon={<Globe className="h-4 w-4 text-cyan-600" />}
          title="Web Enrichment"
          badge={webResults.cached ? 'cached' : undefined}
          summary={`${webResults.candidates.filter(c => c.type === 'phone').length} phones, ${webResults.candidates.filter(c => c.type === 'email').length} emails`}
        >
          <WebEnrichmentPanel
            ownerId={ownerId}
            result={webResults}
            onContactAccepted={handleContactAccepted}
            onRetry={() => handleWebEnrich(true)}
            retrying={webEnriching}
          />
        </EnrichmentAccordion>
      )}

      {serpError && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {serpError}
        </div>
      )}

      {serpResults && (
        <EnrichmentAccordion
          icon={<Search className="h-4 w-4 text-orange-500" />}
          title="SERP Enrichment"
          badge={serpResults.cached ? 'cached' : undefined}
          summary={`${serpResults.candidates.filter(c => c.type === 'phone').length} phones, ${serpResults.candidates.filter(c => c.type === 'email').length} emails`}
        >
          <SerpEnrichmentPanel
            ownerId={ownerId}
            result={serpResults}
            onContactAccepted={handleContactAccepted}
            onRetry={() => handleSerpEnrich(true)}
            retrying={serpEnriching}
          />
        </EnrichmentAccordion>
      )}

      {hasAnyContacts && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <button
            onClick={handleDobIngest}
            disabled={ingesting || bbls.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
          >
            {ingesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {ingesting ? 'Fetching...' : 'Refresh DOB Filings'}
          </button>
          <button
            onClick={handleEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {enriching ? 'Searching...' : dossier.osint ? 'Refresh AI Search' : 'AI Search Public Records'}
          </button>
          <button
            onClick={() => handleWebEnrich()}
            disabled={webEnriching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 disabled:opacity-50 transition-colors"
          >
            {webEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            {webEnriching ? 'Searching web...' : webResults ? 'Refresh Web Search' : 'Web Enrichment (ScrapingBee)'}
          </button>
          <button
            onClick={() => handleSerpEnrich()}
            disabled={serpEnriching}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
          >
            {serpEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {serpEnriching ? 'SERP...' : serpResults ? 'Refresh SERP Search' : 'SERP Enrichment'}
          </button>
          <span className="ml-auto text-[10px] text-slate-300">
            Last updated {new Date(dossier.enrichedAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
