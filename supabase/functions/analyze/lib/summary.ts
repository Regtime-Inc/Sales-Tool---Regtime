export function generateSummary(r: any): string {
  const parts: string[] = [];
  parts.push(`Development Potential: ${r.scoring.classification} (Score ${r.scoring.totalScore}/130)`);

  if (r.pluto) {
    parts.push(
      `Property zoned ${r.pluto.zonedist1 || "N/A"} with ${Number(r.pluto.lotarea).toLocaleString()} SF lot and ${Number(r.pluto.bldgarea).toLocaleString()} SF building.`
    );
  }
  if (r.metrics) {
    parts.push(
      `Built FAR ${r.metrics.builtFarCalc} vs max ${r.metrics.maxAllowableFar}. Buildable slack: ${r.metrics.buildableSlackSf.toLocaleString()} SF (${r.metrics.underbuiltRatio >= 999 ? "vacant" : r.metrics.underbuiltRatio + "x underbuilt"}).`
    );
  }
  if (r.recentSale) {
    const srcLabel = r.recentSale.source === "acris" ? "ACRIS" : "DOF";
    parts.push(
      `Last sale: $${r.recentSale.amount.toLocaleString()} on ${r.recentSale.documentDate?.split("T")[0] || "N/A"} (${srcLabel}).`
    );
    if (r.secondarySale) {
      const secLabel = r.secondarySale.source === "acris" ? "ACRIS" : "DOF";
      parts.push(`Also recorded in ${secLabel}: $${r.secondarySale.amount.toLocaleString()} on ${r.secondarySale.documentDate?.split("T")[0] || "N/A"}.`);
    }
    if (r.metrics?.ppsf) parts.push(`PPSF: $${r.metrics.ppsf}. PPBSF: $${r.metrics.ppbsf || "N/A"}.`);
  }
  if (r.dobFilings.length) {
    const nb = r.dobFilings.filter((f: any) => f.jobType === "NB").length;
    const dm = r.dobFilings.filter((f: any) => f.jobType === "DM").length;
    let s = `DOB: ${r.dobFilings.length} filing(s)`;
    if (nb) s += `, ${nb} NB`;
    if (dm) s += `, ${dm} DM`;
    parts.push(s + ".");
  }
  if (r.flags.is485x) parts.push("485-x tax incentive detected.");
  if (r.flags.isUap) parts.push("UAP mention found.");
  if (r.flags.isMih) parts.push("MIH mention found.");
  if (r.flags.is421a) parts.push("421-a mention found.");
  if (r.flags.is467m) parts.push("467-m mention found.");
  if (r.hpdRegistrations && r.hpdRegistrations.length > 0) {
    parts.push(`HPD: ${r.hpdRegistrations.length} registration(s) on file.`);
  }
  return parts.join(" ");
}

export function generateNextActions(r: any): string[] {
  const a: string[] = [];
  if (r.scoring.classification === "Very High" || r.scoring.classification === "High") {
    a.push("Review zoning resolution for site-specific development rights");
    a.push("Obtain title report and check for deed restrictions");
  }
  if (r.metrics?.buildableSlackSf > 0) {
    a.push(`Evaluate feasibility of ${r.metrics.buildableSlackSf.toLocaleString()} SF buildable slack`);
  }
  if (r.recentSale) {
    a.push("Verify sale price with broker or appraiser");
  }
  if (r.dobFilings.length) {
    a.push("Check DOB BIS for detailed permit status and plans");
  } else {
    a.push("Check DOB BIS for any pending applications not in open data");
  }
  if (r.flags.is485x) a.push("Verify 485-x eligibility and benefit timeline");
  a.push("Conduct environmental review (Phase I ESA)");
  a.push("Review DOF property tax records for assessment trends");
  return a.slice(0, 8);
}
