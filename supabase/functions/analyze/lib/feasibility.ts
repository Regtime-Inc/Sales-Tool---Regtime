import { extractResDesignation } from "./scoring.ts";

// ── Zoning Lookup Table (ZR 23-22) ───────────────────────────────────────

interface ZoningDistrictParams {
  standardFar: number;
  qualifyingAffordableFar: number;
  duFactor: number;
}

const ZONING_TABLE: Record<string, ZoningDistrictParams> = {
  R6:   { standardFar: 2.20, qualifyingAffordableFar: 3.90, duFactor: 680 },
  R6A:  { standardFar: 3.00, qualifyingAffordableFar: 3.90, duFactor: 680 },
  "R6-1": { standardFar: 3.00, qualifyingAffordableFar: 3.90, duFactor: 680 },
  R6B:  { standardFar: 2.00, qualifyingAffordableFar: 2.40, duFactor: 680 },
  R6D:  { standardFar: 2.50, qualifyingAffordableFar: 3.00, duFactor: 680 },
  "R6-2": { standardFar: 2.50, qualifyingAffordableFar: 3.00, duFactor: 680 },
  R7A:  { standardFar: 4.00, qualifyingAffordableFar: 5.01, duFactor: 680 },
  "R7-1": { standardFar: 3.44, qualifyingAffordableFar: 5.01, duFactor: 680 },
  "R7-2": { standardFar: 3.44, qualifyingAffordableFar: 5.01, duFactor: 680 },
  R7D:  { standardFar: 4.66, qualifyingAffordableFar: 5.60, duFactor: 680 },
  R7X:  { standardFar: 5.00, qualifyingAffordableFar: 6.00, duFactor: 680 },
  "R7-3": { standardFar: 5.00, qualifyingAffordableFar: 6.00, duFactor: 680 },
  R8:   { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680 },
  R8A:  { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680 },
  R8X:  { standardFar: 6.02, qualifyingAffordableFar: 7.20, duFactor: 680 },
  R8B:  { standardFar: 4.00, qualifyingAffordableFar: 4.80, duFactor: 680 },
  R9:   { standardFar: 7.52, qualifyingAffordableFar: 9.02, duFactor: 680 },
  R9A:  { standardFar: 7.52, qualifyingAffordableFar: 9.02, duFactor: 680 },
  R9D:  { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680 },
  R9X:  { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680 },
  "R9-1": { standardFar: 9.00, qualifyingAffordableFar: 10.80, duFactor: 680 },
  R10:  { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680 },
  R10A: { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680 },
  R10X: { standardFar: 10.00, qualifyingAffordableFar: 12.00, duFactor: 680 },
  R11:  { standardFar: 12.00, qualifyingAffordableFar: 15.00, duFactor: 680 },
  R12:  { standardFar: 15.00, qualifyingAffordableFar: 18.00, duFactor: 680 },
};

const COMM_TO_RES_ZONE: Record<string, string> = { C4: "R7-1", C5: "R10", C6: "R10" };
export const F_DEFAULT_DU = 700;

function fNormalizeZoneKey(zoneDist: string): string {
  const zu = (zoneDist || "").toUpperCase().trim();
  if (zu.startsWith("R")) return zu.split(/[^A-Z0-9-]/)[0];
  if (zu.includes("/")) {
    const after = zu.split("/")[1] || "";
    if (/^R\d/.test(after)) return after.split(/[^A-Z0-9-]/)[0];
  }
  for (const [prefix, res] of Object.entries(COMM_TO_RES_ZONE)) {
    if (zu.startsWith(prefix)) return res;
  }
  return zu;
}

function fGetZoningParams(zoneDist: string): ZoningDistrictParams | null {
  const key = fNormalizeZoneKey(zoneDist);
  if (ZONING_TABLE[key]) return ZONING_TABLE[key];
  const rMatch = key.match(/^(R\d+)/);
  if (rMatch && ZONING_TABLE[rMatch[1]]) return ZONING_TABLE[rMatch[1]];
  return null;
}

// ── Feasibility Engine ───────────────────────────────────────────────────

function fCalcTotalProjectedUnits(newResFa: number, duFactor: number = F_DEFAULT_DU): number {
  if (newResFa <= 0) return 0;
  return Math.floor(newResFa / duFactor);
}

