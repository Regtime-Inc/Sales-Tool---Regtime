import { type TraceEntry, type RawStakeholder, type AcrisLiveParty, ts } from "./types.ts";
import { ACRIS_PARTIES_ID, HPD_CONTACTS_ID, DOB_BIS_ID, DOB_NOW_ID, DOB_PERMIT_ID, DOB_LICENSE_ID, PLUTO_ID, DOF_VALUATION_ID } from "./fetch.ts";

// ── Stakeholder Assembly ─────────────────────────────────────────────────


export function sNormName(raw: string): string {
  return raw.toUpperCase().replace(/[^\w\s,.-]/g, "").replace(/\s+/g, " ").trim();
}

export function sStripSuffix(name: string): string {
  const re = /\b(LLC|L\.L\.C|LP|L\.P|INC|CORP|CORPORATION|CO|LTD|PLLC|P\.L\.L\.C)\b\.?$/i;
  let result = name;
  let prev = "";
  while (result !== prev) { prev = result; result = result.replace(re, "").trim(); }
  return result;
}

export function sTokenSim(a: string, b: string): number {
  const tA = new Set(sStripSuffix(sNormName(a)).split(/\s+/).filter(Boolean));
  const tB = new Set(sStripSuffix(sNormName(b)).split(/\s+/).filter(Boolean));
  if (tA.size === 0 && tB.size === 0) return 1;
  if (tA.size === 0 || tB.size === 0) return 0;
  let inter = 0;
  for (const t of tA) { if (tB.has(t)) inter++; }
  const union = new Set([...tA, ...tB]).size;
  return union > 0 ? inter / union : 0;
}

const S_BASE_CONF: Record<string, number> = {
  DOB_LICENSE_INFO: 0.95, HPD_CONTACTS: 0.90, DOF_VALUATION: 0.85,
  ACRIS_GRANTEE: 0.80, DOB_FILING: 0.75, PLUTO: 0.85,
  DOB_PERMIT_ISSUANCE: 0.80, BIS_WEB: 0.70, ACRIS_LIVE: 0.78,
};

export function sMapAcrisRole(partyType: string): string {
  return partyType === "2" ? "OWNER" : partyType === "1" ? "SELLER" : "OTHER";
}

export function sMapHpdRole(type: string): string {
  const l = (type || "").toLowerCase().replace(/\s+/g, "");
  if (l === "agent" || l === "sitemanager") return "MANAGING_AGENT";
  if (l === "corporateowner" || l === "individualowner" || l === "jointowner" || l === "headofficer") return "OWNER";
  return "OTHER";
}

export function sMapDobLicType(t: string): string {
  const u = (t || "").toUpperCase().trim();
  if (u === "PE") return "ENGINEER";
  if (u === "RA") return "ARCHITECT";
  return "OTHER";
}

const BUSINESS_ENTITY_PATTERNS = /\b(LLC|L\.L\.C|INC|CORP|LTD|L\.P|LP|LLP|ASSOC|PARTNERS|HOLDINGS|GROUP|ENTERPRISES|PROPERTIES|REALTY|MANAGEMENT|DEVELOPMENT|TRUST)\b/i;

function looksLikeBusinessEntity(name: string): boolean {
  if (!name || name.length < 3) return false;
  if (BUSINESS_ENTITY_PATTERNS.test(name)) return true;
  const upper = name.replace(/[^A-Z\s]/g, "").trim();
  if (upper.length > 5 && upper === upper.toUpperCase() && !upper.includes(" ")) return false;
  return false;
}

function dosNameSimilarity(query: string, result: string): number {
  const q = query.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
  const r = result.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
  if (q === r) return 1.0;
  if (r.startsWith(q) || q.startsWith(r)) return 0.9;
  const qWords = q.split(/\s+/);
  const rWords = r.split(/\s+/);
  const common = qWords.filter((w) => rWords.includes(w)).length;
  const maxLen = Math.max(qWords.length, rWords.length);
  return maxLen > 0 ? common / maxLen : 0;
}

