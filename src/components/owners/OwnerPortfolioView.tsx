import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  User,
  ExternalLink,
  Loader2,
  AlertCircle,
  DollarSign,
  HardHat,
  Shield,
  Link2,
  ArrowLeft,
  RefreshCw,
  Inbox,
  Contact,
  Phone,
  Mail,
} from 'lucide-react';
import { fetchOwnerPortfolio, ingestDobNow, triggerReindex } from '../../lib/owners/api';
import ContactTab from './ContactTab';
import type {
  OwnerSearchResult,
  OwnerPortfolio,
  OwnerEntityEvent,
  AssociatedEntity,
} from '../../types/owners';

interface OwnerPortfolioViewProps {
  owner: OwnerSearchResult;
  onAnalyze: (bbl: string) => void;
  onNavigateToEntity?: (entity: AssociatedEntity) => void;
  onBack?: () => void;
  hasPreviousEntity?: boolean;
}

function ContactSummary({ portfolio, onGoToContacts }: { portfolio: OwnerPortfolio; onGoToContacts: () => void }) {
  const { emails, phones, addresses } = portfolio.owner;
  const parts: string[] = [];
  if (phones.length > 0) parts.push(`${phones.length} phone${phones.length !== 1 ? 's' : ''}`);
  if (emails.length > 0) parts.push(`${emails.length} email${emails.length !== 1 ? 's' : ''}`);
  if (addresses.length > 0) parts.push(`${addresses.length} address${addresses.length !== 1 ? 'es' : ''}`);

  if (parts.length === 0) return null;

  return (
    <button
      onClick={onGoToContacts}
      className="mx-5 mt-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 hover:bg-slate-100 transition-colors w-fit"
    >
      <Contact className="h-3.5 w-3.5 text-slate-400" />
      <span>{parts.join(', ')}</span>
      <span className="text-teal-600 font-medium ml-1">View contact info</span>
    </button>
  );
}

