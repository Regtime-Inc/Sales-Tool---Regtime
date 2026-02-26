import { type TraceEntry, type PortalOwnerDetail, type AcrisLiveParty, ts, boroName } from "./types.ts";

// ── Dataset IDs ─────────────────────────────────────────────────────────────
export const NYC_DATA_BASE = "https://data.cityofnewyork.us/resource";
export const PLUTO_ID = "64uk-42ks";
export const ACRIS_LEGALS_ID = "8h5j-fqxa";
export const ACRIS_MASTER_ID = "bnx9-e6tj";
export const ACRIS_PARTIES_ID = "636b-3b5g";
export const ACRIS_REMARKS_ID = "9p4w-7npp";
export const DOF_ROLLING_ID = "usep-8jbt";
export const DOB_BIS_ID = "ic3t-wcy2";
export const DOB_NOW_ID = "w9ak-ipjd";
export const HPD_REG_ID = "tesw-yqqr";
export const HPD_CONTACTS_ID = "feu5-w2e2";
export const DOB_LICENSE_ID = "t8hj-ruu2";
export const DOB_PERMIT_ID = "ipu4-2q9a";
export const DOB_NOW_APPROVED_ID = "rbx6-tga4";
export const DOF_VALUATION_ID = "8y4t-faws";
export const NY_DOS_ACTIVE_CORPS_ID = "n9v6-gdp6";
export const NY_DATA_BASE = "https://data.ny.gov/resource";

// ── Helpers ─────────────────────────────────────────────────────────────────

export function socrataUrl(datasetId: string, where: string, extra = "") {
  const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
  let url = `${NYC_DATA_BASE}/${datasetId}.json?$where=${encodeURIComponent(where)}${extra}`;
  if (appToken) url += `&$$app_token=${appToken}`;
  return url;
}

export async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[fetchJson] HTTP ${res.status} for ${url.slice(0, 200)} – ${body.slice(0, 300)}`);
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export function trimOrNull(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s || null;
}

export function joinNames(...parts: any[]): string | null {
  const joined = parts.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean).join(" ");
  return joined || null;
}

export function parseCost(raw: any): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[$,]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function extractField(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const val = obj[k];
    if (val && typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed && !/^not\s+applicable$/i.test(trimmed) && !/^n\/?a$/i.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return null;
}

// ── Geocoding ───────────────────────────────────────────────────────────────

export async function geocodeAddress(
  address: string,
  trace: TraceEntry[]
): Promise<{ bbl: string; formattedAddress: string; latitude: number | null; longitude: number | null } | null> {
  try {
    const url = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(address)}`;
    const data = await fetchJson(url);
    if (!data.features?.length) {
      trace.push({ step: "Geocode", status: "warning", detail: "No results", timestamp: ts() });
      return null;
    }
    const f = data.features[0];
    const bbl = f.properties?.addendum?.pad?.bbl;
    if (!bbl) {
      trace.push({ step: "Geocode", status: "warning", detail: "No BBL in geocode result", timestamp: ts() });
      return null;
    }
    const coords = f.geometry?.coordinates;
    const geoLng = Array.isArray(coords) ? parseFloat(coords[0]) || null : null;
    const geoLat = Array.isArray(coords) ? parseFloat(coords[1]) || null : null;
    trace.push({ step: "Geocode", status: "success", detail: `Resolved to BBL ${bbl} (${f.properties.label})`, timestamp: ts() });
    return { bbl, formattedAddress: f.properties.label, latitude: geoLat, longitude: geoLng };
  } catch (e) {
    trace.push({ step: "Geocode", status: "error", detail: String(e), timestamp: ts() });
    return null;
  }
}

// ── PLUTO ───────────────────────────────────────────────────────────────────

export async function fetchPluto(bbl: string, trace: TraceEntry[]) {
  try {
    let data = await fetchJson(socrataUrl(PLUTO_ID, `bbl='${bbl}'`, "&$limit=1"));
    if (!data.length) {
      data = await fetchJson(socrataUrl(PLUTO_ID, `bbl=${bbl}`, "&$limit=1"));
    }
    if (!data.length) {
      trace.push({ step: "PLUTO", status: "warning", detail: "No PLUTO record found", timestamp: ts() });
      return null;
    }
    trace.push({
      step: "PLUTO",
      status: "success",
      detail: `Zone ${data[0].zonedist1}, Lot ${data[0].lotarea} SF, Bldg ${data[0].bldgarea} SF`,
      timestamp: ts(),
    });
    return data[0];
  } catch (e) {
    trace.push({ step: "PLUTO", status: "error", detail: String(e), timestamp: ts() });
    return null;
  }
}

