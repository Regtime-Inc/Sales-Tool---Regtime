import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, Landmark, HardHat, Home, Tag, Shield, Globe, Building2, Users, Mail, Phone } from 'lucide-react';
import type { SaleData, DobFiling, DobPermit, BisWebFiling, HpdRegistration, Flags } from '../types/analysis';

interface EvidenceListProps {
  sale: SaleData | null;
  secondarySale?: SaleData | null;
  dobFilings: DobFiling[];
  dobPermits: DobPermit[];
  bisWebFilings: BisWebFiling[];
  hpdRegistrations: HpdRegistration[];
  flags: Flags;
  bbl?: string;
}

interface AggregatedContact {
  role: string;
  name: string;
  business: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  license: string | null;
  licenseType: string | null;
  sources: string[];
}

function aggregateContacts(
  dobFilings: DobFiling[],
  dobPermits: DobPermit[],
  bisWebFilings: BisWebFiling[],
): AggregatedContact[] {
  const map = new Map<string, AggregatedContact>();

  const add = (role: string, name: string | null, business: string | null, phone: string | null, email: string | null, address: string | null, license: string | null, licenseType: string | null, source: string) => {
    const key = (name || business || '').toUpperCase().trim();
    if (!key) return;
    const existing = map.get(`${role}::${key}`);
    if (existing) {
      if (!existing.phone && phone) existing.phone = phone;
      if (!existing.email && email) existing.email = email;
      if (!existing.address && address) existing.address = address;
      if (!existing.business && business) existing.business = business;
      if (!existing.license && license) existing.license = license;
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      map.set(`${role}::${key}`, { role, name: name || business || '', business: name ? business : null, phone, email, address, license, licenseType, sources: [source] });
    }
  };

  for (const f of dobFilings) {
    const src = f.ownerContactSource === 'dobnow_manual_import' ? 'Manual Import' : f.source === 'dob_now' ? 'DOB NOW' : 'DOB BIS';
    add('Owner', f.ownerName, f.ownerBusinessName, f.ownerPhone, f.ownerEmail, f.ownerAddress, null, null, src);
    add('Applicant', f.applicantName, f.applicantBusinessName, null, null, null, f.applicantLicense, f.applicantTitle, src);
    add('Filing Rep', f.filingRepName, f.filingRepBusinessName, null, null, f.filingRepAddress, null, null, src);
  }

  for (const p of dobPermits) {
    add('Owner', p.ownerName, p.ownerBusinessName, p.ownerPhone, null, p.ownerAddress, null, null, 'DOB Permits');
    add('Permittee', p.permitteeName, p.permitteeBusinessName, p.permitteePhone, null, null, p.permitteeLicenseNumber, p.permitteeLicenseType, 'DOB Permits');
  }

  for (const b of bisWebFilings) {
    add('Owner', b.ownerName, b.ownerBusinessName, null, null, null, null, null, 'BIS-web');
    add('Applicant', b.applicantName, null, null, null, null, b.applicantLicenseNumber, b.applicantLicenseType, 'BIS-web');
    add('Filing Rep', b.filingRepName, b.filingRepBusinessName, null, null, null, null, null, 'BIS-web');
  }

  const roleOrder: Record<string, number> = { Owner: 0, Applicant: 1, 'Filing Rep': 2, Permittee: 3 };
  return Array.from(map.values()).sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));
}

function Section({ title, icon, children, defaultOpen = false, count }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {icon}
        <span className="text-sm font-medium text-slate-700 flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-xs font-medium text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">{count}</span>
        )}
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="p-4 bg-white">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <span className="text-slate-400">{label}:</span>{' '}
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function JobTypeBadge({ type }: { type: string }) {
  const cls =
    type === 'NB' ? 'bg-emerald-100 text-emerald-700' :
    type === 'DM' ? 'bg-red-100 text-red-700' :
    type === 'A1' ? 'bg-amber-100 text-amber-700' :
    type === 'Alteration' ? 'bg-amber-100 text-amber-700' :
    type === 'New Building' ? 'bg-emerald-100 text-emerald-700' :
    type === 'Demolition' ? 'bg-red-100 text-red-700' :
    'bg-slate-100 text-slate-600';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>{type}</span>;
}