function PropertiesTable({
  properties,
  onAnalyze,
}: {
  properties: OwnerPortfolio['properties'];
  onAnalyze: (bbl: string) => void;
}) {
  if (properties.length === 0) {
    return <p className="text-sm text-slate-400 py-4">No linked properties</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 text-slate-500 font-medium">BBL</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Address</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Role</th>
            <th className="text-center py-2 px-3 text-slate-500 font-medium">Confidence</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Last Purchase</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">DOB Job</th>
            <th className="text-right py-2 px-3 text-slate-500 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.bbl} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td className="py-2.5 px-3 font-mono text-slate-700">{p.bbl}</td>
              <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">{p.address || '--'}</td>
              <td className="py-2.5 px-3">
                <div className="flex flex-wrap gap-1">
                  {p.relationship_types.map((r) => (
                    <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      r === 'owner' ? 'bg-teal-50 text-teal-700' :
                      r === 'developer' ? 'bg-sky-50 text-sky-700' :
                      r === 'borrower' ? 'bg-amber-50 text-amber-700' :
                      r === 'lender' ? 'bg-orange-50 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {r}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2.5 px-3 text-center">
                <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  p.confidence >= 0.8 ? 'bg-emerald-50 text-emerald-700' :
                  p.confidence >= 0.6 ? 'bg-amber-50 text-amber-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {(p.confidence * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-2.5 px-3 text-slate-500">
                {p.last_purchase_date && p.last_purchase_date !== '1900-01-01'
                  ? new Date(p.last_purchase_date).toLocaleDateString()
                  : '--'}
                {p.last_purchase_price ? ` ($${(p.last_purchase_price / 1e6).toFixed(1)}M)` : ''}
              </td>
              <td className="py-2.5 px-3 text-slate-500 font-mono">
                {p.last_dob_job || '--'}
              </td>
              <td className="py-2.5 px-3 text-right">
                <button
                  onClick={() => onAnalyze(p.bbl)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 transition-colors"
                >
                  Analyze
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatEventDate(date: string | null): string {
  if (!date || date === '1900-01-01') return '--';
  return new Date(date).toLocaleDateString();
}

function formatAmount(amount: unknown): string {
  if (typeof amount !== 'number' || amount === 0) return '--';
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function PurchasesTable({ events }: { events: OwnerEntityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <DollarSign className="h-8 w-8 text-slate-200 mb-3" />
        <p className="text-sm text-slate-400">No purchase events recorded</p>
        <p className="text-xs text-slate-300 mt-1">
          Purchase data is sourced from ACRIS deed recordings
        </p>
      </div>
    );
  }

  const hasViaBbl = events.some((ev) => ev.payload?.via_bbl);

  return (
    <div>
      {hasViaBbl && (
        <div className="mb-2 text-[10px] text-slate-400 flex items-center gap-1.5">
          <span className="px-1 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-medium">BBL</span>
          = transaction on this property by another party
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Date</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">BBL</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Doc Type</th>
              <th className="text-right py-2 px-3 text-slate-500 font-medium">Amount</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Seller</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Buyer</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => {
              const p = ev.payload || {};
              const viaBbl = !!p.via_bbl;
              return (
                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${viaBbl ? 'opacity-75' : ''}`}>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    {formatEventDate(ev.occurred_at)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      {ev.bbl}
                      {viaBbl && (
                        <span className="px-1 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-medium">BBL</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                      {(p.docType as string) || 'DEED'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                    {formatAmount(p.amount)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[140px] truncate">
                    {(p.party1 as string) || '--'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[140px] truncate">
                    {(p.party2 as string) || '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DobJobsTable({
  events,
  bbls,
  onIngest,
  ingesting,
}: {
  events: OwnerEntityEvent[];
  bbls: string[];
  onIngest: () => void;
  ingesting: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <HardHat className="h-8 w-8 text-slate-200 mb-3" />
        <p className="text-sm text-slate-400">No DOB NOW job filings found</p>
        <p className="text-xs text-slate-300 mt-1 max-w-sm">
          Click below to fetch DOB NOW filing data from NYC Open Data for this owner's properties
        </p>
        <button
          onClick={onIngest}
          disabled={ingesting}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
        >
          {ingesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {ingesting ? 'Fetching DOB filings...' : 'Fetch DOB Filings'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={onIngest}
          disabled={ingesting}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 disabled:opacity-50 transition-colors"
        >
          {ingesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Date</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Job #</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Type</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Owner / Business</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">Contact</th>
              <th className="text-left py-2 px-3 text-slate-500 font-medium">BBL</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => {
              const p = ev.payload || {};
              const ownerName = (p.ownerName as string) || '';
              const bizName = (p.businessName as string) || '';
              const displayName = ownerName && bizName && ownerName !== bizName
                ? ownerName
                : ownerName || bizName || '--';
              const displayBiz = ownerName && bizName && ownerName !== bizName
                ? bizName
                : '';
              const phone = (p.phone as string) || '';
              const email = (p.email as string) || '';
              const jobType = (p.jobType as string) || '';
              const workType = (p.workType as string) || '';
              const typeLabel = [jobType, workType].filter(Boolean).join(' / ') || '--';

              return (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    {formatEventDate(ev.occurred_at)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-sky-700 font-medium whitespace-nowrap">
                    {(p.jobNumber as string) || '--'}
                  </td>
                  <td className="py-2.5 px-3">
                    {typeLabel !== '--' ? (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium whitespace-nowrap">
                        {typeLabel}
                      </span>
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 max-w-[180px]">
                    <div className="truncate text-slate-700 font-medium">{displayName}</div>
                    {displayBiz && (
                      <div className="truncate text-slate-400 text-[10px]">{displayBiz}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 max-w-[160px]">
                    {(phone || email) ? (
                      <div className="space-y-0.5">
                        {phone && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <Phone className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate font-mono text-[10px]">
                              {phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}
                            </span>
                          </div>
                        )}
                        {email && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <Mail className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate text-[10px]">{email}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{ev.bbl}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssociatedEntitiesTable({
  entities,
  onNavigate,
}: {
  entities: AssociatedEntity[];
  onNavigate?: (entity: AssociatedEntity) => void;
}) {
  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Link2 className="h-8 w-8 text-slate-200 mb-3" />
        <p className="text-sm text-slate-400">No associated entities found</p>
        <p className="text-xs text-slate-300 mt-1">
          Associated entities are discovered through shared property links
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Entity Name</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Type</th>
            <th className="text-left py-2 px-3 text-slate-500 font-medium">Roles</th>
            <th className="text-center py-2 px-3 text-slate-500 font-medium">Shared Properties</th>
            <th className="text-center py-2 px-3 text-slate-500 font-medium">Total Properties</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((ent) => (
            <tr key={ent.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td className="py-2.5 px-3">
                {onNavigate ? (
                  <button
                    onClick={() => onNavigate(ent)}
                    className="text-teal-700 hover:text-teal-900 hover:underline font-medium text-left"
                  >
                    {ent.canonical_name}
                  </button>
                ) : (
                  <span className="text-slate-700 font-medium">{ent.canonical_name}</span>
                )}
              </td>
              <td className="py-2.5 px-3">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  ent.entity_type === 'org' ? 'bg-sky-50 text-sky-700' :
                  ent.entity_type === 'person' ? 'bg-teal-50 text-teal-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {ent.entity_type === 'org' ? (
                    <Building2 className="h-2.5 w-2.5" />
                  ) : (
                    <User className="h-2.5 w-2.5" />
                  )}
                  {ent.entity_type}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <div className="flex flex-wrap gap-1">
                  {ent.relationship_types.map((r) => (
                    <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      r === 'owner' ? 'bg-teal-50 text-teal-700' :
                      r === 'developer' ? 'bg-sky-50 text-sky-700' :
                      r === 'borrower' ? 'bg-amber-50 text-amber-700' :
                      r === 'lender' ? 'bg-orange-50 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {r}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2.5 px-3 text-center">
                <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded font-mono text-[10px] font-medium">
                  {ent.shared_bbl_count}
                </span>
              </td>
              <td className="py-2.5 px-3 text-center text-slate-500">
                {ent.property_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TabKey = 'portfolio' | 'contacts' | 'purchases' | 'dobjobs' | 'entities';

export default function OwnerPortfolioView({
  owner,
  onAnalyze,
  onNavigateToEntity,
  onBack,
  hasPreviousEntity,
}: OwnerPortfolioViewProps) {
  const [portfolio, setPortfolio] = useState<OwnerPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('portfolio');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPortfolio(null);
    setActiveTab('portfolio');
    setIngestResult(null);

    fetchOwnerPortfolio(owner.id)
      .then((data) => {
        if (!cancelled) {
          setPortfolio({
            ...data,
            associated_entities: data.associated_entities || [],
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load portfolio');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [owner.id]);

  const handleDobIngest = useCallback(async () => {
    if (!portfolio) return;
    const bbls = portfolio.properties.map((p) => p.bbl);
    if (bbls.length === 0) return;

    setIngesting(true);
    setIngestResult(null);

    try {
      const result = await ingestDobNow(bbls, owner.id);
      const parts = [`Found ${result.filings_found} filings, saved ${result.records_upserted} contacts`];
      if (result.events_created > 0) parts.push(`${result.events_created} job events linked`);
      setIngestResult(parts.join(', '));

      const refreshed = await fetchOwnerPortfolio(owner.id);
      setPortfolio({
        ...refreshed,
        associated_entities: refreshed.associated_entities || [],
      });
    } catch (e) {
      setIngestResult(e instanceof Error ? e.message : 'DOB ingest failed');
    } finally {
      setIngesting(false);
    }
  }, [portfolio, owner.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 m-4">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!portfolio) return null;

  const contactCount = portfolio.owner.phones.length + portfolio.owner.emails.length + portfolio.owner.addresses.length;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'portfolio', label: 'Portfolio', count: portfolio.properties.length },
    { key: 'contacts', label: 'Contact Info', count: contactCount },
    { key: 'purchases', label: 'Recent Purchases', count: portfolio.recent_purchases.length },
    { key: 'dobjobs', label: 'DOB NOW Jobs', count: portfolio.recent_dob_jobs.length },
    { key: 'entities', label: 'Associated Entities', count: portfolio.associated_entities.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-start gap-3">
          {hasPreviousEntity && onBack && (
            <button
              onClick={onBack}
              className="mt-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
              title="Back to previous entity"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className={`p-2.5 rounded-xl ${
            portfolio.owner.entity_type === 'org' ? 'bg-sky-100' : 'bg-teal-100'
          }`}>
            {portfolio.owner.entity_type === 'org'
              ? <Building2 className="h-5 w-5 text-sky-600" />
              : <User className="h-5 w-5 text-teal-600" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-800 leading-tight truncate">
              {portfolio.owner.canonical_name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                portfolio.owner.entity_type === 'org' ? 'bg-sky-50 text-sky-700' :
                portfolio.owner.entity_type === 'person' ? 'bg-teal-50 text-teal-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {portfolio.owner.entity_type}
              </span>
              <span className="text-xs text-slate-400">
                {portfolio.properties.length} {portfolio.properties.length === 1 ? 'property' : 'properties'}
              </span>
            </div>
            {portfolio.owner.aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {portfolio.owner.aliases.slice(0, 5).map((alias, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                    {alias}
                  </span>
                ))}
                {portfolio.owner.aliases.length > 5 && (
                  <span className="text-[10px] text-slate-400">+{portfolio.owner.aliases.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        </div>

        {portfolio.warnings.length > 0 && (
          <div className="mt-3 space-y-1">
            {portfolio.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                <Shield className="h-3 w-3 flex-shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}
      </div>

      <ContactSummary portfolio={portfolio} onGoToContacts={() => setActiveTab('contacts')} />

      <div className="border-b border-slate-200">
        <div className="flex overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-teal-500 text-teal-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === t.key ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {ingestResult && (
          <div className="mb-3 flex items-center gap-2 text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">
            <Inbox className="h-3.5 w-3.5 flex-shrink-0" />
            {ingestResult}
          </div>
        )}

        {activeTab === 'portfolio' && (
          <PropertiesTable properties={portfolio.properties} onAnalyze={onAnalyze} />
        )}

        {activeTab === 'contacts' && (
          <ContactTab
            ownerId={owner.id}
            entityName={portfolio.owner.canonical_name}
            bbls={portfolio.properties.map((p) => p.bbl)}
          />
        )}

        {activeTab === 'purchases' && (
          <PurchasesTable events={portfolio.recent_purchases} />
        )}

        {activeTab === 'dobjobs' && (
          <DobJobsTable
            events={portfolio.recent_dob_jobs}
            bbls={portfolio.properties.map((p) => p.bbl)}
            onIngest={handleDobIngest}
            ingesting={ingesting}
          />
        )}

        {activeTab === 'entities' && (
          <AssociatedEntitiesTable
            entities={portfolio.associated_entities}
            onNavigate={onNavigateToEntity}
          />
        )}
      </div>
    </div>
  );
}