// ── ACRIS ───────────────────────────────────────────────────────────────────

export async function fetchAcrisSale(
  borough: string,
  block: string,
  lot: string,
  trace: TraceEntry[]
) {
  try {
    const bNum = parseInt(borough);
    const blkPadded = block;
    const lotPadded = lot;
    const blkInt = parseInt(block);
    const lotInt = parseInt(lot);

    let legals = await fetchJson(
      socrataUrl(ACRIS_LEGALS_ID, `borough='${bNum}' AND block='${blkPadded}' AND lot='${lotPadded}'`, "&$limit=500")
    );
    if (!legals.length) {
      legals = await fetchJson(
        socrataUrl(ACRIS_LEGALS_ID, `borough=${bNum} AND block=${blkInt} AND lot=${lotInt}`, "&$limit=500")
      );
    }
    if (!legals.length) {
      trace.push({ step: "ACRIS Legals", status: "warning", detail: "No records found", timestamp: ts() });
      return null;
    }
    trace.push({ step: "ACRIS Legals", status: "success", detail: `${legals.length} legal records`, timestamp: ts() });

    const docIds = [...new Set(legals.map((l: any) => l.document_id))].slice(0, 100);
    const docIdList = docIds.map((id: string) => `'${id}'`).join(",");
    const deedTypes = ["DEED", "DEEDO", "ADED", "EXED", "RDED", "TORD"].map((t) => `'${t}'`).join(",");

    const masters = await fetchJson(
      socrataUrl(
        ACRIS_MASTER_ID,
        `document_id in (${docIdList}) AND doc_type in (${deedTypes})`,
        "&$order=recorded_datetime DESC&$limit=5"
      )
    );
    if (!masters.length) {
      trace.push({ step: "ACRIS Master", status: "warning", detail: "No deed records among legals", timestamp: ts() });
      return null;
    }
    const sale = masters[0];
    trace.push({
      step: "ACRIS Master",
      status: "success",
      detail: `${sale.doc_type} on ${sale.document_date}, $${sale.document_amt}`,
      timestamp: ts(),
    });

    let parties: any[] = [];
    try {
      parties = await fetchJson(socrataUrl(ACRIS_PARTIES_ID, `document_id='${sale.document_id}'`));
    } catch (_) { /* non-critical */ }

    let remarks: string[] = [];
    try {
      const rData = await fetchJson(socrataUrl(ACRIS_REMARKS_ID, `document_id='${sale.document_id}'`));
      remarks = rData.map((r: any) => r.remark).filter(Boolean);
    } catch (_) { /* non-critical */ }

    const buyers = parties.filter((p: any) => String(p.party_type) === "2").map((p: any) => p.name);
    const sellers = parties.filter((p: any) => String(p.party_type) === "1").map((p: any) => p.name);

    if (buyers.length || sellers.length) {
      trace.push({ step: "ACRIS Parties", status: "success", detail: `${sellers.length} seller(s), ${buyers.length} buyer(s)`, timestamp: ts() });
    }

    return {
      source: "acris" as const,
      documentId: sale.document_id,
      docType: sale.doc_type,
      documentDate: sale.document_date,
      amount: parseFloat(sale.document_amt) || 0,
      recordedDatetime: sale.recorded_datetime,
      buyer: buyers.join("; "),
      seller: sellers.join("; "),
      remarks,
      percentTrans: parseFloat(sale.percent_trans) || 100,
      rawParties: parties.map((p: any) => ({
        partyType: String(p.party_type),
        name: p.name || "",
        address1: p.address_1 || "",
        address2: p.address_2 || "",
        city: p.city || "",
        state: p.state || "",
        zip: p.zip || "",
      })),
    };
  } catch (e) {
    trace.push({ step: "ACRIS", status: "error", detail: String(e), timestamp: ts() });
    return null;
  }
}

// ── DOF Rolling Sales ───────────────────────────────────────────────────────

export async function fetchRollingSales(
  borough: string,
  block: string,
  lot: string,
  trace: TraceEntry[]
) {
  try {
    const data = await fetchJson(
      socrataUrl(
        DOF_ROLLING_ID,
        `borough='${parseInt(borough)}' AND block='${parseInt(block)}' AND lot='${parseInt(lot)}'`,
        "&$order=sale_date DESC&$limit=5"
      )
    );
    if (!data.length) {
      trace.push({ step: "DOF Rolling Sales", status: "warning", detail: "No records", timestamp: ts() });
      return null;
    }
    const s = data[0];
    trace.push({
      step: "DOF Rolling Sales",
      status: "success",
      detail: `Sale ${s.sale_date} for $${s.sale_price}`,
      timestamp: ts(),
    });
    return {
      source: "rolling_sales" as const,
      documentDate: s.sale_date,
      amount: parseFloat(s.sale_price) || 0,
      buyer: "",
      seller: "",
      remarks: [] as string[],
      docType: s.building_class_at_time_of_sale || "",
    };
  } catch (e) {
    trace.push({ step: "DOF Rolling Sales", status: "error", detail: String(e), timestamp: ts() });
    return null;
  }
}

