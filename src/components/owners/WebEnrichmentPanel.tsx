import { useState } from 'react';
import {
  Globe,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { acceptContact } from '../../lib/owners/api';
import type { WebEnrichmentResult, WebContactCandidate, AcceptedContact } from '../../types/owners';

interface WebEnrichmentPanelProps {
  ownerId: string;
  result: WebEnrichmentResult;
  onContactAccepted: (info: AcceptedContact) => void;
  onRetry?: () => void;
  retrying?: boolean;
}

function CandidateIcon({ type }: { type: string }) {
  if (type === 'email') return <Mail className="h-3.5 w-3.5 text-slate-400" />;
  if (type === 'phone') return <Phone className="h-3.5 w-3.5 text-slate-400" />;
  return <MapPin className="h-3.5 w-3.5 text-slate-400" />;
}

function CandidateCard({
  candidate,
  ownerId,
  onAccepted,
}: {
  candidate: WebContactCandidate;
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
        contactType: candidate.type,
        value: candidate.value,
        source: 'web_enrichment',
        confidence: candidate.confidence,
        evidence: candidate.evidenceSnippet,
        sourceUrl: candidate.sourceUrl,
      });
      setAccepted(true);
      onAccepted({
        contactType: candidate.type,
        value: candidate.value,
        source: 'web_enrichment',
        confidence: candidate.confidence,
        evidence: candidate.evidenceSnippet,
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
        <div className="mt-0.5 flex-shrink-0">
          <CandidateIcon type={candidate.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {candidate.type === 'email' ? (
              <a
                href={`mailto:${candidate.value}`}
                className="text-sm text-teal-700 hover:text-teal-900 hover:underline truncate"
              >
                {candidate.value}
              </a>
            ) : candidate.type === 'phone' ? (
              <a
                href={`tel:${candidate.value.replace(/\D/g, '')}`}
                className="text-sm text-teal-700 hover:text-teal-900 hover:underline"
              >
                {candidate.value}
              </a>
            ) : (
              <span className="text-sm text-slate-700 truncate">{candidate.value}</span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-700">
              Web
            </span>
            <span className={`text-[10px] font-medium ${
              candidate.confidence >= 0.7 ? 'text-emerald-600' :
              candidate.confidence >= 0.5 ? 'text-amber-600' :
              'text-slate-400'
            }`}>
              {Math.round(candidate.confidence * 100)}%
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed font-mono truncate" title={candidate.evidenceSnippet}>
            {candidate.evidenceSnippet}
          </p>
        </div>
        <div className="flex-shrink-0">
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
      {error && (
        <p className="text-[10px] text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}

function SourceGroup({
  sourceUrl,
  title,
  candidates,
  ownerId,
  onAccepted,
}: {
  sourceUrl: string;
  title: string;
  candidates: WebContactCandidate[];
  ownerId: string;
  onAccepted: (info: AcceptedContact) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <Globe className="h-3 w-3 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-medium text-slate-600 truncate flex-1">{title}</span>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{candidates.length} contact{candidates.length !== 1 ? 's' : ''}</span>
        {expanded ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-teal-600 transition-colors"
          >
            {sourceUrl.replace(/^https?:\/\//, '').slice(0, 60)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
          {candidates.map((c, i) => (
            <CandidateCard
              key={`${c.type}-${c.value}-${i}`}
              candidate={c}
              ownerId={ownerId}
              onAccepted={onAccepted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WebEnrichmentPanel({ ownerId, result, onContactAccepted, onRetry, retrying }: WebEnrichmentPanelProps) {
  const [showSources, setShowSources] = useState(false);

  const grouped = new Map<string, { title: string; candidates: WebContactCandidate[] }>();
  for (const c of result.candidates) {
    const existing = grouped.get(c.sourceUrl);
    if (existing) {
      existing.candidates.push(c);
    } else {
      const src = result.sources.find((s) => s.url === c.sourceUrl);
      grouped.set(c.sourceUrl, {
        title: src?.title || new URL(c.sourceUrl).hostname,
        candidates: [c],
      });
    }
  }

  const emailCount = result.candidates.filter((c) => c.type === 'email').length;
  const phoneCount = result.candidates.filter((c) => c.type === 'phone').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Globe className="h-4 w-4 text-cyan-600" />
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Web Enrichment Results</h4>
        {result.cached && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px]">cached</span>
        )}
        {result.cached && onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50 rounded transition-colors disabled:opacity-50"
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{result.sources.length} pages searched</span>
        <span className="text-slate-200">|</span>
        <span>{emailCount} email{emailCount !== 1 ? 's' : ''}</span>
        <span className="text-slate-200">|</span>
        <span>{phoneCount} phone{phoneCount !== 1 ? 's' : ''}</span>
      </div>

      {result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              {result.warnings.slice(0, 5).map((w, i) => (
                <p key={i} className="text-[10px] text-amber-700">{w}</p>
              ))}
              {result.warnings.length > 5 && (
                <p className="text-[10px] text-amber-500">+{result.warnings.length - 5} more warnings</p>
              )}
            </div>
          </div>
        </div>
      )}

      {result.candidates.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          <Info className="h-5 w-5 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No contact information found in web search results.</p>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 disabled:opacity-50 transition-colors"
            >
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry (bypass cache)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([url, { title, candidates }]) => (
            <SourceGroup
              key={url}
              sourceUrl={url}
              title={title}
              candidates={candidates}
              ownerId={ownerId}
              onAccepted={onContactAccepted}
            />
          ))}
        </div>
      )}

      {result.sources.length > 0 && (
        <div>
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSources ? 'Hide' : 'Show'} all {result.sources.length} sources
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
                    {s.snippet && (
                      <p className="text-slate-400 truncate">{s.snippet}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-cyan-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-cyan-700">
            Web-sourced contacts are extracted from publicly accessible pages via ScrapingBee.
            Each result includes a verbatim evidence snippet from the source page. Verify before accepting.
          </p>
        </div>
      </div>
    </div>
  );
}
