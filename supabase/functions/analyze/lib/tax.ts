import { F_DEFAULT_DU } from "./feasibility.ts";
// ── Tax Projections (Illustrative) ────────────────────────────────────────

const TAX_RATES: Record<number, number> = { 1: 0.19963, 2: 0.12439, 3: 0.12094, 4: 0.10592 };
const TAX_YEAR = 2026;
const TAX_DISCLAIMER = "Tax projections are illustrative only. Actual assessed values, tax rates, and incentive schedules are determined by NYC DOF and may change annually. Consult a tax professional before making investment decisions.";

function tInferClass(bc: string, unitsRes: number): number {
  const u = (bc || "").toUpperCase();
  if (u.startsWith("A") || u.startsWith("B") || u.startsWith("S")) return 1;
  if (u.startsWith("U") || u.startsWith("T")) return 3;
  if (unitsRes >= 4 || u.startsWith("C") || u.startsWith("D") || u.startsWith("R")) return 2;
  if ("OKLEFGHIJ".split("").some((c) => u.startsWith(c))) return 4;
  return 2;
}

const ASSESSMENT_RATIO_CLASS_2 = 0.45;
const BOROUGH_MV_PER_GSF: Record<string, { median: number; label: string }> = {
  "1": { median: 400, label: "Manhattan" },
  "2": { median: 200, label: "Bronx" },
  "3": { median: 300, label: "Brooklyn" },
  "4": { median: 250, label: "Queens" },
  "5": { median: 200, label: "Staten Island" },
};

function tEstAV(borough: string, proposedGSF: number): { av: number; avEstimate: any } {
  const tier = BOROUGH_MV_PER_GSF[borough] || BOROUGH_MV_PER_GSF["3"];
  const mvPerGsf = tier.median;
  const marketValue = Math.round(proposedGSF * mvPerGsf);
  const av = Math.round(marketValue * ASSESSMENT_RATIO_CLASS_2);
  const avPerGsf = proposedGSF > 0 ? Math.round((av / proposedGSF) * 100) / 100 : 0;
  return {
    av: av > 0 ? av : Math.round(proposedGSF * 15),
    avEstimate: {
      estimatedNewAV: av,
      marketValueEstimate: marketValue,
      avPerGsf,
      methodUsed: "Borough median MV/GSF heuristic",
      confidence: "MED" as const,
      reasoning: `${tier.label} new-build median ~$${mvPerGsf}/GSF x ${proposedGSF.toLocaleString()} GSF x ${ASSESSMENT_RATIO_CLASS_2 * 100}% assessment ratio`,
      borough,
      proposedGSF,
      assessmentRatio: ASSESSMENT_RATIO_CLASS_2,
    },
  };
}

function tBaseRow(yr: number, av: number, rate: number) {
  const gt = Math.round(av * rate * 100) / 100;
  return { year: yr, assessedValue: av, taxableValue: av, exemptionAmount: 0, grossTax: gt, abatementCredit: 0, netTax: gt };
}

function tScenRow(yr: number, av: number, rate: number, exPct: number, abPct: number) {
  const exAmt = Math.round(av * (exPct / 100) * 100) / 100;
  const tv = Math.max(av - exAmt, 0);
  const gt = Math.round(tv * rate * 100) / 100;
  const abCr = Math.round(gt * (abPct / 100) * 100) / 100;
  const nt = Math.max(gt - abCr, 0);
  return { year: yr, assessedValue: av, taxableValue: tv, exemptionAmount: exAmt, grossTax: gt, abatementCredit: abCr, netTax: nt };
}

function tMakeEntries(fullYrs: number, totalYrs: number): Array<{ yr: number; exPct: number; abPct: number }> {
  const e: Array<{ yr: number; exPct: number; abPct: number }> = [];
  for (let i = 1; i <= fullYrs; i++) e.push({ yr: i, exPct: 100, abPct: 0 });
  const steps = [80, 80, 60, 60, 40, 40, 20, 20, 10, 10];
  for (let i = 0; i < totalYrs - fullYrs && i < steps.length; i++) e.push({ yr: fullYrs + i + 1, exPct: steps[i], abPct: 0 });
  return e;
}

const T_SCHEDULE_MAP: Record<string, { fullYrs: number; totalYrs: number }> = {
  "485-x__Option A (Large)": { fullYrs: 25, totalYrs: 35 },
  "485-x__Option A (Very Large)": { fullYrs: 30, totalYrs: 40 },
  "485-x__Option B": { fullYrs: 25, totalYrs: 35 },
  "467-m__467-m": { fullYrs: 25, totalYrs: 35 },
};