function fCalcRequiredAffordableUnits(totalUnits: number, pct: number): number {
  if (totalUnits <= 0) return 0;
  if (pct <= 0) return 0;
  let normalizedPct = pct;
  if (pct > 1 && pct <= 100) normalizedPct = pct / 100;
  else if (pct > 100) normalizedPct = 1;
  return Math.ceil(totalUnits * normalizedPct);
}

const F_RES_PREFIXES = ["R", "C1", "C2", "C3", "C4", "C5", "C6", "MX"];

function zoneAllowsRes(zoneDist: string): boolean {
  const zu = (zoneDist || "").toUpperCase();
  if (F_RES_PREFIXES.some((x) => zu.startsWith(x))) return true;
  if (zu.includes("/R")) return true;
  if (/^M\d/.test(zu) && zu.includes("/")) {
    const after = zu.split("/")[1] || "";
    if (/^R\d/.test(after)) return true;
  }
  return false;
}


function fCapacity(p: any) {
  const lotArea = parseFloat(p.lotarea) || 0;
  const bldg = parseFloat(p.bldgarea) || 0;
  const plutoResFar = parseFloat(p.residfar) || 0;
  const cFar = parseFloat(p.commfar) || 0;
  const fFar = parseFloat(p.facilfar) || 0;
  const zoneDist = p.zonedist1 || "";
  const zoningParams = fGetZoningParams(zoneDist);
  const effectiveResFar = zoningParams ? Math.max(zoningParams.standardFar, plutoResFar) : plutoResFar;
  const duFactor = zoningParams?.duFactor ?? F_DEFAULT_DU;
  const zoningSource = zoningParams ? "table" : "pluto";
  const maxResFa = effectiveResFar * lotArea;
  const maxFar = Math.max(effectiveResFar, cFar, fFar);
  const maxBuild = maxFar * lotArea;
  const zRes = zoneAllowsRes(zoneDist);
  const qualifyingAffordableFar = zoningParams?.qualifyingAffordableFar ?? null;
  const qualifyingAffordableFa = qualifyingAffordableFar !== null ? Math.round(qualifyingAffordableFar * lotArea) : null;
  return {
    maxResFa: Math.round(maxResFa), maxBuildableSf: Math.round(maxBuild),
    existingBldgArea: Math.round(bldg), buildableSlackSf: Math.round(Math.max(maxBuild - bldg, 0)),
    newResFa: Math.round(Math.max(maxResFa - bldg, 0)),
    isVacant: bldg <= 0 || (p.landuse || "") === "11", zoneAllowsResidential: zRes,
    duFactor, qualifyingAffordableFar, qualifyingAffordableFa, zoningSource,
  };
}

function makeProgramOption(d: { n: string; p: number; a: number; y?: number; cy?: number; pcy?: number; b: Array<{ a: number; p: number }> }, newResFa: number, totalProjectedUnits: number, _duFactor?: number) {
  const afa = Math.round(d.p * newResFa);
  const u = fCalcRequiredAffordableUnits(totalProjectedUnits, d.p * 100);
  const bands = d.b.map((x) => {
    const fa = Math.round((x.p / 100) * afa);
    return { maxAmi: x.a, minPctOfAffordable: x.p, floorArea: fa, units: Math.ceil(u * x.p / 100) };
  });
  const benefitYears = d.y ?? (d.cy && d.pcy ? d.cy + d.pcy : null);
  return {
    name: d.n, affordableSetAsidePct: d.p * 100, affordableFloorArea: afa, affordableUnits: u,
    avgAmi: d.a, amiBands: bands, benefitYears, constructionPeriodYears: d.cy ?? null,
    registrationDeadline: null,
    details: { totalNewResFa: newResFa, totalProjectedUnits, marketRateFloorArea: newResFa - afa, marketRateUnits: Math.max(totalProjectedUnits - u, 0), roundingMethod: "ceil", ...(d.cy ? { constructionPeriod: `${d.cy} years`, postConstructionPeriod: `${d.pcy} years`, totalBenefitPeriod: `${(d.cy || 0) + (d.pcy || 0)} years` } : {}) },
  };
}