// ── DOB Filings ─────────────────────────────────────────────────────────────

export async function fetchDobFilings(
  borough: string,
  block: string,
  lot: string,
  trace: TraceEntry[]
) {
  const results: any[] = [];
  const boro = boroName(borough);
  const blk = parseInt(block).toString().padStart(5, "0");
  const lt = parseInt(lot).toString().padStart(5, "0");
  const blkUnpadded = parseInt(block).toString();
  const ltUnpadded = parseInt(lot).toString();

  try {
    const data = await fetchJson(
      socrataUrl(DOB_BIS_ID, `borough='${boro}' AND block='${blk}' AND lot='${lt}'`, "&$order=latest_action_date DESC&$limit=20")
    );
    for (const f of data) {
      const appName = joinNames(f.applicant_s_first_name, f.applicant_s_last_name);
      const ownerName = joinNames(f.owner_s_first_name, f.owner_s_last_name);
      const ownerAddr = [f.owner_s_house__, f.owner_s_house_street_name, f.owner_s_house_city, f.owner_s_house_state, f.owner_s_zip_code].filter(Boolean).join(", ") || null;
      results.push({
        source: "dob_bis",
        jobNumber: f.job__ || f.job_number || "",
        jobType: f.job_type || "",
        jobDescription: f.job_description || "",
        filingDate: f.filing_date || f.pre__filing_date || f.pre_filing_date || "",
        status: f.job_status || f.current_status || "",
        existingStories: parseInt(f.existingno_of_stories) || parseInt(f.existing_no_of_stories) || parseInt(f.existing_stories) || null,
        proposedStories: parseInt(f.proposed_no_of_stories) || null,
        applicantName: appName,
        applicantTitle: trimOrNull(f.applicant_professional_title),
        applicantLicense: trimOrNull(f.applicant_license__),
        applicantBusinessName: trimOrNull(f.applicant_s_business_name),
        ownerName: ownerName,
        ownerBusinessName: trimOrNull(f.owner_s_business_name),
        ownerPhone: trimOrNull(f.owner_sphone__),
        ownerEmail: null as string | null,
        ownerAddress: ownerAddr,
        ownerContactSource: null as string | null,
        filingRepName: null,
        filingRepBusinessName: null,
        filingRepAddress: null,
        initialCost: parseCost(f.initial_cost),
        existingDwellingUnits: parseInt(f.existing_dwelling_units) || null,
        proposedDwellingUnits: parseInt(f.proposed_dwelling_units) || null,
        approvedDate: trimOrNull(f.approved),
        permittedDate: trimOrNull(f.fully_permitted),
        signoffDate: trimOrNull(f.signoff_date),
        bin: trimOrNull(f.bin__),
      });
    }
    trace.push({ step: "DOB BIS", status: data.length === 0 ? "warning" : "success", detail: `${data.length} filings`, timestamp: ts() });
  } catch (e) {
    trace.push({ step: "DOB BIS", status: "error", detail: String(e), timestamp: ts() });
  }

  try {
    const data = await fetchJson(
      socrataUrl(DOB_NOW_ID, `borough='${boro}' AND block='${blkUnpadded}' AND lot='${ltUnpadded}'`, "&$order=filing_date DESC&$limit=20")
    );
    for (const f of data) {
      const appName = joinNames(f.applicant_first_name, f.applicant_last_name);
      const repName = joinNames(f.filing_representative_first_name, f.filing_representative_last_name);
      const repAddr = [f.filing_representative_street_name, f.filing_representative_city, f.filing_representative_state, f.filing_representative_zip].filter(Boolean).join(", ") || null;
      const ownerNowAddr = [f.owner_s_street_name, f.city, f.state, f.zip].filter(Boolean).join(", ") || null;
      const rawBiz = trimOrNull(f.owner_s_business_name) || trimOrNull(f.owner_business_name);
      const ownerBiz = rawBiz && rawBiz.toLowerCase() === "not applicable" ? null : rawBiz;
      results.push({
        source: "dob_now",
        jobNumber: f.job_filing_number || f.job_number || "",
        jobType: f.job_type || "",
        jobDescription: f.job_description || "",
        filingDate: f.filing_date || "",
        status: f.filing_status || f.current_status || "",
        existingStories: null,
        proposedStories: parseInt(f.proposed_no_of_stories) || null,
        applicantName: appName,
        applicantTitle: trimOrNull(f.applicant_professional_title),
        applicantLicense: trimOrNull(f.applicant_license),
        applicantBusinessName: trimOrNull(f.applicant_business_name),
        ownerName: null as string | null,
        ownerBusinessName: ownerBiz,
        ownerPhone: null as string | null,
        ownerEmail: null as string | null,
        ownerAddress: ownerNowAddr,
        ownerContactSource: null as string | null,
        filingRepName: repName,
        filingRepBusinessName: trimOrNull(f.filing_representative_business_name),
        filingRepAddress: repAddr,
        initialCost: parseCost(f.initial_cost),
        existingDwellingUnits: parseInt(f.existing_dwelling_units) || null,
        proposedDwellingUnits: parseInt(f.proposed_dwelling_units) || null,
        approvedDate: null,
        permittedDate: trimOrNull(f.first_permit_date),
        signoffDate: trimOrNull(f.signoff_date),
        bin: trimOrNull(f.bin),
      });
    }
    trace.push({ step: "DOB NOW", status: data.length === 0 ? "warning" : "success", detail: `${data.length} filings`, timestamp: ts() });
  } catch (e) {
    trace.push({ step: "DOB NOW", status: "error", detail: String(e), timestamp: ts() });
  }

  return results;
}

