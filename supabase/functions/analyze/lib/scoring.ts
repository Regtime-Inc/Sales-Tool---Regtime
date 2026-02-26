import { type TraceEntry } from "./types.ts";

// ── Metrics & Scoring ─────────────────────────────────────────────────────

export function computeMetrics(pluto: any, sale: any, secondarySale?: any) {
  if (!pluto) return null;
  const lotArea = parseFloat(pluto.lotarea) || 0;
  const bldgArea = parseFloat(pluto.bldgarea) || 0;
  const residFar = parseFloat(pluto.residfar) || 0;
  const commFar = parseFloat(pluto.commfar) || 0;
  const facilFar = parseFloat(pluto.facilfar) || 0;

  const builtFarCalc = lotArea > 0 ? bldgArea / lotArea : 0;
  const maxAllowableFar = Math.max(residFar, commFar, facilFar);
  const maxBuildableSf = maxAllowableFar * lotArea;
  const buildableSlackSf = maxBuildableSf - bldgArea;
  const underbuiltRatio =
    bldgArea > 0 ? maxBuildableSf / bldgArea : maxBuildableSf > 0 ? 999 : 0;

  const amt = (sale?.amount || 0) > 0 ? sale.amount : (secondarySale?.amount || 0);
  const ppsf = amt > 0 && bldgArea > 0 ? amt / bldgArea : null;
  const ppbsf = amt > 0 && maxBuildableSf > 0 ? amt / maxBuildableSf : null;

  return {
    builtFarCalc: Math.round(builtFarCalc * 100) / 100,
    maxAllowableFar: Math.round(maxAllowableFar * 100) / 100,
    maxBuildableSf: Math.round(maxBuildableSf),
    buildableSlackSf: Math.round(buildableSlackSf),
    underbuiltRatio: Math.round(underbuiltRatio * 100) / 100,
    ppsf: ppsf ? Math.round(ppsf * 100) / 100 : null,
    ppbsf: ppbsf ? Math.round(ppbsf * 100) / 100 : null,
  };
}

export function scanFlags(remarks: string[], dobDescriptions: string[]) {
  const all = [...remarks, ...dobDescriptions].join(" ").toUpperCase();
  const p485 = ["485-X", "485X", "485(X)", "SECTION 485-X", "TAX EXEMPTION 485"];
  const pUap = ["UAP", "UNIFORM AFFORDABILITY", "UNIFIED AFFORDABILITY"];
  const pMih = ["MIH", "MANDATORY INCLUSIONARY", "INCLUSIONARY HOUSING"];
  const p421a = ["421-A", "421A", "AFFORDABLE NEW YORK"];
  const p467m = ["467-M", "467M"];

  const is485x = p485.some((p) => all.includes(p));
  const isUap = pUap.some((p) => all.includes(p));
  const isMih = pMih.some((p) => all.includes(p));
  const is421a = p421a.some((p) => all.includes(p));
  const is467m = p467m.some((p) => all.includes(p));

  const is485xEvidence: string[] = [];
  const uapEvidence: string[] = [];
  const mihEvidence: string[] = [];
  const evidence421a: string[] = [];
  const evidence467m: string[] = [];
  for (const t of [...remarks, ...dobDescriptions]) {
    const u = t.toUpperCase();
    if (p485.some((p) => u.includes(p))) is485xEvidence.push(t);
    if (pUap.some((p) => u.includes(p))) uapEvidence.push(t);
    if (pMih.some((p) => u.includes(p))) mihEvidence.push(t);
    if (p421a.some((p) => u.includes(p))) evidence421a.push(t);
    if (p467m.some((p) => u.includes(p))) evidence467m.push(t);
  }
  return { is485x, isUap, isMih, is421a, is467m, is485xEvidence, uapEvidence, mihEvidence, evidence421a, evidence467m };
}

const DOB_JOB_TYPE_MAP: Record<string, string> = {
  "new building": "NB",
  "demolition": "DM",
  "alteration": "A1",
  "alteration type 1": "A1",
  "alteration type 2": "A2",
  "alteration type 3": "A3",
  "foundation only": "FO",
  "full demolition": "DM",
  "nb": "NB",
  "dm": "DM",
  "a1": "A1",
  "a2": "A2",
  "a3": "A3",
  "fo": "FO",
};

export function normalizeDobJobType(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (["NB", "DM", "A1", "A2", "A3", "FO"].includes(upper)) return upper;
  return DOB_JOB_TYPE_MAP[trimmed.toLowerCase()] || upper;
}

