import { useState } from 'react';
import {
  Mail,
  ExternalLink,
  Check,
  Loader2,
  AlertTriangle,
  Info,
  Shield,
  ChevronDown,
  ChevronUp,
  Globe,
  User,
  Briefcase,
  RefreshCw,
} from 'lucide-react';
import { acceptContact, updateOwnerWebsite } from '../../lib/owners/api';
import type { HunterEnrichmentResult, HunterCandidate, HunterVerificationStatus } from '../../types/owners';

interface HunterEnrichmentPanelProps {
  ownerId: string;
  result: HunterEnrichmentResult;
  onContactAccepted: () => void;
  onDomainSaved?: (domain: string) => void;
  onRetry?: () => void;
  retrying?: boolean;
}

function VerificationBadge({ status }: { status?: HunterVerificationStatus | string }) {
  if (!status) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400">
        unverified
      </span>
    );
  }
  const styles: Record<string, string> = {
    valid: 'bg-emerald-50 text-emerald-700',
    invalid: 'bg-red-50 text-red-600',
    accept_all: 'bg-amber-50 text-amber-700',
    webmail: 'bg-sky-50 text-sky-700',
    disposable: 'bg-red-50 text-red-500',
    unknown: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || styles.unknown}`}>
      {status}
    </span>
  );
}

function HunterCandidateRow({
  candidate,
  ownerId,
  onAccepted,
}: {
  candidate: HunterCandidate;
  ownerId: string;
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptContact({
        ownerId,
        contactType: 'email',
        value: candidate.value,
        source: (candidate as { source?: string }).source || 'hunter_domain_search',
        confidence: candidate.confidence,
        evidence: candidate.evidenceSnippet,
        sourceUrl: candidate.sourceUrl,
      });
      setAccepted(true);
      if (!result.duplicate) onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setAccepting(false);
    }
  };

  const name = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ');

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-25 transition-colors">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
          <a
            href={`mailto:${candidate.value}`}
            className="text-sm text-teal-700 hover:text-teal-900 hover:underline truncate"
          >
            {candidate.value}
          </a>
        </div>
      </td>
      <td className="py-2 px-3">
        {name ? (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 text-slate-300" />
            <span className="text-xs text-slate-600">{name}</span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300">--</span>
        )}
      </td>
      <td className="py-2 px-3">
        {candidate.position ? (
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-3 w-3 text-slate-300" />
            <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={candidate.position}>
              {candidate.position}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300">--</span>
        )}
      </td>
      <td className="py-2 px-3 text-center">
        <VerificationBadge status={candidate.verificationStatus} />
      </td>
      <td className="py-2 px-3 text-center">
        <span className="text-[10px] text-slate-500">{Math.round(candidate.confidence * 100)}%</span>
      </td>
      <td className="py-2 px-3 text-right">
        {accepted ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded">
            <Check className="h-3 w-3" />
            Saved
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
        {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
      </td>
    </tr>
  );
}

function DomainPrompt({
  ownerId,
  onSaved,
}: {
  ownerId: string;
  onSaved: (domain: string) => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateOwnerWebsite(ownerId, trimmed);
      onSaved(result.domain);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
      <div className="flex items-start gap-2 mb-3">
        <Globe className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-emerald-800">Website / Domain Required</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">
            Hunter.io needs a domain to search for email addresses. Enter the owner's company website or domain.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="e.g. example.com or https://www.example.com"
          className="flex-1 px-3 py-2 text-xs border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 placeholder:text-slate-300"
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Domain
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}

export default function HunterEnrichmentPanel({
  ownerId,
  result,
  onContactAccepted,
  onDomainSaved,
  onRetry,
  retrying,
}: HunterEnrichmentPanelProps) {
  const [showSources, setShowSources] = useState(false);

  const noDomain = !result.domain && result.warnings.some((w) => w.includes('No domain'));

  if (noDomain) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2.5">
          <Shield className="h-4 w-4 text-emerald-500" />
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hunter.io Email Enrichment</h4>
        </div>
        <DomainPrompt
          ownerId={ownerId}
          onSaved={(domain) => onDomainSaved?.(domain)}
        />
      </div>
    );
  }

  const validCount = result.candidates.filter((c) => c.verificationStatus === 'valid').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Shield className="h-4 w-4 text-emerald-500" />
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hunter.io Email Enrichment</h4>
        {result.cached && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">cached</span>
        )}
        {result.cached && onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        )}
      </div>

      {result.domain && (
        <div className="flex items-center gap-2 text-xs">
          <Globe className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-slate-500">Domain:</span>
          <a
            href={`https://${result.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 hover:underline font-medium"
          >
            {result.domain}
          </a>
          <ExternalLink className="h-3 w-3 text-slate-300" />
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{result.candidates.length} email{result.candidates.length !== 1 ? 's' : ''} found</span>
        {validCount > 0 && (
          <>
            <span className="text-slate-200">|</span>
            <span className="text-emerald-600">{validCount} verified</span>
          </>
        )}
      </div>

      {result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-700">{w}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {result.candidates.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          <Info className="h-5 w-5 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">
            No email addresses found on {result.domain || 'this domain'}.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry (bypass cache)
            </button>
          )}
        </div>
      ) : (
        <div className="border border-slate-150 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Email</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Position</th>
                  <th className="text-center py-2 px-3 text-slate-500 font-medium">Status</th>
                  <th className="text-center py-2 px-3 text-slate-500 font-medium">Score</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c, i) => (
                  <HunterCandidateRow
                    key={`${c.value}-${i}`}
                    candidate={c}
                    ownerId={ownerId}
                    onAccepted={onContactAccepted}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.sources.length > 0 && (
        <div>
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSources ? 'Hide' : 'Show'} {result.sources.length} source{result.sources.length !== 1 ? 's' : ''}
          </button>
          {showSources && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {result.sources.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span className="text-slate-300 flex-shrink-0 w-4 text-right">{i + 1}.</span>
                  <div className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline truncate block"
                    >
                      {s.title}
                    </a>
                    {s.snippet && <p className="text-slate-400 truncate">{s.snippet}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-emerald-700">
            Emails discovered via Hunter.io domain search and email finder.
            Verification status is provided by Hunter's deliverability engine. Verify independently before sending.
          </p>
        </div>
      </div>
    </div>
  );
}