function fMih(cap: any) {
  const gaps: string[] = [];
  const citations: Array<{ source: string; field: string }> = [];
  const notes = ["MIH applies only in MIH-designated areas.", "Per ZR 23-154 / 23-90 (ZTIA), MIH options selected at zoning certification.", "MIH verification uses the NYC Open Data MIH map layer (checked client-side)."];
  if (!cap.zoneAllowsResidential) gaps.push("Zoning does not appear to allow residential use");
  if (cap.newResFa <= 0) gaps.push("No new residential floor area available under current FAR");
  citations.push({ source: "PLUTO", field: "ResidFAR" }, { source: "PLUTO", field: "ZoneDist1" });

  const defs = [
    { n: "Option 1", p: 0.25, a: 60, b: [{ a: 40, p: 10 }, { a: 60, p: 50 }, { a: 80, p: 40 }] },
    { n: "Option 2", p: 0.30, a: 80, b: [{ a: 60, p: 20 }, { a: 80, p: 40 }, { a: 100, p: 40 }] },
    { n: "Option 3 (Deep Affordability)", p: 0.20, a: 40, b: [{ a: 30, p: 40 }, { a: 40, p: 40 }, { a: 50, p: 20 }] },
    { n: "Option 4 (Workforce)", p: 0.30, a: 115, b: [{ a: 80, p: 20 }, { a: 115, p: 50 }, { a: 130, p: 30 }] },
  ];
  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const totalProjectedUnits = fCalcTotalProjectedUnits(cap.maxResFa, duFactor);
  const options = defs.map((d) => makeProgramOption(d, cap.maxResFa, totalProjectedUnits, duFactor));
  const eligible = gaps.length > 0 ? "no" as const : "needs_verification" as const;
  return { program: "MIH", eligible, applicableOption: eligible !== "no" ? options[0] : null, options, gaps, notes, missingData: [] as string[], citations };
}