export function computeScore(
  pluto: any,
  metrics: any,
  sale: any,
  dobFilings: any[],
  hpdReg: any,
  flags: any,
  feasibility: any,
  secondarySale?: any
) {
  const breakdown: any[] = [];
  let devScore = 0;
  let rentalOverlay = 0;

  if (metrics) {
    const r = metrics.underbuiltRatio;
    let pts = 0;
    let reason = "";
    if (r >= 999) { pts = 30; reason = "Vacant / no existing building"; }
    else if (r >= 3) { pts = 30; reason = `Heavily underbuilt (${r}x)`; }
    else if (r >= 2) { pts = 25; reason = `Significantly underbuilt (${r}x)`; }
    else if (r >= 1.5) { pts = 20; reason = `Moderately underbuilt (${r}x)`; }
    else if (r >= 1.2) { pts = 15; reason = `Slightly underbuilt (${r}x)`; }
    else if (r >= 1) { pts = 10; reason = `Marginally underbuilt (${r}x)`; }
    else { pts = 0; reason = `Fully built (${r}x)`; }
    devScore += pts;
    breakdown.push({ category: "Underbuilt Ratio", score: pts, maxScore: 30, reason });
  } else {
    breakdown.push({ category: "Underbuilt Ratio", score: 0, maxScore: 30, reason: "No PLUTO data" });
  }

  const effectiveSale = (sale && sale.amount > 0) ? sale : (secondarySale && secondarySale.amount > 0) ? secondarySale : null;
  const otherSale = effectiveSale === sale ? secondarySale : effectiveSale === secondarySale ? sale : null;
  if (effectiveSale) {
    let pts = 0;
    const reasons: string[] = [];
    const saleDate = new Date(effectiveSale.documentDate);
    const years = (Date.now() - saleDate.getTime()) / (365.25 * 24 * 3600000);
    if (years <= 2) { pts += 10; reasons.push("Sale within 2 years"); }
    else if (years <= 5) { pts += 5; reasons.push("Sale within 5 years"); }
    if (metrics?.ppsf && metrics.ppsf < 100) { pts += 10; reasons.push(`Low PPSF ($${metrics.ppsf})`); }
    else if (metrics?.ppsf && metrics.ppsf < 250) { pts += 5; reasons.push(`Below-market PPSF ($${metrics.ppsf})`); }
    pts += 5;
    reasons.push(`Sale: $${effectiveSale.amount.toLocaleString()} (${effectiveSale.source === "acris" ? "ACRIS" : "DOF"})`);
    if (otherSale && otherSale.amount > 0) {
      pts += 3;
      reasons.push(`Corroborated by ${otherSale.source === "acris" ? "ACRIS" : "DOF"}: $${otherSale.amount.toLocaleString()}`);
    }
    const s = Math.min(pts, 25);
    devScore += s;
    breakdown.push({ category: "Sale Indicators", score: s, maxScore: 25, reason: reasons.join("; ") });
  } else {
    breakdown.push({ category: "Sale Indicators", score: 0, maxScore: 25, reason: "No sale data from ACRIS or DOF" });
  }

  if (pluto) {
    let pts = 0;
    const reasons: string[] = [];
    const lu = pluto.landuse;
    if (lu === "11") { pts += 20; reasons.push("Vacant land"); }
    else if (lu === "10") { pts += 15; reasons.push("Parking facility"); }
    else if (["01", "02", "03"].includes(lu)) {
      if (parseFloat(pluto.numfloors) <= 2 && parseFloat(pluto.lotarea) > 5000) {
        pts += 10;
        reasons.push("Low-rise on large lot");
      }
    }
    if (metrics && metrics.builtFarCalc < 1 && metrics.maxAllowableFar > 2) {
      pts += 5;
      reasons.push("Low FAR utilization");
    }
    if (feasibility) {
      const progs = feasibility.programs || [];
      const resDes = extractResDesignation(pluto.zonedist1 || "");
      const mihZones = ["R6", "R7", "R8", "R9", "R10"];
      if (mihZones.some((z) => resDes.startsWith(z))) { pts += 5; reasons.push("MIH-eligible zone range"); }
      const uapProg = progs.find((p: any) => p.program === "UAP");
      if (uapProg && uapProg.eligible !== "no") { pts += 5; reasons.push("UAP-eligible"); }
      const t485 = progs.find((p: any) => p.program === "485-x");
      if (t485 && t485.eligible !== "no") { pts += 5; reasons.push("485-x eligible"); }
      const t467 = progs.find((p: any) => p.program === "467-m");
      if (t467 && t467.eligible !== "no") { pts += 5; reasons.push("467-m eligible"); }
      if (parseFloat(pluto.residfar) >= 3.0) { pts += 5; reasons.push("High res FAR (>= 3.0)"); }
    }
    const s = Math.min(pts, 45);
    devScore += s;
    breakdown.push({ category: "Property Characteristics", score: s, maxScore: 45, reason: reasons.join("; ") || "Standard" });
  } else {
    breakdown.push({ category: "Property Characteristics", score: 0, maxScore: 45, reason: "No PLUTO data" });
  }

  {
    let pts = 0;
    const reasons: string[] = [];
    const normalized = dobFilings.map((f) => ({ ...f, _normType: normalizeDobJobType(f.jobType) }));
    const nb = normalized.filter((f) => f._normType === "NB");
    const dm = normalized.filter((f) => f._normType === "DM");
    const a1 = normalized.filter((f) => f._normType === "A1");
    const fo = normalized.filter((f) => f._normType === "FO");
    if (nb.length) { pts += 15; reasons.push(`${nb.length} New Building`); }
    if (dm.length) { pts += 12; reasons.push(`${dm.length} Demolition`); }
    if (a1.length) { pts += 8; reasons.push(`${a1.length} Major Alteration`); }
    if (fo.length) { pts += 5; reasons.push(`${fo.length} Foundation Only`); }
    const s = Math.min(pts, 15);
    devScore += s;
    breakdown.push({ category: "Pipeline Activity", score: s, maxScore: 15, reason: reasons.join("; ") || "No significant DOB filings" });
  }

  {
    let penalty = 0;
    const reasons: string[] = [];
    if (flags.is485x) { penalty += 3; reasons.push("485-x benefit detected"); }
    if (flags.isUap) { penalty += 3; reasons.push("UAP benefit detected"); }
    if (flags.isMih) { penalty += 3; reasons.push("MIH benefit detected"); }
    if (flags.is421a) { penalty += 3; reasons.push("421-a benefit detected"); }
    if (flags.is467m) { penalty += 3; reasons.push("467-m benefit detected"); }
    devScore = Math.max(devScore - penalty, 0);
    breakdown.push({ category: "Existing Benefits (Penalty)", score: -penalty, maxScore: 0, reason: reasons.join("; ") || "None detected" });
  }

  devScore = Math.min(devScore, 100);

  {
    const rentalReasons: string[] = [];
    if (pluto) {
      const z = (pluto.zonedist1 || "").toUpperCase();
      if (z.startsWith("R") || z.startsWith("C") || z.startsWith("M1")) {
        rentalOverlay += 10;
        rentalReasons.push(`Residential/Commercial zone (${z})`);
      }
    }
    if (flags.is485x) { rentalOverlay += 10; rentalReasons.push("485-x benefit detected"); }
    if (hpdReg && hpdReg.registrationid) { rentalOverlay += 5; rentalReasons.push("HPD registration on file"); }
    if (flags.isUap) { rentalOverlay += 5; rentalReasons.push("UAP benefit detected"); }
    rentalOverlay = Math.min(rentalOverlay, 30);
    breakdown.push({ category: "Rental Overlay", score: rentalOverlay, maxScore: 30, reason: rentalReasons.join("; ") || "No rental indicators" });
  }

  const total = devScore + rentalOverlay;
  let classification: string;
  if (total >= 76) classification = "Very High";
  else if (total >= 51) classification = "High";
  else if (total >= 26) classification = "Moderate";
  else classification = "Low";

  return { devScore, rentalOverlay, totalScore: total, classification, breakdown };
}

export function extractResDesignation(zoneDist: string): string {
  const zu = (zoneDist || "").toUpperCase();
  if (zu.startsWith("R")) return zu.split(/[^A-Z0-9]/)[0];
  if (zu.includes("/")) {
    const after = zu.split("/")[1] || "";
    if (/^R\d/.test(after)) return after.split(/[^A-Z0-9]/)[0];
  }
  const commToRes: Record<string, string> = {
    C4: "R7", C5: "R10", C6: "R10",
  };
  for (const [prefix, res] of Object.entries(commToRes)) {
    if (zu.startsWith(prefix)) return res;
  }
  return "";
}