const ASSESSMENT_GROWTH_RATE = 0.02;

function tGrowthBaseRow(yr: number, av: number, rate: number, growthRate: number) {
  const gav = Math.round(av * Math.pow(1 + growthRate, yr - 1));
  const gt = Math.round(gav * rate * 100) / 100;
  return { year: yr, assessedValue: gav, taxableValue: gav, exemptionAmount: 0, grossTax: gt, abatementCredit: 0, netTax: gt };
}

function tBuildScenario(
  key: string, av: number, rate: number, eligStatus: string | null
): any | null {
  const schedule = T_SCHEDULE_MAP[key];
  if (!schedule) return null;
  const [program, optName] = key.split("__");
  const entries = tMakeEntries(schedule.fullYrs, schedule.totalYrs);
  const rows = entries.map((e) => tScenRow(e.yr, av, rate, e.exPct, e.abPct));
  const blTotal = rows.length * (Math.round(av * rate * 100) / 100);
  const scTotal = rows.reduce((sum, r) => sum + r.netTax, 0);
  const totalSavings = Math.round((blTotal - scTotal) * 100) / 100;
  const growthBlTotal = rows.reduce(
    (s, r) => s + tGrowthBaseRow(r.year, av, rate, ASSESSMENT_GROWTH_RATE).netTax, 0
  );
  const realSavings = Math.round((growthBlTotal - scTotal) * 100) / 100;
  const savingsPct = growthBlTotal > 0
    ? Math.round((realSavings / growthBlTotal) * 10000) / 100 : 0;
  const statusText = eligStatus === "yes" ? "Eligible"
    : eligStatus === "no" ? "Not eligible (illustrative)"
    : "Needs manual verification";
  return {
    program, option: optName,
    label: `${program} ${optName} – ${schedule.totalYrs} yr`,
    illustrative: true as const,
    rows, totalSavings, realSavings, savingsPct,
    reason: `${program} status: ${statusText}. ${optName} selected based on projected unit count.`,
  };
}

export function computeTaxProjections(pluto: any, newResFa: number, feasibilityPrograms: any[], borough: string) {
  if (!pluto) return null;
  const bldgArea = parseFloat(pluto.bldgarea) || 0;
  const unitsRes = parseInt(pluto.unitsres) || 0;
  const bc = pluto.bldgclass || "";
  const tc = tInferClass(bc, unitsRes);
  const rate = TAX_RATES[tc] || TAX_RATES[2];
  const proposedGSF = newResFa > 0 ? newResFa : bldgArea;
  const { av, avEstimate } = tEstAV(borough, proposedGSF);
  if (av <= 0) return null;
  const baseline = Array.from({ length: 40 }, (_, i) => tBaseRow(i + 1, av, rate));
  const baselineWithGrowth = Array.from({ length: 40 }, (_, i) => tGrowthBaseRow(i + 1, av, rate, ASSESSMENT_GROWTH_RATE));
  const noExemptionTotalTax = Math.round(baselineWithGrowth.reduce((s, r) => s + r.netTax, 0) * 100) / 100;

  const projectedUnits = newResFa > 0 ? Math.floor(newResFa / F_DEFAULT_DU) : 0;

  const eligMap = new Map<string, string>();
  for (const p of feasibilityPrograms) {
    eligMap.set(p.program, p.eligible || "unknown");
  }

  const scenarios: any[] = [];

  const e485x = eligMap.get("485-x") || "unknown";
  let key485x: string;
  if (projectedUnits >= 150) key485x = "485-x__Option A (Very Large)";
  else if (projectedUnits >= 100) key485x = "485-x__Option A (Large)";
  else key485x = "485-x__Option B";
  const s485 = tBuildScenario(key485x, av, rate, e485x);
  if (s485) scenarios.push(s485);

  const e467m = eligMap.get("467-m") || "unknown";
  const s467 = tBuildScenario("467-m__467-m", av, rate, e467m);
  if (s467) scenarios.push(s467);

  return {
    taxClass: tc, taxRate: rate, taxYear: TAX_YEAR, estimatedAssessedValue: av,
    avEstimate,
    assessmentGrowthRate: ASSESSMENT_GROWTH_RATE, baseline, baselineWithGrowth,
    noExemptionTotalTax, scenarios, disclaimer: TAX_DISCLAIMER,
  };
}