function fUap(cap: any, lot: number, zoneDist: string) {
  const gaps: string[] = [];
  const missingData: string[] = [];
  const citations: Array<{ source: string; field: string }> = [];
  const notes = ["UAP provides additional residential FAR for qualifying affordable housing per ZR 23-22.", "Unit minimums: Studio 400 SF, 1BR 575 SF, 2BR 750 SF, 3BR 1000 SF.", "At least 50% of affordable units should have 2+ bedrooms.", "Max 3 income bands, each capped at 100% AMI."];
  if (!cap.zoneAllowsResidential) gaps.push("Zoning does not appear to allow residential use");
  if (cap.maxResFa <= 0) gaps.push("No residential FAR available for bonus calculation");
  citations.push({ source: "ZR 23-22", field: "Qualifying Affordable FAR" }, { source: "PLUTO", field: "ZoneDist1" });

  const resDes = extractResDesignation(zoneDist);
  const uapZones = ["R6", "R7", "R8", "R9", "R10", "R11", "R12"];
  const isUapZone = uapZones.some((z) => resDes.startsWith(z));
  if (!isUapZone) gaps.push(`Zone ${zoneDist || "N/A"} is not in UAP-eligible range (R6-R12)`);

  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const hasQualifyingFar = cap.qualifyingAffordableFar !== null && cap.qualifyingAffordableFa !== null && cap.qualifyingAffordableFa > cap.maxResFa;
  if (!hasQualifyingFar && isUapZone) gaps.push("No qualifying affordable FAR found in zoning table for this district");

  const totalFaWithUap = hasQualifyingFar ? cap.qualifyingAffordableFa : cap.maxResFa;
  const baseFa = cap.maxResFa;
  const bonusFa = Math.max(totalFaWithUap - baseFa, 0);
  const afa = bonusFa;
  const totalUnitsWithBonus = fCalcTotalProjectedUnits(totalFaWithUap, duFactor);
  const baseUnits = fCalcTotalProjectedUnits(baseFa, duFactor);
  const bonusUnits = Math.max(totalUnitsWithBonus - baseUnits, 0);
  const u = bonusUnits;
  const affordablePct = totalUnitsWithBonus > 0 ? Math.round((u / totalUnitsWithBonus) * 10000) / 100 : 0;
  const deep = afa >= 10000;
  let bands: any[];
  if (deep) {
    const dF = Math.round(0.20 * afa); const rem = afa - dF;
    const deepU = Math.max(Math.ceil(u * 0.20), 1); const midU = Math.ceil((u - deepU) * 0.5); const topU = Math.max(u - deepU - midU, 0);
    bands = [{ maxAmi: 40, minPctOfAffordable: 20, floorArea: dF, units: deepU }, { maxAmi: 60, minPctOfAffordable: 40, floorArea: Math.round(rem * 0.5), units: midU }, { maxAmi: 80, minPctOfAffordable: 40, floorArea: rem - Math.round(rem * 0.5), units: topU }];
    notes.push(`AFA (${afa.toLocaleString()} SF) >= 10,000 SF: 20% must be at <= 40% AMI.`);
  } else {
    const halfU = Math.ceil(u * 0.5); const restU = Math.max(u - halfU, 0);
    const h = Math.round(afa / 2);
    bands = [{ maxAmi: 50, minPctOfAffordable: 50, floorArea: h, units: halfU }, { maxAmi: 70, minPctOfAffordable: 50, floorArea: afa - h, units: restU }];
  }
  const bonusFarValue = cap.qualifyingAffordableFar !== null ? Math.round((cap.qualifyingAffordableFar - (cap.maxResFa / lot)) * 100) / 100 : 0;
  const opt = { name: "UAP Bonus", affordableSetAsidePct: affordablePct, affordableFloorArea: afa, affordableUnits: u, avgAmi: 60, amiBands: bands, benefitYears: null, constructionPeriodYears: null, registrationDeadline: null, details: { totalProjectedUnits: totalUnitsWithBonus, standardFar: Math.round((cap.maxResFa / lot) * 100) / 100, qualifyingAffordableFar: cap.qualifyingAffordableFar ?? 0, bonusFar: bonusFarValue, bonusFloorArea: bonusFa, totalResFaWithBonus: totalFaWithUap, totalUnitsWithBonus, baseUnits, marketRateUnits: totalUnitsWithBonus - u, duFactor, triggersDeepAffordability: deep, deepAffordableThresholdSf: 10000, zoningSource: cap.zoningSource } };
  notes.push("All bonus floor area above the standard FAR must be permanently affordable at avg 60% AMI.");

  const eligible = gaps.length > 0 ? "no" as const : isUapZone && hasQualifyingFar ? "yes" as const : "no" as const;
  if (eligible === "yes") missingData.push("HPD UAP program enrollment confirmation (assumed)");
  return { program: "UAP", eligible, applicableOption: eligible !== "no" ? opt : null, options: [opt], gaps, notes, missingData: eligible === "yes" ? missingData : [], citations };
}

function f485x(cap: any, projUnits: number, borough: string) {
  const gaps: string[] = [];
  const missingData: string[] = [];
  const citations: Array<{ source: string; field: string }> = [];
  const notes = ["485-x (Affordable Neighborhoods for New Yorkers) enacted 2024.", "Registration deadline varies by option and project commencement date.", "Unit counts use ceiling rounding per HPD guidance.", "Options C (small rental, rent-stabilization) and D (homeownership) are not modeled here."];
  if (!cap.zoneAllowsResidential) gaps.push("Zoning does not appear to allow residential use");
  if (cap.newResFa <= 0) gaps.push("No new residential floor area available");
  citations.push({ source: "PLUTO", field: "ResidFAR" }, { source: "PLUTO", field: "LotArea" }, { source: "PLUTO", field: "ZoneDist1" });

  const defs = [
    { n: "Option A (Large)", p: 0.25, a: 80, y: 35, b: [{ a: 60, p: 30 }, { a: 80, p: 40 }, { a: 100, p: 30 }], minUnits: 100 },
    { n: "Option A (Very Large)", p: 0.25, a: 60, y: 40, b: [{ a: 40, p: 30 }, { a: 60, p: 40 }, { a: 80, p: 30 }], minUnits: 150 },
    { n: "Option B", p: 0.20, a: 80, y: 35, b: [{ a: 60, p: 30 }, { a: 80, p: 40 }, { a: 100, p: 30 }], minUnits: 6 },
  ];

  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const totalProjectedUnits = fCalcTotalProjectedUnits(cap.maxResFa, duFactor);

  if (totalProjectedUnits < 6) {
    gaps.push("Fewer than 6 projected units; 485-x Options A/B require at least 6 dwelling units");
  }

  const options = defs.map((d) => makeProgramOption(d, cap.maxResFa, totalProjectedUnits, duFactor));

  let applicableIdx = 2;
  if (projUnits >= 150) applicableIdx = 1;
  else if (projUnits >= 100) applicableIdx = 0;

  if (projUnits <= 0) {
    missingData.push("Projected unit count (derived from PLUTO ResidFAR * LotArea)");
    notes.push("Could not determine unit count; defaulting to Option B.");
  }

  const applicableOption = gaps.length > 0 ? null : options[applicableIdx];
  const eligible = gaps.length > 0 ? "no" as const : "yes" as const;
  if (eligible === "yes") {
    missingData.push("NB permit commencement date within 485-x window (Jun 2022 - Jun 2034, assumed)");
    missingData.push("HPD 485-x registration filing (assumed)");
  }
  notes.push(`Applicable option: ${defs[applicableIdx].n} (based on ~${projUnits} projected units).`);
  return { program: "485-x", eligible, applicableOption, options, gaps, notes, missingData: eligible === "yes" ? missingData : [], citations };
}