function SourceBadge({ source }: { source: string }) {
  const cls =
    source === 'dob_now' ? 'bg-sky-100 text-sky-700' :
    source === 'dob_bis' ? 'bg-teal-100 text-teal-700' :
    'bg-slate-100 text-slate-600';
  const label = source === 'dob_now' ? 'DOB NOW' : source === 'dob_bis' ? 'DOB BIS' : source;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>{label}</span>;
}

function formatDate(d: string | null | undefined) {
  if (!d) return null;
  return d.split('T')[0];
}

function formatCost(v: number | null | undefined) {
  if (!v) return null;
  return `$${v.toLocaleString()}`;
}

function DobFilingCard({ f }: { f: DobFiling }) {
  return (
    <div className="text-sm border-l-2 border-slate-200 pl-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <JobTypeBadge type={f.jobType} />
        <SourceBadge source={f.source} />
        <span className="text-slate-700 font-medium font-mono text-xs">{f.jobNumber}</span>
        <span className="text-slate-400 text-xs">{f.status}</span>
      </div>
      {f.jobDescription && <p className="text-xs text-slate-500 line-clamp-2">{f.jobDescription}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <DetailRow label="Filed" value={formatDate(f.filingDate)} />
        <DetailRow label="Cost" value={formatCost(f.initialCost)} />
        {f.existingStories && <DetailRow label="Existing Stories" value={f.existingStories} />}
        {f.proposedStories && <DetailRow label="Proposed Stories" value={f.proposedStories} />}
        {f.existingDwellingUnits && <DetailRow label="Existing DUs" value={f.existingDwellingUnits} />}
        {f.proposedDwellingUnits && <DetailRow label="Proposed DUs" value={f.proposedDwellingUnits} />}
        <DetailRow label="Approved" value={formatDate(f.approvedDate)} />
        <DetailRow label="Permitted" value={formatDate(f.permittedDate)} />
        <DetailRow label="Sign-off" value={formatDate(f.signoffDate)} />
        <DetailRow label="BIN" value={f.bin} />
      </div>
      {(f.applicantName || f.ownerName || f.ownerBusinessName || f.filingRepName) && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-xs space-y-1">
          {f.applicantName && (
            <div className="bg-slate-50 rounded p-1.5">
              <span className="text-slate-400 font-medium">Applicant:</span>{' '}
              <span className="text-slate-700 font-medium">{f.applicantName}</span>
              {f.applicantTitle && <span className="text-slate-400 ml-1">({f.applicantTitle})</span>}
              {f.applicantLicense && <span className="text-slate-400 ml-1">Lic# {f.applicantLicense}</span>}
              {f.applicantBusinessName && <div className="text-slate-500 ml-4 text-[11px]">{f.applicantBusinessName}</div>}
            </div>
          )}
          {(f.ownerName || f.ownerBusinessName) && (
            <div className="bg-slate-50 rounded p-1.5">
              <span className="text-slate-400 font-medium">Owner:</span>{' '}
              {f.ownerName && <span className="text-slate-700 font-medium">{f.ownerName}</span>}
              {f.ownerName && f.ownerBusinessName && <span className="text-slate-400 mx-1">/</span>}
              {f.ownerBusinessName && <span className="text-slate-600">{f.ownerBusinessName}</span>}
              {f.ownerContactSource === 'dobnow_manual_import' && (
                <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">MANUAL</span>
              )}
              {f.ownerPhone && (
                <div className="text-slate-500 ml-4 text-[11px] flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" />{f.ownerPhone}
                </div>
              )}
              {f.ownerEmail && (
                <div className="text-slate-500 ml-4 text-[11px] flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" /><a href={`mailto:${f.ownerEmail}`} className="underline">{f.ownerEmail}</a>
                </div>
              )}
              {f.ownerAddress && <div className="text-slate-400 ml-4 text-[11px] mt-0.5">{f.ownerAddress}</div>}
            </div>
          )}
          {f.filingRepName && (
            <div className="bg-slate-50 rounded p-1.5">
              <span className="text-slate-400 font-medium">Filing Rep:</span>{' '}
              <span className="text-slate-700 font-medium">{f.filingRepName}</span>
              {f.filingRepBusinessName && <span className="text-slate-400 ml-1">({f.filingRepBusinessName})</span>}
              {f.filingRepAddress && <div className="text-slate-400 ml-4 text-[11px]">{f.filingRepAddress}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DobPermitCard({ p }: { p: DobPermit }) {
  return (
    <div className="text-sm border-l-2 border-sky-200 pl-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">{p.permitType || p.workType || 'PERMIT'}</span>
        <span className="text-slate-700 font-medium font-mono text-xs">{p.jobNumber}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          p.permitStatus === 'ISSUED' ? 'bg-emerald-50 text-emerald-600' :
          p.permitStatus === 'EXPIRED' ? 'bg-red-50 text-red-600' :
          'bg-slate-100 text-slate-500'
        }`}>{p.permitStatus}</span>
      </div>
      {p.jobDescription && <p className="text-xs text-slate-500 line-clamp-2">{p.jobDescription}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <DetailRow label="Filed" value={formatDate(p.filingDate)} />
        <DetailRow label="Issued" value={formatDate(p.issuanceDate)} />
        <DetailRow label="Expires" value={formatDate(p.expirationDate)} />
        <DetailRow label="Job Start" value={formatDate(p.jobStartDate)} />
        <DetailRow label="Work Type" value={p.workType} />
        <DetailRow label="Est. Cost" value={formatCost(p.estimatedCost)} />
      </div>
      {(p.permitteeName || p.permitteeBusinessName || p.ownerName || p.ownerBusinessName) && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-xs space-y-1">
          {(p.permitteeName || p.permitteeBusinessName) && (
            <div className="bg-slate-50 rounded p-1.5">
              <span className="text-slate-400 font-medium">Permittee:</span>{' '}
              {p.permitteeName && <span className="text-slate-700 font-medium">{p.permitteeName}</span>}
              {p.permitteeName && p.permitteeBusinessName && <span className="text-slate-400 mx-1">/</span>}
              {p.permitteeBusinessName && !p.permitteeName && <span className="text-slate-700 font-medium">{p.permitteeBusinessName}</span>}
              {p.permitteeBusinessName && p.permitteeName && <span className="text-slate-600">{p.permitteeBusinessName}</span>}
              {p.permitteeLicenseType && <span className="text-slate-400 ml-1">({p.permitteeLicenseType})</span>}
              {p.permitteeLicenseNumber && <span className="text-slate-400 ml-1">Lic# {p.permitteeLicenseNumber}</span>}
              {p.permitteePhone && <span className="text-slate-500 ml-1.5">{p.permitteePhone}</span>}
            </div>
          )}
          {(p.ownerName || p.ownerBusinessName) && (
            <div className="bg-slate-50 rounded p-1.5">
              <span className="text-slate-400 font-medium">Owner:</span>{' '}
              {p.ownerName && <span className="text-slate-700 font-medium">{p.ownerName}</span>}
              {p.ownerName && p.ownerBusinessName && <span className="text-slate-400 mx-1">/</span>}
              {p.ownerBusinessName && <span className="text-slate-600">{p.ownerBusinessName}</span>}
              {p.ownerPhone && <span className="text-slate-500 ml-1.5">{p.ownerPhone}</span>}
              {p.ownerAddress && <div className="text-slate-400 ml-4 text-[11px]">{p.ownerAddress}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BisWebCard({ b }: { b: BisWebFiling }) {
  return (
    <div className="text-sm border-l-2 border-orange-200 pl-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {b.jobType && <JobTypeBadge type={b.jobType} />}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-orange-100 text-orange-700">BIS-web</span>
        <span className="text-slate-700 font-medium font-mono text-xs">{b.jobNumber}</span>
        {b.jobStatus && <span className="text-slate-400 text-xs">{b.jobStatus}</span>}
      </div>
      {b.jobDescription && <p className="text-xs text-slate-500 line-clamp-2">{b.jobDescription}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <DetailRow label="Filed" value={formatDate(b.filingDate)} />
        <DetailRow label="Expires" value={formatDate(b.expirationDate)} />
        {b.existingStories && <DetailRow label="Existing Stories" value={b.existingStories} />}
        {b.proposedStories && <DetailRow label="Proposed Stories" value={b.proposedStories} />}
        {b.existingDwellingUnits && <DetailRow label="Existing DUs" value={b.existingDwellingUnits} />}
        {b.proposedDwellingUnits && <DetailRow label="Proposed DUs" value={b.proposedDwellingUnits} />}
        <DetailRow label="BIN" value={b.bin} />
      </div>
      {(b.applicantName || b.filingRepName || b.ownerName || b.ownerBusinessName) && (
        <div className="mt-1 pt-1 border-t border-slate-100 text-xs space-y-0.5">
          {b.applicantName && (
            <div>
              <span className="text-slate-400">Applicant:</span>{' '}
              <span className="text-slate-700 font-medium">{b.applicantName}</span>
              {b.applicantLicenseType && <span className="text-slate-400 ml-1">({b.applicantLicenseType})</span>}
              {b.applicantLicenseNumber && <span className="text-slate-400 ml-1">Lic# {b.applicantLicenseNumber}</span>}
            </div>
          )}
          {b.filingRepName && (
            <div>
              <span className="text-slate-400">Filing Rep:</span>{' '}
              <span className="text-slate-700 font-medium">{b.filingRepName}</span>
              {b.filingRepBusinessName && <span className="text-slate-400 ml-1">({b.filingRepBusinessName})</span>}
            </div>
          )}
          {(b.ownerName || b.ownerBusinessName) && (
            <div>
              <span className="text-slate-400">Owner:</span>{' '}
              <span className="text-slate-700">{b.ownerBusinessName || b.ownerName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  Owner: 'bg-teal-50 text-teal-700 border-teal-200',
  Applicant: 'bg-sky-50 text-sky-700 border-sky-200',
  'Filing Rep': 'bg-amber-50 text-amber-700 border-amber-200',
  Permittee: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function EvidenceList({ sale, secondarySale, dobFilings, dobPermits, bisWebFilings, hpdRegistrations, flags, bbl }: EvidenceListProps) {
  const bisFilings = dobFilings.filter(f => f.source === 'dob_bis');
  const nowFilings = dobFilings.filter(f => f.source === 'dob_now');

  const contacts = useMemo(
    () => aggregateContacts(dobFilings, dobPermits, bisWebFilings),
    [dobFilings, dobPermits, bisWebFilings],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Evidence & Details</h3>
      <div className="space-y-2">
        {contacts.length > 0 && (
          <Section
            title="Key Contacts"
            icon={<Users className="h-4 w-4 text-teal-500" />}
            count={contacts.length}
            defaultOpen
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c, i) => (
                <div key={i} className={`rounded-lg border p-2.5 text-xs ${ROLE_COLORS[c.role] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold text-[10px] uppercase tracking-wide opacity-70">{c.role}</span>
                    <span className="text-[9px] opacity-50">{c.sources.join(', ')}</span>
                  </div>
                  <p className="font-medium text-sm leading-tight">{c.name}</p>
                  {c.business && <p className="opacity-70 mt-0.5">{c.business}</p>}
                  {c.phone && (
                    <p className="opacity-60 mt-0.5 flex items-center gap-1">
                      <Phone className="h-3 w-3" />{c.phone}
                    </p>
                  )}
                  {c.email && (
                    <p className="opacity-60 mt-0.5 flex items-center gap-1">
                      <Mail className="h-3 w-3" /><a href={`mailto:${c.email}`} className="underline">{c.email}</a>
                    </p>
                  )}
                  {c.address && <p className="opacity-60 mt-0.5 text-[11px]">{c.address}</p>}
                  {c.license && (
                    <p className="opacity-60 mt-0.5">
                      {c.licenseType && <span>{c.licenseType} </span>}
                      Lic# {c.license}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Recent Sale" icon={<Landmark className="h-4 w-4 text-slate-500" />} defaultOpen={!!sale} count={sale ? (secondarySale ? 2 : 1) : 0}>
          {sale ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${sale.source === 'acris' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                    {sale.source === 'acris' ? 'ACRIS' : 'DOF Rolling Sales'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Primary</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-400">Type:</span> <span className="text-slate-700 font-medium">{sale.docType}</span></div>
                  <div><span className="text-slate-400">Date:</span> <span className="text-slate-700 font-medium">{sale.documentDate?.split('T')[0]}</span></div>
                  <div className="col-span-2"><span className="text-slate-400">Amount:</span> <span className="text-slate-700 font-medium">${sale.amount.toLocaleString()}</span></div>
                </div>
                {sale.buyer && <div><span className="text-slate-400">Buyer:</span> <span className="text-slate-700">{sale.buyer}</span></div>}
                {sale.seller && <div><span className="text-slate-400">Seller:</span> <span className="text-slate-700">{sale.seller}</span></div>}
                {sale.documentId && <div><span className="text-slate-400">Document ID:</span> <span className="text-slate-700 font-mono text-xs">{sale.documentId}</span></div>}
                {sale.remarks?.length > 0 && (
                  <div>
                    <span className="text-slate-400">Remarks:</span>
                    <ul className="mt-1 space-y-1">
                      {sale.remarks.map((r, i) => <li key={i} className="text-slate-600 text-xs bg-slate-50 p-2 rounded">{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              {secondarySale && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${secondarySale.source === 'acris' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                      {secondarySale.source === 'acris' ? 'ACRIS' : 'DOF Rolling Sales'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Corroborating</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-slate-400">Type:</span> <span className="text-slate-700 font-medium">{secondarySale.docType}</span></div>
                    <div><span className="text-slate-400">Date:</span> <span className="text-slate-700 font-medium">{secondarySale.documentDate?.split('T')[0]}</span></div>
                    <div className="col-span-2"><span className="text-slate-400">Amount:</span> <span className="text-slate-700 font-medium">${secondarySale.amount.toLocaleString()}</span></div>
                  </div>
                  {secondarySale.buyer && <div><span className="text-slate-400">Buyer:</span> <span className="text-slate-700">{secondarySale.buyer}</span></div>}
                  {secondarySale.seller && <div><span className="text-slate-400">Seller:</span> <span className="text-slate-700">{secondarySale.seller}</span></div>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No sale data from ACRIS or DOF</p>
          )}
        </Section>

        <Section
          title="DOB NOW Filings"
          icon={<Building2 className="h-4 w-4 text-sky-500" />}
          count={nowFilings.length}
        >
          {nowFilings.length > 0 ? (
            <div className="space-y-4">
              {nowFilings.slice(0, 15).map((f, i) => <DobFilingCard key={i} f={f} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No DOB NOW filings found</p>
          )}
        </Section>

        <Section
          title="DOB BIS Filings (Legacy)"
          icon={<HardHat className="h-4 w-4 text-teal-500" />}
          count={bisFilings.length}
        >
          {bisFilings.length > 0 ? (
            <div className="space-y-4">
              {bisFilings.slice(0, 15).map((f, i) => <DobFilingCard key={i} f={f} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No DOB BIS filings found</p>
          )}
        </Section>

        <Section
          title="DOB Permits"
          icon={<Shield className="h-4 w-4 text-sky-500" />}
          count={dobPermits.length}
        >
          {dobPermits.length > 0 ? (
            <div className="space-y-4">
              {dobPermits.slice(0, 15).map((p, i) => <DobPermitCard key={i} p={p} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No DOB permit issuance records found</p>
          )}
        </Section>

        <Section
          title="DOB BIS Detail Cards"
          icon={<Globe className="h-4 w-4 text-orange-500" />}
          count={bisWebFilings.length}
        >
          {bisWebFilings.length > 0 ? (
            <div className="space-y-4">
              {bisWebFilings.slice(0, 10).map((b, i) => <BisWebCard key={i} b={b} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No DOB BIS detail records found</p>
          )}
        </Section>

        <Section
          title="HPD Registrations"
          icon={<Home className="h-4 w-4 text-slate-500" />}
          count={hpdRegistrations.length}
        >
          {hpdRegistrations.length > 0 ? (
            <div className="space-y-4">
              {hpdRegistrations.map((reg, i) => (
                <div key={i} className="text-sm border-l-2 border-slate-200 pl-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">Reg# {reg.registrationId}</span>
                    {reg.buildingId && <span className="text-slate-400 text-xs">Bldg ID: {reg.buildingId}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {(reg.houseNumber || reg.streetName) && (
                      <DetailRow label="Address" value={[reg.houseNumber, reg.streetName].filter(Boolean).join(' ')} />
                    )}
                    <DetailRow label="ZIP" value={reg.zip} />
                    <DetailRow label="BIN" value={reg.bin} />
                    <DetailRow label="Community Board" value={reg.communityBoard} />
                    <DetailRow label="Last Registered" value={formatDate(reg.lastRegistrationDate)} />
                    <DetailRow label="Reg. Expires" value={formatDate(reg.registrationEndDate)} />
                  </div>
                  {reg.contacts.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                      <p className="text-xs text-slate-400 font-medium mb-1">Contacts ({reg.contacts.length})</p>
                      <div className="space-y-1.5">
                        {reg.contacts.map((c, j) => (
                          <div key={j} className="text-xs bg-slate-50 rounded p-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-600">{c.type}</span>
                              {c.contactDescription && <span className="text-slate-400">{c.contactDescription}</span>}
                            </div>
                            {(c.firstName || c.lastName) && (
                              <p className="text-slate-700">{[c.firstName, c.lastName].filter(Boolean).join(' ')}</p>
                            )}
                            {c.corporationName && <p className="text-slate-600">{c.corporationName}</p>}
                            {c.businessAddress && <p className="text-slate-400 text-[11px]">{c.businessAddress}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No HPD registrations found</p>
          )}
        </Section>

        <Section title="Regulatory Flags" icon={<Tag className="h-4 w-4 text-slate-500" />}>
          <div className="space-y-3 text-sm">
            {[
              { label: '485-x', detected: flags.is485x, evidence: flags.is485xEvidence || [] },
              { label: 'UAP', detected: flags.isUap, evidence: flags.uapEvidence || [] },
              { label: 'MIH', detected: flags.isMih, evidence: flags.mihEvidence || [] },
              { label: '421-a', detected: flags.is421a, evidence: flags.evidence421a || [] },
              { label: '467-m', detected: flags.is467m, evidence: flags.evidence467m || [] },
            ].map((f) => (
              <div key={f.label}>
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${f.detected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="text-slate-700">{f.label}: {f.detected ? 'Detected' : 'Not found'}</span>
                </div>
                {f.evidence.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1">
                    {f.evidence.map((e, i) => <p key={i} className="text-xs text-slate-500 bg-slate-50 p-2 rounded">{e}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        {(sale?.remarks?.length || 0) > 0 && (
          <Section title="ACRIS Remarks" icon={<FileText className="h-4 w-4 text-slate-500" />}>
            <div className="space-y-1">
              {sale!.remarks.map((r, i) => <p key={i} className="text-xs text-slate-600 bg-slate-50 p-2 rounded">{r}</p>)}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