async function fetchDosEntitySearch(
  businessName: string,
  trace: TraceEntry[]
): Promise<any | null> {
  try {
    const cleaned = businessName.replace(/['"]/g, "").trim();
    if (cleaned.length < 3) return null;

    const url = `${NY_DATA_BASE}/${NY_DOS_ACTIVE_CORPS_ID}.json?$where=upper(current_entity_name) like upper('%25${encodeURIComponent(cleaned)}%25')&$limit=5&$order=initial_dos_filing_date DESC`;
    const data = await fetchJson(url);

    if (!data || data.length === 0) {
      const words = cleaned.split(/\s+/).filter((w: string) => w.length > 2 && !BUSINESS_ENTITY_PATTERNS.test(w));
      if (words.length >= 2) {
        const shortQuery = words.slice(0, 3).join(" ");
        const fallbackUrl = `${NY_DATA_BASE}/${NY_DOS_ACTIVE_CORPS_ID}.json?$where=upper(current_entity_name) like upper('%25${encodeURIComponent(shortQuery)}%25')&$limit=5&$order=initial_dos_filing_date DESC`;
        const fallbackData = await fetchJson(fallbackUrl);
        if (fallbackData && fallbackData.length > 0) {
          const best = fallbackData.reduce((top: any, item: any) =>
            dosNameSimilarity(cleaned, item.current_entity_name) >
            dosNameSimilarity(cleaned, top.current_entity_name)
              ? item : top
          );
          if (dosNameSimilarity(cleaned, best.current_entity_name) >= 0.5) {
            return normalizeDosResult(best);
          }
        }
      }
      return null;
    }

    const best = data.reduce((top: any, item: any) =>
      dosNameSimilarity(cleaned, item.current_entity_name) >
      dosNameSimilarity(cleaned, top.current_entity_name)
        ? item : top
    );

    if (dosNameSimilarity(cleaned, best.current_entity_name) < 0.4) return null;

    return normalizeDosResult(best);
  } catch (e) {
    trace.push({ step: "DOS Entity Search", status: "warning", detail: String(e), timestamp: ts() });
    return null;
  }
}

function normalizeDosResult(r: any) {
  const addr = [r.dos_process_address_1, r.dos_process_address_2].filter(Boolean).join(", ");
  const cityStateZip = [r.dos_process_city, r.dos_process_state, r.dos_process_zip].filter(Boolean).join(", ");
  return {
    dosId: r.dos_id || "",
    entityName: r.current_entity_name || "",
    entityType: r.entity_type || "",
    filingDate: r.initial_dos_filing_date || "",
    county: r.county || "",
    jurisdiction: r.jurisdiction || "",
    processName: r.dos_process_name || "",
    processAddress: addr ? `${addr}, ${cityStateZip}` : cityStateZip || "",
  };
}

export function buildStakeholders(
  acrisSale: any,
  dobFilings: any[],
  hpdContacts: any[],
  dofVal: any,
  pluto: any,
  dobLicenses: any[],
  bbl: string,
  dobPermits: any[] = [],
  bisWebFilings: any[] = [],
  acrisLiveParties: AcrisLiveParty[] = []
): any[] {
  const raw: RawStakeholder[] = [];
  const nowIso = ts();

  for (const alp of acrisLiveParties) {
    raw.push({
      role: alp.role,
      name: alp.name,
      phones: [], emails: [],
      addresses: [],
      sourceSystem: "ACRIS_LIVE",
      datasetId: "acris_documents",
      recordKey: alp.documentId || bbl,
      fieldsUsed: ["party1", "party2", "doc_type", "recorded_date"],
    });
  }

  if (acrisSale?.rawParties) {
    for (const p of acrisSale.rawParties) {
      if (!p.name) continue;
      const addr = [p.address1, p.address2].filter(Boolean).join(" ").trim();
      raw.push({
        role: sMapAcrisRole(p.partyType),
        name: p.name,
        phones: [], emails: [],
        addresses: addr ? [{ line1: addr, city: p.city, state: p.state, zip: p.zip, source: "ACRIS", confidence: 0.50 }] : [],
        sourceSystem: "ACRIS_GRANTEE", datasetId: ACRIS_PARTIES_ID,
        recordKey: acrisSale.documentId || bbl, fieldsUsed: ["name", "party_type", "address_1", "city", "state", "zip"],
      });
    }
  }

  for (const c of hpdContacts) {
    const firstName = c.firstname || "";
    const lastName = c.lastname || "";
    const corpName = c.corporationname || "";
    const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const displayName = personName || corpName;
    if (!displayName) continue;
    const bizAddr = [c.businesshousenumber, c.businessstreetname, c.businessapartment].filter(Boolean).join(" ").trim();
    raw.push({
      role: sMapHpdRole(c.type || ""),
      name: displayName,
      orgName: corpName && personName ? corpName : undefined,
      phones: [], emails: [],
      addresses: bizAddr ? [{ line1: bizAddr, city: c.businesscity || "", state: c.businessstate || "", zip: c.businesszip || "", source: "HPD_CONTACTS", confidence: 0.90 }] : [],
      sourceSystem: "HPD_CONTACTS", datasetId: HPD_CONTACTS_ID,
      recordKey: c.registrationcontactid || bbl, fieldsUsed: ["firstname", "lastname", "corporationname", "type", "businesshousenumber", "businessstreetname"],
    });
  }

  if (dofVal) {
    const ownerName = dofVal.owner || "";
    if (ownerName) {
      raw.push({
        role: "OWNER", name: ownerName,
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "DOF_VALUATION", datasetId: DOF_VALUATION_ID,
        recordKey: bbl, fieldsUsed: ["owner", "bble"],
      });
    }
  }

  if (pluto?.ownername) {
    raw.push({
      role: "OWNER", name: pluto.ownername,
      phones: [], emails: [],
      addresses: [],
      sourceSystem: "PLUTO", datasetId: PLUTO_ID,
      recordKey: bbl, fieldsUsed: ["ownername"],
    });
  }

  for (const f of dobFilings) {
    if (f.applicantName) {
      raw.push({
        role: f.applicantTitle ? sMapDobLicType(f.applicantTitle) : "APPLICANT",
        name: f.applicantName,
        orgName: f.applicantBusinessName || undefined,
        licenseType: f.applicantTitle || undefined,
        licenseNumber: f.applicantLicense || undefined,
        licenseSource: "DOB_FILING",
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "DOB_FILING", datasetId: f.source === "dob_now" ? DOB_NOW_ID : DOB_BIS_ID,
        recordKey: f.jobNumber || bbl, fieldsUsed: ["applicant_first_name", "applicant_last_name", "applicant_license_number"],
      });
    }
    const ownerDisplay = f.ownerName || f.ownerBusinessName;
    if (ownerDisplay) {
      const ownerPhones: any[] = f.ownerPhone ? [{ raw: f.ownerPhone, confidence: 0.75 }] : [];
      const ownerEmails: any[] = f.ownerEmail ? [{ email: f.ownerEmail, confidence: 0.80 }] : [];
      const ownerAddrs: any[] = f.ownerAddress ? [{ line1: f.ownerAddress, source: "DOB_FILING", confidence: 0.70 }] : [];
      raw.push({
        role: "OWNER", name: ownerDisplay,
        orgName: f.ownerName && f.ownerBusinessName ? f.ownerBusinessName : undefined,
        phones: ownerPhones,
        emails: ownerEmails,
        addresses: ownerAddrs,
        sourceSystem: "DOB_FILING", datasetId: f.source === "dob_now" ? DOB_NOW_ID : DOB_BIS_ID,
        recordKey: f.jobNumber || bbl, fieldsUsed: ["owner_first_name", "owner_last_name", "owner_business_name", "owner_phone", "owner_email"],
      });
    }
    if (f.permitteeBusinessName) {
      raw.push({
        role: "GC", name: f.permitteeBusinessName,
        licenseNumber: f.permitteeLicenseNumber || undefined,
        licenseSource: "DOB_FILING",
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "DOB_FILING", datasetId: f.source === "dob_now" ? DOB_NOW_ID : DOB_BIS_ID,
        recordKey: f.jobNumber || bbl, fieldsUsed: ["permittee_business_name", "permittee_license_number"],
      });
    }
    if (f.filingRepName) {
      raw.push({
        role: "FILING_REP", name: f.filingRepName,
        orgName: f.filingRepBusinessName || undefined,
        phones: [], emails: [],
        addresses: f.filingRepAddress ? [{ line1: f.filingRepAddress, source: "DOB_FILING", confidence: 0.70 }] : [],
        sourceSystem: "DOB_FILING", datasetId: DOB_NOW_ID,
        recordKey: f.jobNumber || bbl, fieldsUsed: ["filing_representative_first_name", "filing_representative_last_name", "filing_representative_business_name"],
      });
    }
  }

  for (const p of dobPermits) {
    if (p.permitteeName || p.permitteeBusinessName) {
      const name = p.permitteeName || p.permitteeBusinessName;
      raw.push({
        role: "GC", name,
        orgName: p.permitteeName && p.permitteeBusinessName ? p.permitteeBusinessName : undefined,
        licenseType: p.permitteeLicenseType || undefined,
        licenseNumber: p.permitteeLicenseNumber || undefined,
        licenseSource: "DOB_PERMIT_ISSUANCE",
        phones: p.permitteePhone ? [{ raw: p.permitteePhone, confidence: 0.80 }] : [],
        emails: [],
        addresses: [],
        sourceSystem: "DOB_PERMIT_ISSUANCE", datasetId: DOB_PERMIT_ID,
        recordKey: p.jobNumber || bbl, fieldsUsed: ["permittee_first_name", "permittee_business_name", "permittee_phone", "permittee_license"],
      });
    }
    if (p.ownerName || p.ownerBusinessName) {
      const name = p.ownerName || p.ownerBusinessName;
      raw.push({
        role: "OWNER", name,
        orgName: p.ownerName && p.ownerBusinessName ? p.ownerBusinessName : undefined,
        phones: p.ownerPhone ? [{ raw: p.ownerPhone, confidence: 0.80 }] : [],
        emails: [],
        addresses: p.ownerAddress ? [{ line1: p.ownerAddress, source: "DOB_PERMIT_ISSUANCE", confidence: 0.70 }] : [],
        sourceSystem: "DOB_PERMIT_ISSUANCE", datasetId: DOB_PERMIT_ID,
        recordKey: p.jobNumber || bbl, fieldsUsed: ["owner_name", "owner_business_name", "owner_phone", "owner_address"],
      });
    }
  }

  for (const b of bisWebFilings) {
    if (b.applicantName) {
      raw.push({
        role: b.applicantLicenseType ? sMapDobLicType(b.applicantLicenseType) : "APPLICANT",
        name: b.applicantName,
        licenseType: b.applicantLicenseType || undefined,
        licenseNumber: b.applicantLicenseNumber || undefined,
        licenseSource: "BIS_WEB",
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "BIS_WEB", datasetId: "a810-bisweb",
        recordKey: b.jobNumber || bbl, fieldsUsed: ["applicant_name", "license_type", "license_number"],
      });
    }
    if (b.filingRepName) {
      raw.push({
        role: "FILING_REP", name: b.filingRepName,
        orgName: b.filingRepBusinessName || undefined,
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "BIS_WEB", datasetId: "a810-bisweb",
        recordKey: b.jobNumber || bbl, fieldsUsed: ["filing_rep_name", "filing_rep_business_name"],
      });
    }
    if (b.ownerName || b.ownerBusinessName) {
      const name = b.ownerName || b.ownerBusinessName;
      raw.push({
        role: "OWNER", name: name!,
        orgName: b.ownerName && b.ownerBusinessName ? b.ownerBusinessName : undefined,
        phones: [], emails: [],
        addresses: [],
        sourceSystem: "BIS_WEB", datasetId: "a810-bisweb",
        recordKey: b.jobNumber || bbl, fieldsUsed: ["owner_name", "owner_business_name"],
      });
    }
  }

  const licMap = new Map<string, any>();
  for (const lic of dobLicenses) {
    const num = lic.license_nbr || lic.license_number || "";
    if (num) licMap.set(num, lic);
  }

  const groups: Array<{ rep: RawStakeholder; members: RawStakeholder[] }> = [];
  for (const entry of raw) {
    if (!entry.name.trim()) continue;
    let merged = false;
    for (const g of groups) {
      if (g.rep.role !== entry.role) continue;
      if (sTokenSim(g.rep.name, entry.name) >= 0.85) {
        g.members.push(entry);
        merged = true;
        break;
      }
    }
    if (!merged) groups.push({ rep: entry, members: [entry] });
  }

  const results: any[] = [];
  for (const g of groups) {
    const all = g.members;
    const primary = all[0];
    const provenance = all.map((m) => ({
      sourceSystem: m.sourceSystem, datasetId: m.datasetId,
      recordKey: m.recordKey, fieldsUsed: m.fieldsUsed, timestamp: nowIso,
    }));

    const phonesMap = new Map<string, any>();
    const emailsMap = new Map<string, any>();
    const addrsMap = new Map<string, any>();
    for (const m of all) {
      for (const p of m.phones) {
        const key = p.raw.replace(/\D/g, "");
        if (key && (!phonesMap.has(key) || p.confidence > phonesMap.get(key).confidence)) phonesMap.set(key, p);
      }
      for (const e of m.emails) {
        const key = e.email.toLowerCase();
        if (!emailsMap.has(key) || e.confidence > emailsMap.get(key).confidence) emailsMap.set(key, e);
      }
      for (const a of m.addresses) {
        const key = [a.line1, a.city, a.state, a.zip].filter(Boolean).join("|").toUpperCase();
        if (key && (!addrsMap.has(key) || a.confidence > addrsMap.get(key).confidence)) addrsMap.set(key, a);
      }
    }

    let license: any = undefined;
    for (const m of all) {
      if (m.licenseNumber) {
        license = { type: m.licenseType || "", number: m.licenseNumber, source: m.licenseSource || "DOB_FILING" };
        const enrichment = licMap.get(m.licenseNumber);
        if (enrichment) {
          license.source = "DOB_LICENSE_INFO";
          license.status = enrichment.license_status || enrichment.status || undefined;
          if (enrichment.business_phone) {
            const digits = (enrichment.business_phone || "").replace(/\D/g, "");
            if (digits && !phonesMap.has(digits)) phonesMap.set(digits, { raw: enrichment.business_phone, confidence: 0.95 });
          }
          if (enrichment.business_email || enrichment.email) {
            const email = enrichment.business_email || enrichment.email;
            const key = email.toLowerCase();
            if (!emailsMap.has(key)) emailsMap.set(key, { email, confidence: 0.95 });
          }
          provenance.push({
            sourceSystem: "DOB_LICENSE_INFO", datasetId: DOB_LICENSE_ID,
            recordKey: m.licenseNumber, fieldsUsed: ["license_nbr", "business_phone", "business_email", "license_status"], timestamp: nowIso,
          });
        }
        break;
      }
    }

    const uniqueSources = new Set(provenance.map((p: any) => p.sourceSystem));
    let conf = 0;
    for (const src of uniqueSources) { const b = S_BASE_CONF[src] ?? 0.50; if (b > conf) conf = b; }
    if (uniqueSources.size > 1) conf = Math.min(conf + (uniqueSources.size - 1) * 0.05, 0.99);
    conf = Math.round(conf * 100) / 100;

    const phones = [...phonesMap.values()];
    const emails = [...emailsMap.values()];
    const addresses = [...addrsMap.values()];

    results.push({
      role: primary.role,
      name: primary.name,
      orgName: all.find((m) => m.orgName)?.orgName || undefined,
      license,
      contacts: phones.length > 0 || emails.length > 0 ? { phones, emails } : undefined,
      addresses: addresses.length > 0 ? addresses : undefined,
      provenance,
      confidence: conf,
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}