function f421a(cap: any) {
  const gaps = ["421-a expired June 15, 2022. Only grandfathered projects may qualify."];
  const notes = ["421-a (Affordable New York Housing Program) benefit: construction period + post-construction.", "Projects must have commenced construction before expiration to be grandfathered."];
  const citations: Array<{ source: string; field: string }> = [{ source: "NYC HPD", field: "421-a program status" }];
  if (!cap.zoneAllowsResidential) gaps.push("Zoning does not appear to allow residential use");
  if (cap.newResFa <= 0) gaps.push("No new residential floor area available");
  const defs = [
    { n: "Option A (Homeownership)", p: 0.25, a: 130, cy: 3, pcy: 25, b: [{ a: 100, p: 30 }, { a: 130, p: 70 }] },
    { n: "Option B (Rental)", p: 0.25, a: 130, cy: 3, pcy: 35, b: [{ a: 100, p: 30 }, { a: 130, p: 40 }, { a: 165, p: 30 }] },
    { n: "Option C (Enhanced Affordability)", p: 0.30, a: 60, cy: 3, pcy: 35, b: [{ a: 40, p: 30 }, { a: 60, p: 40 }, { a: 80, p: 30 }] },
  ];
  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const totalProjectedUnits = fCalcTotalProjectedUnits(cap.maxResFa, duFactor);
  const options = defs.map((d) => makeProgramOption(d, cap.maxResFa, totalProjectedUnits, duFactor));
  return { program: "421-a", eligible: "no" as const, applicableOption: null, options, gaps, notes, missingData: [] as string[], citations };
}

