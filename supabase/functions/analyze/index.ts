import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { type TraceEntry, ts, parseBbl } from "./lib/types.ts";
import {
  fetchJson,
  geocodeAddress,
  fetchPluto,
  fetchAcrisSale,
  fetchRollingSales,
  fetchDobFilings,
  enrichDobNowFilings,
  fetchDobPermits,
  fetchHpdRegistrations,
  fetchHpdContacts,
  fetchDofValuation,
  fetchDobLicenseInfo,
  fetchAcrisLiveParties,
  fetchDosEntitySearch,
  looksLikeBusinessEntity,
  NY_DOS_ACTIVE_CORPS_ID,
} from "./lib/fetch.ts";
import { buildStakeholders } from "./lib/stakeholders.ts";
import { computeMetrics, scanFlags, computeScore } from "./lib/scoring.ts";
import { evaluateFeasibility } from "./lib/feasibility.ts";
import { generateSummary, generateNextActions } from "./lib/summary.ts";
import { computeTaxProjections } from "./lib/tax.ts";

const CACHE_VERSION = "v13";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { input, extractedPdfData } = body;
    if (!input || typeof input !== "string") {
      return new Response(JSON.stringify({ error: "Input is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trace: TraceEntry[] = [];
    const trimmed = input.trim();
    const bblCandidate = trimmed.replace(/\..*$/, "").replace(/\s/g, "");
    const isBbl = /^\d{10}$/.test(bblCandidate);
    let bbl: string;
    let address: string | null = null;
    let geoLat: number | null = null;
    let geoLng: number | null = null;

    if (isBbl) {
      bbl = bblCandidate;
      trace.push({ step: "Input", status: "success", detail: `BBL: ${bbl}`, timestamp: ts() });
    } else {
      const geo = await geocodeAddress(trimmed, trace);
      if (!geo) {
        return new Response(JSON.stringify({ error: "Could not geocode address", trace }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bbl = geo.bbl;
      address = geo.formattedAddress;
      geoLat = geo.latitude;
      geoLng = geo.longitude;
    }

    const { borough, block, lot } = parseBbl(bbl);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Cache check ───────────────────────────────────────────────────────
    const { data: cached } = await supabase
      .from("analysis_cache")
      .select("result")
      .eq("bbl", bbl)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      const cachedResult = cached.result as any;
      if (cachedResult.cacheVersion === CACHE_VERSION) {
        trace.push({ step: "Cache", status: "success", detail: "Returning cached result", timestamp: ts() });
        cachedResult.trace = [...(cachedResult.trace || []), ...trace];
        return new Response(JSON.stringify(cachedResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      trace.push({ step: "Cache", status: "warning", detail: `Stale cache version (${cachedResult.cacheVersion || "none"} != ${CACHE_VERSION}), re-analyzing`, timestamp: ts() });
    } else {
      trace.push({ step: "Cache", status: "warning", detail: "No cache hit", timestamp: ts() });
    }

    // ── Parallel data fetch ──────────────────────────────────────────────
    const [pluto, acrisSale, dobFilings, hpdRegs, dofVal, dobPermits] = await Promise.all([
      fetchPluto(bbl, trace),
      fetchAcrisSale(borough, block, lot, trace),
      fetchDobFilings(borough, block, lot, trace),
      fetchHpdRegistrations(borough, block, lot, trace),
      fetchDofValuation(bbl, trace),
      fetchDobPermits(borough, block, lot, trace),
    ]);

    await enrichDobNowFilings(dobFilings, borough, block, lot, supabase, bbl, trace);

    const bisWebFilings = dobFilings
      .filter((f: any) => f.source === "dob_bis")
      .map((f: any) => ({
        jobNumber: f.jobNumber || "",
        jobType: f.jobType || "",
        jobStatus: f.status || "",
        applicantName: f.applicantName || "",
        applicantLicenseType: f.applicantTitle || "",
        applicantLicenseNumber: f.applicantLicense || "",
        filingRepName: f.filingRepName || "",
        filingRepBusinessName: f.filingRepBusinessName || "",
        ownerName: f.ownerName || "",
        ownerBusinessName: f.ownerBusinessName || "",
        filingDate: f.filingDate || "",
        expirationDate: "",
        jobDescription: f.jobDescription || "",
        existingStories: f.existingStories ?? null,
        proposedStories: f.proposedStories ?? null,
        existingDwellingUnits: f.existingDwellingUnits ?? null,
        proposedDwellingUnits: f.proposedDwellingUnits ?? null,
        bin: f.bin || "",
      }));
    trace.push({ step: "BIS-web", status: bisWebFilings.length > 0 ? "success" : "warning", detail: `${bisWebFilings.length} filing(s) derived from DOB BIS open data`, timestamp: ts() });

    // ── Secondary enrichment ────────────────────────────────────────────
    const regIds = hpdRegs.map((r: any) => r.registrationid).filter(Boolean);
    const licenseNums: string[] = [];
    for (const f of dobFilings) {
      if (f.applicantLicenseNumber) licenseNums.push(f.applicantLicenseNumber);
      if (f.permitteeLicenseNumber) licenseNums.push(f.permitteeLicenseNumber);
    }
    for (const p of dobPermits) {
      if (p.permitteeLicenseNumber) licenseNums.push(p.permitteeLicenseNumber);
    }

    const [hpdContacts, dobLicenses, rollingSale, acrisLiveParties] = await Promise.all([
      regIds.length > 0 ? fetchHpdContacts(regIds, trace) : Promise.resolve([]),
      licenseNums.length > 0 ? fetchDobLicenseInfo(licenseNums, trace) : Promise.resolve([]),
      fetchRollingSales(borough, block, lot, trace),
      fetchAcrisLiveParties(supabase, bbl, trace),
    ]);

    // ── Sale resolution ─────────────────────────────────────────────────
    let sale = acrisSale;
    let secondarySale: any = rollingSale;
    if (acrisSale && rollingSale) {
      const acrisDate = new Date(acrisSale.documentDate || 0).getTime();
      const rollingDate = new Date(rollingSale.documentDate || 0).getTime();
      const acrisAmt = acrisSale.amount || 0;
      const rollingAmt = rollingSale.amount || 0;
      if (rollingDate > acrisDate) {
        sale = rollingSale;
        secondarySale = acrisSale;
      } else if (rollingDate === acrisDate && acrisAmt === 0 && rollingAmt > 0) {
        sale = rollingSale;
        secondarySale = acrisSale;
      }
    } else if (!acrisSale && rollingSale) {
      sale = rollingSale;
      secondarySale = null;
    } else {
      secondarySale = rollingSale;
    }

    // ── Analysis pipeline ───────────────────────────────────────────────
    const allRemarks = sale?.remarks || [];
    const dobDescs = dobFilings.map((f: any) => f.jobDescription || "");
    const flags = scanFlags(allRemarks, dobDescs);

    const metrics = computeMetrics(pluto, sale, secondarySale);

    const activePrograms: string[] = [];
    if (flags.is485x) activePrograms.push("485-x");
    if (flags.isUap) activePrograms.push("UAP");
    const feasibility = evaluateFeasibility(pluto, activePrograms);

    const scoring = computeScore(pluto, metrics, sale, dobFilings, hpdRegs.length > 0 ? hpdRegs[0] : null, flags, feasibility, secondarySale);

    const newResFa = feasibility?.capacity?.maxResFa || 0;
    const taxProjections = computeTaxProjections(pluto, newResFa, feasibility?.programs || [], borough);

    // ── Stakeholders ────────────────────────────────────────────────────
    const { data: cachedStakeholders } = await supabase
      .from("stakeholder_cache")
      .select("stakeholders")
      .eq("bbl", bbl)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let stakeholders: any[];
    if (cachedStakeholders) {
      stakeholders = cachedStakeholders.stakeholders as any[];
      trace.push({ step: "Stakeholders", status: "success", detail: `${stakeholders.length} stakeholder(s) from cache`, timestamp: ts() });
    } else {
      stakeholders = buildStakeholders(acrisSale, dobFilings, hpdContacts, dofVal, pluto, dobLicenses, bbl, dobPermits, bisWebFilings, acrisLiveParties);
      trace.push({ step: "Stakeholders", status: "success", detail: `${stakeholders.length} stakeholder(s) resolved`, timestamp: ts() });

      const dosTargets = stakeholders.filter((s: any) =>
        (s.role === "OWNER" || s.role === "MANAGING_AGENT") &&
        (looksLikeBusinessEntity(s.name) || looksLikeBusinessEntity(s.orgName || ""))
      ).slice(0, 5);

      if (dosTargets.length > 0) {
        const dosResults = await Promise.all(
          dosTargets.map((s: any) =>
            fetchDosEntitySearch(s.orgName || s.name, trace)
          )
        );
        let dosFound = 0;
        for (let di = 0; di < dosTargets.length; di++) {
          if (dosResults[di]) {
            dosTargets[di].dosEntity = dosResults[di];
            dosTargets[di].provenance.push({
              sourceSystem: "NY_DOS_ACTIVE_CORPS",
              datasetId: NY_DOS_ACTIVE_CORPS_ID,
              recordKey: dosResults[di].dosId,
              fieldsUsed: ["current_entity_name", "dos_id", "entity_type", "county", "dos_process_name", "dos_process_address_1"],
              timestamp: ts(),
            });
            dosFound++;
          }
        }
        if (dosFound > 0) {
          trace.push({ step: "DOS Entity Lookup", status: "success", detail: `${dosFound}/${dosTargets.length} entities matched`, timestamp: ts() });
        }
      }

      await supabase.from("stakeholder_cache").insert({
        bbl,
        stakeholders,
        expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
      });
    }

    // ── HPD contact normalization ───────────────────────────────────────
    const contactsByRegId = new Map<string, any[]>();
    for (const c of hpdContacts) {
      const rid = c.registrationid || "";
      if (!contactsByRegId.has(rid)) contactsByRegId.set(rid, []);
      contactsByRegId.get(rid)!.push(c);
    }

    const hpdRegistrations = hpdRegs.map((r: any) => {
      const rid = r.registrationid || "";
      const regContacts = (contactsByRegId.get(rid) || []).map((c: any) => ({
        type: c.type || "",
        contactDescription: c.contactdescription || "",
        corporationName: c.corporationname || "",
        firstName: c.firstname || "",
        lastName: c.lastname || "",
        businessAddress: [c.businesshousenumber, c.businessstreetname, c.businessapartment, c.businesscity, c.businessstate, c.businesszip].filter(Boolean).join(", "),
      }));
      return {
        registrationId: rid,
        buildingId: r.buildingid || "",
        boro: r.boro || "",
        houseNumber: r.housenumber || r.lowhousenumber || "",
        streetName: r.streetname || "",
        zip: r.zip || "",
        bin: r.bin || "",
        communityBoard: r.communityboard || "",
        lastRegistrationDate: r.lastregistrationdate || "",
        registrationEndDate: r.registrationenddate || "",
        contacts: regContacts,
      };
    });

    // ── Normalize PLUTO ─────────────────────────────────────────────────
    const plutoNorm = pluto
      ? {
          zonedist1: pluto.zonedist1 || "",
          landuse: pluto.landuse || "",
          lotarea: parseFloat(pluto.lotarea) || 0,
          bldgarea: parseFloat(pluto.bldgarea) || 0,
          builtfar: parseFloat(pluto.builtfar) || 0,
          residfar: parseFloat(pluto.residfar) || 0,
          commfar: parseFloat(pluto.commfar) || 0,
          facilfar: parseFloat(pluto.facilfar) || 0,
          numfloors: parseFloat(pluto.numfloors) || 0,
          unitsres: parseInt(pluto.unitsres) || 0,
          unitstotal: parseInt(pluto.unitstotal) || 0,
          yearbuilt: parseInt(pluto.yearbuilt) || 0,
          ownername: pluto.ownername || "",
          bldgclass: pluto.bldgclass || "",
        }
      : null;

    // ── Normalize sales ─────────────────────────────────────────────────
    const saleNorm = sale
      ? {
          source: sale.source,
          documentId: sale.documentId || undefined,
          docType: sale.docType || "",
          documentDate: sale.documentDate || "",
          amount: sale.amount || 0,
          buyer: sale.buyer || "",
          seller: sale.seller || "",
          remarks: sale.remarks || [],
        }
      : null;

    const secondarySaleNorm = secondarySale && secondarySale.amount > 0
      ? {
          source: secondarySale.source,
          documentId: secondarySale.documentId || undefined,
          docType: secondarySale.docType || "",
          documentDate: secondarySale.documentDate || "",
          amount: secondarySale.amount || 0,
          buyer: secondarySale.buyer || "",
          seller: secondarySale.seller || "",
          remarks: secondarySale.remarks || [],
        }
      : null;

    // ── Coordinates ─────────────────────────────────────────────────────
    let latitude = (pluto ? parseFloat(pluto.latitude) : NaN) || null;
    let longitude = (pluto ? parseFloat(pluto.longitude) : NaN) || null;
    if (!latitude || !longitude) { latitude = geoLat; longitude = geoLng; }

    if (!address && pluto) {
      const boroughNames: Record<string, string> = { "1": "New York", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };
      const cityName = boroughNames[borough] || "New York";
      if (pluto.address) {
        address = `${pluto.address}, ${cityName}, NY ${pluto.zipcode || ""}`.trim();
      }
    }

    if ((!latitude || !longitude) && pluto?.address) {
      try {
        const addrText = `${pluto.address}, ${pluto.zipcode || "New York"}, NY`;
        const gUrl = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(addrText)}`;
        const gData = await fetchJson(gUrl);
        if (gData.features?.length) {
          const coords = gData.features[0].geometry?.coordinates;
          if (Array.isArray(coords)) {
            longitude = parseFloat(coords[0]) || null;
            latitude = parseFloat(coords[1]) || null;
            if (latitude && longitude) {
              trace.push({ step: "Geocode (fallback)", status: "success", detail: `Resolved coords for ${addrText}`, timestamp: ts() });
            }
          }
        }
      } catch {
        trace.push({ step: "Geocode (fallback)", status: "warning", detail: "Could not geocode PLUTO address for MIH lookup", timestamp: ts() });
      }
    }

    // ── Assemble result ─────────────────────────────────────────────────
    const result = {
      cacheVersion: CACHE_VERSION,
      bbl,
      address,
      borough,
      block,
      lot,
      latitude,
      longitude,
      pluto: plutoNorm,
      metrics,
      recentSale: saleNorm,
      secondarySale: secondarySaleNorm,
      dobFilings,
      dobPermits,
      bisWebFilings,
      hpdRegistrations,
      flags,
      scoring,
      feasibility,
      taxProjections,
      stakeholders,
      summary: "",
      trace,
      nextActions: [] as string[],
      analyzedAt: ts(),
      extractedPdfData: extractedPdfData || null,
    };

    result.summary = generateSummary(result);
    result.nextActions = generateNextActions(result);

    await supabase.from("analysis_cache").insert({
      bbl,
      result,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
