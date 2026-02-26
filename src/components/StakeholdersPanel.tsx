import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileSearch,
  Landmark,
  Calendar,
  Link2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { StakeholderRecord } from '../types/stakeholders';

interface StakeholdersPanelProps {
  stakeholders?: StakeholderRecord[];
  bbl?: string;
  onSelectOwner?: (name: string) => void;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  OWNER: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Owner' },
  MANAGING_AGENT: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'Managing Agent' },
  ARCHITECT: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Architect' },
  ENGINEER: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Engineer' },
  GC: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'General Contractor' },
  APPLICANT: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Applicant' },
  FILING_REP: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Filing Representative' },
  SELLER: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Seller' },
  OTHER: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Other' },
};

function confidenceColor(score: number): string {
  if (score >= 0.85) return 'bg-emerald-100 text-emerald-700';
  if (score >= 0.60) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function StakeholderCard({ stakeholder, onSelectOwner }: { stakeholder: StakeholderRecord; onSelectOwner?: (name: string) => void }) {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const style = ROLE_STYLES[stakeholder.role] || ROLE_STYLES.OTHER;

  return (
    <div className="border border-slate-100 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${confidenceColor(stakeholder.confidence)}`}>
              {stakeholder.confidence.toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => onSelectOwner?.(stakeholder.orgName || stakeholder.name)}
            className="text-sm font-semibold text-teal-700 hover:text-teal-900 hover:underline truncate text-left block max-w-full transition-colors"
            title={`Search "${stakeholder.orgName || stakeholder.name}" in Owners tab`}
          >
            {stakeholder.name}
          </button>
          {stakeholder.orgName && stakeholder.orgName !== stakeholder.name && (
            <button
              onClick={() => onSelectOwner?.(stakeholder.orgName!)}
              className="text-xs text-slate-500 hover:text-teal-700 hover:underline truncate text-left block max-w-full transition-colors"
              title={`Search "${stakeholder.orgName}" in Owners tab`}
            >
              {stakeholder.orgName}
            </button>
          )}
        </div>
      </div>

      {stakeholder.license && (
        <div className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
            {stakeholder.license.type || 'License'}
          </span>
          <span className="text-slate-700 font-mono">{stakeholder.license.number}</span>
          {stakeholder.license.status && (
            <span className="text-slate-400">{stakeholder.license.status}</span>
          )}
        </div>
      )}

      {stakeholder.contacts && (stakeholder.contacts.phones.length > 0 || stakeholder.contacts.emails.length > 0) && (
        <div className="space-y-1.5">
          {stakeholder.contacts.phones.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
              <Phone className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span>{p.raw}</span>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.confidence >= 0.85 ? 'bg-emerald-400' : p.confidence >= 0.60 ? 'bg-amber-400' : 'bg-slate-300'}`} />
            </div>
          ))}
          {stakeholder.contacts.emails.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className="truncate">{e.email}</span>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.confidence >= 0.85 ? 'bg-emerald-400' : e.confidence >= 0.60 ? 'bg-amber-400' : 'bg-slate-300'}`} />
            </div>
          ))}
        </div>
      )}

      {stakeholder.addresses && stakeholder.addresses.length > 0 && (
        <div className="space-y-1.5">
          {stakeholder.addresses.map((addr, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
              <MapPin className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                {addr.line1 && <span>{addr.line1}</span>}
                {(addr.city || addr.state || addr.zip) && (
                  <span className="block text-slate-400">
                    {[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}
                  </span>
                )}
                <span className="text-slate-300">({addr.source})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stakeholder.dosEntity && (
        <div className="bg-amber-50/60 rounded-md p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Landmark className="h-3 w-3 text-amber-600" />
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">NY Dept. of State</span>
            <span className="text-[10px] text-amber-500 font-mono">#{stakeholder.dosEntity.dosId}</span>
          </div>
          <p className="text-xs font-medium text-slate-700">{stakeholder.dosEntity.entityName}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {stakeholder.dosEntity.entityType && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-700 text-[10px] font-medium">
                {stakeholder.dosEntity.entityType}
              </span>
            )}
            {stakeholder.dosEntity.county && (
              <span>{stakeholder.dosEntity.county} County</span>
            )}
            {stakeholder.dosEntity.filingDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                {new Date(stakeholder.dosEntity.filingDate).toLocaleDateString()}
              </span>
            )}
          </div>
          {stakeholder.dosEntity.processName && (
            <div className="text-[11px] text-slate-500">
              <span className="text-slate-400">Registered Agent: </span>
              {stakeholder.dosEntity.processName}
            </div>
          )}
          {stakeholder.dosEntity.processAddress && (
            <div className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <MapPin className="h-2.5 w-2.5 mt-0.5 flex-shrink-0 text-slate-400" />
              <span>{stakeholder.dosEntity.processAddress}</span>
            </div>
          )}
        </div>
      )}

      {stakeholder.provenance.length > 0 && (
        <div>
          <button
            onClick={() => setProvenanceOpen(!provenanceOpen)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <FileSearch className="h-3 w-3" />
            <span>Provenance ({stakeholder.provenance.length})</span>
            {provenanceOpen
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
          </button>
          {provenanceOpen && (
            <div className="mt-2 space-y-1.5 pl-4">
              {stakeholder.provenance.map((p, i) => (
                <div key={i} className="text-xs text-slate-400 flex items-start gap-2">
                  <span className="text-slate-500 font-medium flex-shrink-0">{p.sourceSystem}</span>
                  <div className="flex flex-wrap gap-1">
                    {p.fieldsUsed.map((f, j) => (
                      <span key={j} className="px-1 py-0.5 bg-slate-50 rounded text-slate-400">{f}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useOwnerEntityStakeholders(bbl?: string): StakeholderRecord[] {
  const [records, setRecords] = useState<StakeholderRecord[]>([]);

  useEffect(() => {
    if (!bbl) return;
    let cancelled = false;

    (async () => {
      const { data: links } = await supabase
        .from('owner_entity_properties')
        .select('owner_entity_id, relationship_type, confidence')
        .eq('bbl', bbl);

      if (cancelled || !links || links.length === 0) return;

      const entityIds = [...new Set(links.map((l) => l.owner_entity_id))];
      const { data: entities } = await supabase
        .from('owner_entities')
        .select('*')
        .in('id', entityIds);

      if (cancelled || !entities) return;

      const entityMap = new Map(entities.map((e) => [e.id, e]));
      const result: StakeholderRecord[] = [];

      for (const link of links) {
        const entity = entityMap.get(link.owner_entity_id);
        if (!entity) continue;

        const role = link.relationship_type === 'owner' ? 'OWNER'
          : link.relationship_type === 'developer' ? 'GC'
          : 'OTHER';

        const emails = (entity.emails || []).map((e: { value: string; confidence?: number }) => ({
          email: e.value,
          confidence: e.confidence || 0.7,
        }));

        const phones = (entity.phones || []).map((p: { value: string; confidence?: number }) => ({
          raw: p.value,
          confidence: p.confidence || 0.7,
        }));

        const addresses = (entity.addresses || []).map((a: { value: string; confidence?: number }) => ({
          line1: a.value,
          source: 'Owner Entity',
          confidence: a.confidence || 0.7,
        }));

        result.push({
          role: role as StakeholderRecord['role'],
          name: entity.canonical_name,
          orgName: entity.entity_type === 'org' ? entity.canonical_name : undefined,
          contacts: { phones, emails },
          addresses,
          provenance: [{
            sourceSystem: 'Owner Entity Index',
            datasetId: 'owner_entities',
            recordKey: entity.id,
            fieldsUsed: ['canonical_name', 'emails', 'phones', 'addresses'],
            timestamp: entity.updated_at,
          }],
          confidence: link.confidence,
          notes: `Matched via Owner Entity (${link.relationship_type})`,
        });
      }

      if (!cancelled) setRecords(result);
    })();

    return () => { cancelled = true; };
  }, [bbl]);

  return records;
}

function mergeStakeholders(existing: StakeholderRecord[], fromEntities: StakeholderRecord[]): StakeholderRecord[] {
  const result = [...existing];
  const existingNames = new Set(
    existing.map((s) => s.name.toUpperCase().replace(/[^\w\s]/g, '').trim())
  );

  for (const oe of fromEntities) {
    const normalized = oe.name.toUpperCase().replace(/[^\w\s]/g, '').trim();
    if (!existingNames.has(normalized)) {
      result.push(oe);
      existingNames.add(normalized);
    }
  }
  return result;
}

export default function StakeholdersPanel({ stakeholders, bbl, onSelectOwner }: StakeholdersPanelProps) {
  const [open, setOpen] = useState(false);
  const ownerEntityRecords = useOwnerEntityStakeholders(bbl);

  const merged = mergeStakeholders(stakeholders || [], ownerEntityRecords);

  if (merged.length === 0) {
    return null;
  }

  const grouped = new Map<string, StakeholderRecord[]>();
  for (const s of merged) {
    const existing = grouped.get(s.role) || [];
    existing.push(s);
    grouped.set(s.role, existing);
  }

  const roleOrder = ['OWNER', 'MANAGING_AGENT', 'ARCHITECT', 'ENGINEER', 'GC', 'APPLICANT', 'FILING_REP', 'SELLER', 'OTHER'];
  const sortedRoles = [...grouped.keys()].sort(
    (a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)
  );

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 mb-3"
      >
        <Users className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex-1 text-left">
          Stakeholders
        </h3>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          {merged.length}
        </span>
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />
        }
      </button>
      {open && (
        <div className="space-y-4 animate-fadeIn">
          {sortedRoles.map((role) => {
            const group = grouped.get(role)!;
            const style = ROLE_STYLES[role] || ROLE_STYLES.OTHER;
            return (
              <div key={role}>
                <div className="flex items-center gap-2 mb-2">
                  {role === 'OWNER' || role === 'SELLER' ? (
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {style.label}s ({group.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {group.map((s, i) => (
                    <StakeholderCard key={`${role}-${i}`} stakeholder={s} onSelectOwner={onSelectOwner} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