// ── DOB NOW Enrichment ──────────────────────────────────────────────────────

const DOB_NOW_PORTAL_BASE = "https://a810-dobnow.nyc.gov/Publish/api";

async function fetchDobNowPortalDetail(jobNumber: string): Promise<PortalOwnerDetail | null> {
  const baseJob = jobNumber.split("-")[0];
  const endpoints = [
    `${DOB_NOW_PORTAL_BASE}/PublicSearchDetails/GetJobByJobNumber?jobNumber=${encodeURIComponent(baseJob)}`,
    `${DOB_NOW_PORTAL_BASE}/PublicSearch/GetPublicSearchDetails?jobnumber=${encodeURIComponent(baseJob)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const data = Array.isArray(json) ? json[0] : json;
      if (!data) continue;

      const email = extractField(data, ["OwnerEmail", "ownerEmail", "owner_email", "Email"]);
      const phone = extractField(data, ["OwnerPhone", "ownerPhone", "OwnerTelephone", "owner_phone_number", "TelephoneNumber"]);
      const firstName = extractField(data, ["OwnerFirstName", "ownerFirstName", "owner_first_name"]);
      const lastName = extractField(data, ["OwnerLastName", "ownerLastName", "owner_last_name"]);
      const biz = extractField(data, ["OwnerBusinessName", "ownerBusinessName", "owner_business_name"]);
      const ownerType = extractField(data, ["OwnerType", "ownerType", "owner_type"]);

      if (email || phone || firstName || lastName) {
        return {
          ownerFirstName: firstName,
          ownerLastName: lastName,
          ownerEmail: email,
          ownerPhone: phone ? phone.replace(/\D/g, "") || null : null,
          ownerBusinessName: biz,
          ownerType: ownerType,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchDobNowApprovedPermits(
  borough: string, block: string, lot: string, trace: TraceEntry[]
): Promise<Map<string, { ownerName: string | null; ownerAddress: string | null }>> {
  const map = new Map<string, { ownerName: string | null; ownerAddress: string | null }>();
  try {
    const bbl = `${borough}${block.padStart(5, "0")}${lot.padStart(4, "0")}`;
    const data = await fetchJson(
      socrataUrl(DOB_NOW_APPROVED_ID, `bbl='${bbl}'`, "&$order=approved_date DESC&$limit=50")
    );
    for (const r of data) {
      const jobFiling = r.job_filing_number || "";
      const baseJob = jobFiling.split("-")[0];
      const name = trimOrNull(r.owner_name);
      const addr = [r.owner_street_address, r.owner_city, r.owner_state, r.owner_zip_code].filter(Boolean).join(", ") || null;
      if (name && baseJob) {
        if (!map.has(baseJob)) map.set(baseJob, { ownerName: name, ownerAddress: addr });
      }
    }
    trace.push({ step: "DOB NOW Approved Permits", status: data.length === 0 ? "warning" : "success", detail: `${data.length} permit(s), ${map.size} unique owner(s)`, timestamp: ts() });
  } catch (e) {
    trace.push({ step: "DOB NOW Approved Permits", status: "error", detail: String(e), timestamp: ts() });
  }
  return map;
}

async function fetchDobNowPortalBatch(
  jobNumbers: string[], trace: TraceEntry[]
): Promise<Map<string, PortalOwnerDetail>> {
  const map = new Map<string, PortalOwnerDetail>();
  if (jobNumbers.length === 0) return map;

  const CONCURRENCY = 3;
  const unique = [...new Set(jobNumbers.map(j => j.split("-")[0]))].slice(0, 10);
  let successes = 0;
  let failures = 0;

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (jobNum) => {
        const detail = await fetchDobNowPortalDetail(jobNum);
        return { jobNum, detail };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.detail) {
        map.set(r.value.jobNum, r.value.detail);
        successes++;
      } else {
        failures++;
      }
    }
  }

  trace.push({
    step: "DOB NOW Portal Scrape",
    status: successes > 0 ? "success" : failures > 0 ? "warning" : "info",
    detail: `${unique.length} job(s) queried: ${successes} with owner data, ${failures} failed/empty`,
    timestamp: ts(),
  });

  return map;
}

export async function fetchDobNowManualContacts(
  supabase: any, bbl: string, trace: TraceEntry[]
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const { data, error } = await supabase
      .from("dobnow_owner_contacts")
      .select("*")
      .eq("bbl", bbl);
    if (error) throw error;
    for (const row of (data || [])) {
      map.set(row.job_number, row);
    }
    if (map.size > 0) {
      trace.push({ step: "Manual Owner Contacts", status: "success", detail: `${map.size} manual import(s) for BBL`, timestamp: ts() });
    }
  } catch (e) {
    trace.push({ step: "Manual Owner Contacts", status: "error", detail: String(e), timestamp: ts() });
  }
  return map;
}

export async function enrichDobNowFilings(
  dobFilings: any[], borough: string, block: string, lot: string,
  supabase: any, bbl: string, trace: TraceEntry[]
): Promise<void> {
  const nowFilings = dobFilings.filter((f: any) => f.source === "dob_now");
  if (nowFilings.length === 0) return;

  const jobNumbers = nowFilings.map((f: any) => f.jobNumber).filter(Boolean);

  const [approvedMap, manualMap, portalMap] = await Promise.all([
    fetchDobNowApprovedPermits(borough, block, lot, trace),
    fetchDobNowManualContacts(supabase, bbl, trace),
    fetchDobNowPortalBatch(jobNumbers, trace),
  ]);

  let approvedHits = 0;
  let manualHits = 0;
  let portalHits = 0;
  for (const f of nowFilings) {
    const baseJob = (f.jobNumber || "").split("-")[0];
    const jobNum = f.jobNumber || "";

    const manual = manualMap.get(jobNum) || manualMap.get(baseJob);
    if (manual) {
      const mName = [manual.first_name, manual.last_name].filter(Boolean).join(" ").trim();
      if (mName && !f.ownerName) f.ownerName = mName;
      if (manual.email) f.ownerEmail = manual.email;
      if (manual.phone && !f.ownerPhone) f.ownerPhone = manual.phone;
      if (manual.business_name && !f.ownerBusinessName) {
        const biz = manual.business_name;
        if (biz.toLowerCase() !== "not applicable") f.ownerBusinessName = biz;
      }
      if (!f.ownerAddress) {
        const addr = [manual.address_line1, manual.city, manual.state, manual.zip].filter(Boolean).join(", ");
        if (addr) f.ownerAddress = addr;
      }
      f.ownerContactSource = manual.source || "dobnow_manual_import";
      manualHits++;
      continue;
    }

    const portal = portalMap.get(baseJob);
    if (portal) {
      const pName = [portal.ownerFirstName, portal.ownerLastName].filter(Boolean).join(" ").trim();
      if (pName && !f.ownerName) f.ownerName = pName;
      if (portal.ownerEmail && !f.ownerEmail) f.ownerEmail = portal.ownerEmail;
      if (portal.ownerPhone && !f.ownerPhone) f.ownerPhone = portal.ownerPhone;
      if (portal.ownerBusinessName && !f.ownerBusinessName) f.ownerBusinessName = portal.ownerBusinessName;
      f.ownerContactSource = "dobnow_payload";
      portalHits++;
      continue;
    }

    if (!f.ownerName && approvedMap.has(baseJob)) {
      const ap = approvedMap.get(baseJob)!;
      f.ownerName = ap.ownerName;
      if (!f.ownerAddress && ap.ownerAddress) f.ownerAddress = ap.ownerAddress;
      f.ownerContactSource = "dobnow_payload";
      approvedHits++;
    }
  }

  trace.push({
    step: "DOB NOW Owner Enrichment",
    status: manualHits > 0 || portalHits > 0 || approvedHits > 0 ? "success" : "warning",
    detail: `${nowFilings.length} filing(s): ${manualHits} manual, ${portalHits} portal, ${approvedHits} approved-permit`,
    timestamp: ts(),
  });
}

// ── DOB Permits ─────────────────────────────────────────────────────────────

export async function fetchDobPermits(
  borough: string, block: string, lot: string, trace: TraceEntry[]
) {
  const boro = boroName(borough);
  const blk = parseInt(block).toString().padStart(5, "0");
  const lt = parseInt(lot).toString().padStart(5, "0");
  try {
    const data = await fetchJson(
      socrataUrl(DOB_PERMIT_ID, `borough='${boro}' AND block='${blk}' AND lot='${lt}'`, "&$order=issuance_date DESC&$limit=20")
    );
    const results = data.map((p: any) => {
      const ownerAddr = [p.owner_s_house__, p.owner_s_house_street, p.owner_s_house_city, p.owner_s_house_state, p.owner_s_zip_code].filter(Boolean).join(", ") || null;
      return {
        jobNumber: p.job__ || p.job_number || "",
        workType: trimOrNull(p.work_type) || "",
        permitStatus: trimOrNull(p.permit_status) || "",
        permitType: trimOrNull(p.permit_type) || "",
        filingDate: trimOrNull(p.filing_date) || "",
        issuanceDate: trimOrNull(p.issuance_date),
        expirationDate: trimOrNull(p.expiration_date),
        jobStartDate: trimOrNull(p.job_start_date),
        permitteeName: joinNames(p.permittee_s_first_name, p.permittee_s_last_name),
        permitteeBusinessName: trimOrNull(p.permittee_s_business_name),
        permitteePhone: trimOrNull(p.permittee_s_phone__),
        permitteeLicenseType: trimOrNull(p.permittee_s_license_type),
        permitteeLicenseNumber: trimOrNull(p.permittee_s_license__),
        ownerName: joinNames(p.owner_s_first_name, p.owner_s_last_name),
        ownerBusinessName: trimOrNull(p.owner_s_business_name),
        ownerPhone: trimOrNull(p.owner_s_phone__),
        ownerAddress: ownerAddr,
        jobDescription: trimOrNull(p.job_description),
        estimatedCost: parseCost(p.estimated_job_costs),
        bin: trimOrNull(p.bin__),
      };
    });
    trace.push({ step: "DOB Permits", status: results.length === 0 ? "warning" : "success", detail: `${results.length} permit(s)`, timestamp: ts() });
    return results;
  } catch (e) {
    trace.push({ step: "DOB Permits", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

// ── BIS-web ─────────────────────────────────────────────────────────────────

function bisExtractText(html: string, afterLabel: string): string | null {
  const idx = html.indexOf(afterLabel);
  if (idx < 0) return null;
  const chunk = html.substring(idx + afterLabel.length, idx + afterLabel.length + 500);
  const m = chunk.match(/<td[^>]*>\s*([\s\S]*?)\s*<\/td>/i);
  if (!m) return null;
  const val = m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return val || null;
}

function bisExtractAllJobs(html: string): Array<{ jobNumber: string; jobType: string; jobStatus: string }> {
  const jobs: Array<{ jobNumber: string; jobType: string; jobStatus: string }> = [];
  const regex = /JobsQueryByNumberServlet[^"]*passession=[^"]*allkey=(\d+)/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    jobs.push({ jobNumber: m[1], jobType: "", jobStatus: "" });
  }
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[0];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1].replace(/<[^>]+>/g, "").trim());
    if (cells.length >= 4) {
      const jn = cells.find(c => /^\d{8,}$/.test(c));
      if (jn) {
        const existing = jobs.find(j => j.jobNumber === jn);
        if (existing) {
          existing.jobType = cells[1] || existing.jobType;
          existing.jobStatus = cells[cells.length - 1] || existing.jobStatus;
        }
      }
    }
  }
  return jobs;
}

async function fetchBisWebJobDetail(jobNumber: string): Promise<any> {
  try {
    const url = `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passession=&pasession=&requestid=0&allkey=${jobNumber}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    const applicantName = bisExtractText(html, "Applicant's Name") || bisExtractText(html, "Applicant Name");
    const applicantLicType = bisExtractText(html, "License Type");
    const applicantLicNum = bisExtractText(html, "License #") || bisExtractText(html, "License Number");
    const filingRepName = bisExtractText(html, "Filing Representative") || bisExtractText(html, "Filing Rep");
    const filingRepBiz = bisExtractText(html, "Filing Representative Business Name") || bisExtractText(html, "Rep Business");
    const ownerName = bisExtractText(html, "Owner's Name") || bisExtractText(html, "Owner Name");
    const ownerBiz = bisExtractText(html, "Owner's Business Name") || bisExtractText(html, "Owner Business");
    const jobType = bisExtractText(html, "Job Type") || "";
    const jobStatus = bisExtractText(html, "Job Status") || bisExtractText(html, "Current Status") || "";
    const filingDate = bisExtractText(html, "Filing Date") || bisExtractText(html, "Pre-Filing Date");
    const expDate = bisExtractText(html, "Expiration Date");
    const jobDesc = bisExtractText(html, "Job Description");
    const existStories = bisExtractText(html, "Existing Stories") || bisExtractText(html, "Existing # of Stories");
    const propStories = bisExtractText(html, "Proposed Stories") || bisExtractText(html, "Proposed # of Stories");
    const existDU = bisExtractText(html, "Existing Dwelling Units") || bisExtractText(html, "Existing # of Dwelling Units");
    const propDU = bisExtractText(html, "Proposed Dwelling Units") || bisExtractText(html, "Proposed # of Dwelling Units");
    const bin = bisExtractText(html, "BIN #") || bisExtractText(html, "BIN");
    return {
      jobNumber, jobType: jobType || "", jobStatus: jobStatus || "",
      applicantName, applicantLicenseType: applicantLicType, applicantLicenseNumber: applicantLicNum,
      filingRepName, filingRepBusinessName: filingRepBiz,
      ownerName, ownerBusinessName: ownerBiz,
      filingDate, expirationDate: expDate, jobDescription: jobDesc,
      existingStories: parseInt(existStories || "") || null, proposedStories: parseInt(propStories || "") || null,
      existingDwellingUnits: parseInt(existDU || "") || null, proposedDwellingUnits: parseInt(propDU || "") || null,
      bin,
    };
  } catch {
    return null;
  }
}