function f467m(cap: any, activeProgs: string[]) {
  const gaps: string[] = [];
  const missingData: string[] = [];
  const citations: Array<{ source: string; field: string }> = [];
  const notes = ["467-m: 25% affordable, 5% at <= 40% AMI, weighted avg <= 80% AMI.", "Max 3 income bands, each capped at 100% AMI.", "Conversion projects: >= 50% of total floor area must be pre-existing.", "Cannot stack with 421-a, 485-x, J-51, or other property tax exemptions/abatements."];
  if (!cap.zoneAllowsResidential) gaps.push("Zoning does not appear to allow residential use");
  if (cap.newResFa <= 0) gaps.push("No new residential floor area available");
  citations.push({ source: "PLUTO", field: "ResidFAR" }, { source: "PLUTO", field: "BldgArea" });
  const confl = ["421-a", "485-x", "J-51"];
  const hits = activeProgs.filter((p: string) => confl.some((c) => p.toLowerCase().includes(c.toLowerCase())));
  if (hits.length > 0) gaps.push(`Stacking conflict with: ${hits.join(", ")}`);
  const tR = cap.maxResFa;
  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const totalProjectedUnits = fCalcTotalProjectedUnits(tR, duFactor);
  const aFa = Math.round(0.25 * tR);
  const dFa = Math.round(0.05 * tR);
  const mFa = aFa - dFa;
  const u = fCalcRequiredAffordableUnits(totalProjectedUnits, 25);
  const dU = Math.ceil(u * (5 / 25));
  const bands = [
    { maxAmi: 40, minPctOfAffordable: Math.round((dFa / (aFa || 1)) * 100), floorArea: dFa, units: dU },
    { maxAmi: 80, minPctOfAffordable: Math.round(((mFa * 0.5) / (aFa || 1)) * 100), floorArea: Math.round(mFa * 0.5), units: Math.ceil((u - dU) * 0.5) },
    { maxAmi: 100, minPctOfAffordable: Math.round(((mFa * 0.5) / (aFa || 1)) * 100), floorArea: mFa - Math.round(mFa * 0.5), units: Math.max(u - dU - Math.ceil((u - dU) * 0.5), 0) },
  ];
  const wA = aFa > 0 ? Math.round(bands.reduce((s: number, b: any) => s + b.maxAmi * b.floorArea, 0) / aFa) : 0;
  const isC = cap.existingBldgArea > 0 && !cap.isVacant;
  const cR = cap.existingBldgArea > 0 && cap.maxBuildableSf > 0 ? cap.existingBldgArea / cap.maxBuildableSf : 0;
  if (isC && cR < 0.50) gaps.push(`Conversion requires >= 50% pre-existing floor area (current: ${Math.round(cR * 100)}%)`);
  const opt = { name: "467-m", affordableSetAsidePct: 25, affordableFloorArea: aFa, affordableUnits: u, avgAmi: wA, amiBands: bands, benefitYears: null, constructionPeriodYears: null, registrationDeadline: null, details: { totalNewResFa: tR, totalProjectedUnits, deepAffordableFa: dFa, deepAffordableUnits: dU, weightedAvgAmi: wA, weightedAvgAmiLimit: 80, meetsWeightedAvg: wA <= 80, isConversion: isC, conversionRatioPct: Math.round(cR * 100), conversionMeetsThreshold: cR >= 0.50, stackingConflicts: hits.join(", ") || "none" } };
  const eligible = gaps.length > 0 ? "no" as const : cap.newResFa > 0 ? "needs_verification" as const : "no" as const;
  if (eligible === "needs_verification") {
    missingData.push("NB permit commencement date within 467-m window");
    missingData.push("Confirmation project is not receiving 485-x, 421-a, or J-51 benefits");
  }
  return { program: "467-m", eligible, applicableOption: eligible !== "no" ? opt : null, options: [opt], gaps, notes, missingData: eligible === "needs_verification" ? missingData : [], citations };
}

export function evaluateFeasibility(pluto: any, activePrograms: string[] = []) {
  if (!pluto) return null;
  const lotArea = parseFloat(pluto.lotarea) || 0;
  if (lotArea <= 0) return null;
  const cap = fCapacity(pluto);
  const zoneDist = pluto.zonedist1 || "";
  const duFactor = cap.duFactor ?? F_DEFAULT_DU;
  const projUnits = fCalcTotalProjectedUnits(cap.maxResFa, duFactor);
  const borough = (pluto.borough || pluto.borocode || "0").toString();

  const mih = fMih(cap);
  const uap = fUap(cap, lotArea, zoneDist);
  const t485x = f485x(cap, projUnits, borough);
  const t421a = f421a(cap);
  const t467m = f467m(cap, activePrograms);
  const sc: string[] = [];
  const h485 = activePrograms.some((p) => p.toLowerCase().includes("485-x"));
  const h421 = activePrograms.some((p) => p.toLowerCase().includes("421-a"));
  const hJ51 = activePrograms.some((p) => p.toLowerCase().includes("j-51"));
  if (h485 && h421) sc.push("485-x and 421-a are mutually exclusive tax programs");
  if ((h485 || h421 || hJ51) && t467m.eligible !== "no") sc.push("467-m cannot stack with 421-a, 485-x, or J-51 exemptions");
  return { capacity: cap, programs: [mih, uap, t485x, t421a, t467m], stackingConflicts: sc };
}