export async function fetchBisWebFilings(
  borough: string, block: string, lot: string, trace: TraceEntry[]
) {
  try {
    const boro = parseInt(borough);
    const blk = parseInt(block).toString().padStart(5, "0");
    const lt = parseInt(lot).toString().padStart(5, "0");
    const url = `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByLocationServlet?allborough=${boro}&allblock=${blk}&alllot=${lt}&allstession=&requestid=0`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      trace.push({ step: "BIS-web", status: "warning", detail: `HTTP ${res.status}`, timestamp: ts() });
      return [];
    }
    const html = await res.text();
    const jobList = bisExtractAllJobs(html);
    if (!jobList.length) {
      trace.push({ step: "BIS-web", status: "warning", detail: "No jobs found on BIS-web", timestamp: ts() });
      return [];
    }
    const top = jobList.slice(0, 5);
    const details = await Promise.all(top.map((j) => fetchBisWebJobDetail(j.jobNumber)));
    const results = details.filter(Boolean);
    trace.push({ step: "BIS-web", status: "success", detail: `${results.length} job detail(s) scraped`, timestamp: ts() });
    return results;
  } catch (e) {
    trace.push({ step: "BIS-web", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

// ── HPD ─────────────────────────────────────────────────────────────────────

export async function fetchHpdRegistrations(
  borough: string, block: string, lot: string, trace: TraceEntry[]
) {
  try {
    const boroId = parseInt(borough);
    const blkStr = block;
    const lotStr = lot;
    const blkInt = parseInt(block).toString();
    const lotInt = parseInt(lot).toString();
    let data = await fetchJson(
      socrataUrl(HPD_REG_ID, `boroid=${boroId} AND block='${blkStr}' AND lot='${lotStr}'`, "&$order=lastregistrationdate DESC&$limit=20")
    );
    if (!data.length) {
      data = await fetchJson(
        socrataUrl(HPD_REG_ID, `boroid=${boroId} AND block='${blkInt}' AND lot='${lotInt}'`, "&$order=lastregistrationdate DESC&$limit=20")
      );
    }
    if (!data.length) {
      trace.push({ step: "HPD", status: "warning", detail: "No registrations found", timestamp: ts() });
      return [];
    }
    trace.push({ step: "HPD", status: "success", detail: `${data.length} registration(s)`, timestamp: ts() });
    return data;
  } catch (e) {
    trace.push({ step: "HPD", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

export async function fetchHpdContacts(registrationIds: string[], trace: TraceEntry[]) {
  if (registrationIds.length === 0) return [];
  try {
    const unique = [...new Set(registrationIds.filter(Boolean))].slice(0, 10);
    if (unique.length === 0) return [];
    const idList = unique.map((id) => `'${id}'`).join(",");
    const data = await fetchJson(
      socrataUrl(HPD_CONTACTS_ID, `registrationid in (${idList})`, "&$limit=100")
    );
    if (!data.length) {
      trace.push({ step: "HPD Contacts", status: "warning", detail: "No contacts found", timestamp: ts() });
      return [];
    }
    trace.push({ step: "HPD Contacts", status: "success", detail: `${data.length} contact(s)`, timestamp: ts() });
    return data;
  } catch (e) {
    trace.push({ step: "HPD Contacts", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

// ── DOF Valuation ───────────────────────────────────────────────────────────

export async function fetchDofValuation(bbl: string, trace: TraceEntry[]) {
  try {
    const data = await fetchJson(
      socrataUrl(DOF_VALUATION_ID, `bble='${bbl}'`, "&$order=actextdt DESC&$limit=1")
    );
    if (!data.length) {
      const data2 = await fetchJson(
        socrataUrl(DOF_VALUATION_ID, `bble=${bbl}`, "&$limit=1")
      );
      if (!data2.length) {
        trace.push({ step: "DOF Valuation", status: "warning", detail: "No record found", timestamp: ts() });
        return null;
      }
      trace.push({ step: "DOF Valuation", status: "success", detail: `Owner: ${data2[0].owner || "N/A"}`, timestamp: ts() });
      return data2[0];
    }
    trace.push({ step: "DOF Valuation", status: "success", detail: `Owner: ${data[0].owner || "N/A"}`, timestamp: ts() });
    return data[0];
  } catch (e) {
    trace.push({ step: "DOF Valuation", status: "error", detail: String(e), timestamp: ts() });
    return null;
  }
}

// ── DOB License & ACRIS Live ────────────────────────────────────────────────

export async function fetchDobLicenseInfo(licenseNumbers: string[], trace: TraceEntry[]) {
  if (licenseNumbers.length === 0) return [];
  try {
    const unique = [...new Set(licenseNumbers.filter(Boolean))].slice(0, 20);
    if (unique.length === 0) return [];
    const licList = unique.map((n) => `'${n}'`).join(",");
    const data = await fetchJson(
      socrataUrl(DOB_LICENSE_ID, `license_nbr in (${licList})`, "&$limit=50")
    );
    trace.push({ step: "DOB License Info", status: "success", detail: `${data.length} license record(s)`, timestamp: ts() });
    return data;
  } catch (e) {
    trace.push({ step: "DOB License Info", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

export async function fetchAcrisLiveParties(
  supabase: any, bbl: string, trace: TraceEntry[]
): Promise<AcrisLiveParty[]> {
  try {
    const { data, error } = await supabase
      .from("acris_documents")
      .select("document_id, doc_type, party1, party2, recorded_date")
      .eq("bbl", bbl)
      .in("doc_type", ["DEED", "DEEDO", "ADED", "EXED", "RDED", "TORD", "MTGE", "AGMT"])
      .order("recorded_date", { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      trace.push({ step: "AcrisLiveParties", status: "warning", detail: error?.message || "No ACRIS Live docs found", timestamp: ts() });
      return [];
    }

    const parties: AcrisLiveParty[] = [];
    for (const doc of data) {
      const docId = doc.document_id || "";
      const docType = doc.doc_type || "";
      const recorded = doc.recorded_date || "";

      if (doc.party2) {
        const names = String(doc.party2).split(";").map((n: string) => n.trim()).filter(Boolean);
        for (const name of names) {
          parties.push({ name, role: "OWNER", documentId: docId, docType, recordedDate: recorded, source: "acris_documents" });
        }
      }
      if (doc.party1) {
        const names = String(doc.party1).split(";").map((n: string) => n.trim()).filter(Boolean);
        for (const name of names) {
          parties.push({ name, role: "SELLER", documentId: docId, docType, recordedDate: recorded, source: "acris_documents" });
        }
      }
    }

    trace.push({ step: "AcrisLiveParties", status: "success", detail: `${parties.length} party name(s) from ${data.length} ACRIS Live doc(s)`, timestamp: ts() });
    return parties;
  } catch (e) {
    trace.push({ step: "AcrisLiveParties", status: "error", detail: String(e), timestamp: ts() });
    return [];
  }
}

// ── DOS Entity Search ───────────────────────────────────────────────────────

const BUSINESS_ENTITY_PATTERNS = /\b(LLC|L\.L\.C|INC|CORP|LTD|L\.P|LP|LLP|ASSOC|PARTNERS|HOLDINGS|GROUP|ENTERPRISES|PROPERTIES|REALTY|MANAGEMENT|DEVELOPMENT|TRUST)\b/i;

export function looksLikeBusinessEntity(name: string): boolean {
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

export async function fetchDosEntitySearch(
  businessName: string, trace: TraceEntry[]
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
