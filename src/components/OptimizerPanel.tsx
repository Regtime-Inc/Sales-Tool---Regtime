import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Calculator, ChevronDown, ChevronRight, Play, RotateCcw, ToggleLeft, ToggleRight, Eye, EyeOff, Info, Plus, X, Layers, FileDown, PenLine } from 'lucide-react';
import { solve } from '../lib/optimizer/solver';
import { runSensitivity } from '../lib/optimizer/sensitivity';
import { estimateHardCost, estimateLandCost } from '../lib/optimizer/costEstimator';
import {
  getLocationEstimates,
  estimatesToRents,
  estimatesToUnitTypes,
  getBoroughName,
  inferOptimalUnitMix,
} from '../lib/marketRents';
import type { UnitMixRecommendation } from '../lib/marketRents';
import OptimizerResults from './OptimizerResults';
import ScenarioEditor from './ScenarioEditor';
import ScenarioComparison from './ScenarioComparison';
import { buildResultFromAllocations, buildResultFromUnitMix } from '../lib/optimizer/scenarioBuilder';
import type {
  OptimizerInputs,
  OptimizerResult,
  OptimizerScenario,
  ProgramConstraint,
  CostAssumptions,
  RentAssumption,
  UnitAllocation,
  UnitTypeConfig,
} from '../types/optimizer';
import {
  DEFAULT_UNIT_TYPES,
  DEFAULT_RENTS,
  DEFAULT_COSTS,
} from '../types/optimizer';
import type { FeasibilityResult } from '../types/feasibility';
import type { PlutoData, Metrics, SaleData } from '../types/analysis';
import type { UnitMixExtraction } from '../types/pdf';

interface OptimizerPanelProps {
  feasibility: FeasibilityResult;
  recentSale?: SaleData | null;
  metrics?: Metrics | null;
  pluto?: PlutoData | null;
  borough?: string;
  overrideContext?: string | null;
  extractedUnitMix?: UnitMixExtraction | null;
}

const ALL_UNIT_TYPES = ['Studio', '1BR', '2BR', '3BR'];

const STACKING_CONFLICTS: Record<string, string[]> = {
  '467-m': ['421-a', '485-x'],
  '485-x': ['421-a', '467-m'],
  '421-a': ['485-x', '467-m'],
};

const UAP_UNIT_MIN_SIZES: Record<string, number> = {
  Studio: 400,
  '1BR': 575,
  '2BR': 750,
  '3BR': 1000,
};

const UAP_BEDROOM_RULE = {
  min2BRPlusPct: 0.50,
  distribution: { Studio: 0.10, '1BR': 0.25, '2BR': 0.40, '3BR': 0.25 } as Record<string, number>,
};

function buildConstraints(
  feasibility: FeasibilityResult,
  selectedPrograms: Set<string>
): ProgramConstraint[] {
  const constraints: ProgramConstraint[] = [];
  const activeNames = Array.from(selectedPrograms);

  for (const prog of feasibility.programs) {
    if (prog.eligible === 'no' || prog.eligible === 'unknown') continue;
    if (!selectedPrograms.has(prog.program)) continue;
    if ((prog.options ?? []).length === 0) continue;

    const conflicts = STACKING_CONFLICTS[prog.program];
    if (conflicts && conflicts.some((c) => activeNames.some((a) => a.toLowerCase().includes(c.toLowerCase())))) {
      continue;
    }

    const best = prog.applicableOption ?? prog.options[0];
    const bands = (best.amiBands ?? []).map((b) => b.maxAmi);
    const minPctByBand: Record<number, number> = {};
    for (const b of (best.amiBands ?? [])) {
      minPctByBand[b.maxAmi] = b.minPctOfAffordable / 100;
    }

    const isUap = prog.program === 'UAP';
    const isMih = prog.program === 'MIH' || prog.program.startsWith('MIH');
    const is485x = prog.program.includes('485-x');
    const is467m = prog.program.includes('467-m');

    constraints.push({
      program: prog.program,
      minAffordablePct: best.affordableSetAsidePct / 100,
      amiBands: bands,
      minPctByBand,
      bedroomMix: isUap ? UAP_BEDROOM_RULE : undefined,
      requiresProportionalBedrooms: isMih || is485x,
      weightedAvgAmiMax: is467m ? 80 : undefined,
      unitMinSizes: isUap ? UAP_UNIT_MIN_SIZES : undefined,
      stackingConflicts: conflicts,
    });
  }

  return constraints;
}

function inferBorough(pluto: PlutoData): string {
  const z = (pluto.zonedist1 || '').toUpperCase();
  if (z.startsWith('M1-6') || z.startsWith('C5') || z.startsWith('C6') || z.startsWith('R10')) return '1';
  return '0';
}

interface UnitDerivation {
  total: number;
  source: string;
}

function deriveDefaultTotalUnits(
  capacity: FeasibilityResult['capacity'] | null,
  pluto: PlutoData | null | undefined,
  netSF: number
): UnitDerivation {
  const duFactor = capacity?.duFactor ?? 700;
  const capacityBased = netSF > 0 ? Math.floor(netSF / duFactor) : 0;

  if (capacity && (capacity.isVacant || capacity.buildableSlackSf > capacity.existingBldgArea)) {
    if (capacityBased > 0) return { total: capacityBased, source: 'From zoning capacity' };
  }

  if (pluto) {
    const fromPluto = pluto.unitstotal || pluto.unitsres;
    if (fromPluto > 0 && capacityBased > 0) {
      return capacityBased > fromPluto
        ? { total: capacityBased, source: 'From zoning capacity' }
        : { total: fromPluto, source: 'From PLUTO existing units' };
    }
    if (fromPluto > 0) return { total: fromPluto, source: 'From PLUTO existing units' };
  }

  if (capacityBased > 0) return { total: capacityBased, source: 'From zoning capacity' };
  return { total: 0, source: 'N/A' };
}

function getDefaultMarketRents(): Record<string, number> {
  const rents: Record<string, number> = {};
  for (const ut of ALL_UNIT_TYPES) {
    const entry = DEFAULT_RENTS.find((r) => r.unitType === ut && r.amiBand === 0);
    rents[ut] = entry?.monthlyRent ?? 2000;
  }
  return rents;
}

export default function OptimizerPanel({ feasibility, recentSale, metrics, pluto, borough, overrideContext, extractedUnitMix }: OptimizerPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [scenarios, setScenarios] = useState<OptimizerScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;
  const optimizedScenario = scenarios.find((s) => s.source === 'optimized');

  const baseNetSF = feasibility?.capacity?.maxResFa ?? 0;
  const optimizerHasRun = useRef(false);

  const eligiblePrograms = useMemo(
    () => (feasibility.programs ?? []).filter((p) => p.eligible !== 'no' && p.eligible !== 'unknown'),
    [feasibility.programs]
  );
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(() =>
    new Set(eligiblePrograms.map((p) => p.program))
  );

  useEffect(() => {
    setSelectedPrograms(new Set(eligiblePrograms.map((p) => p.program)));
  }, [eligiblePrograms]);

  const toggleProgram = (name: string) => {
    setSelectedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPrograms.size === eligiblePrograms.length) {
      setSelectedPrograms(new Set());
    } else {
      setSelectedPrograms(new Set(eligiblePrograms.map((p) => p.program)));
    }
  };

  const effectiveNetSF = useMemo(() => {
    if (selectedPrograms.has('UAP')) {
      const uapProg = feasibility.programs.find((p) => p.program === 'UAP');
      const uapOption = uapProg?.applicableOption;
      if (uapOption) {
        const bonusSF = Number(uapOption.details.totalResFaWithBonus) || 0;
        if (bonusSF > baseNetSF) return bonusSF;
      }
    }
    return baseNetSF;
  }, [selectedPrograms, feasibility.programs, baseNetSF]);

  const sfSource = effectiveNetSF > baseNetSF ? 'Incl. UAP bonus' : '';

  const [locationUnitTypes, setLocationUnitTypes] = useState<UnitTypeConfig[]>(DEFAULT_UNIT_TYPES);
  const [rentSource, setRentSource] = useState('Default');
  const [locationLoaded, setLocationLoaded] = useState(false);

  const unitMixRec = useMemo<UnitMixRecommendation>(
    () => inferOptimalUnitMix(
      borough,
      pluto?.zonedist1,
      pluto?.lotarea,
      pluto?.residfar,
      pluto?.numfloors,
      pluto?.unitsres,
    ),
    [borough, pluto],
  );

  const [visibleUnitTypes, setVisibleUnitTypes] = useState<Set<string>>(() => new Set(ALL_UNIT_TYPES));

  useEffect(() => {
    setVisibleUnitTypes(new Set(unitMixRec.recommended));
  }, [unitMixRec.recommended]);

  const toggleUnitType = (ut: string) => {
    setVisibleUnitTypes((prev) => {
      const next = new Set(prev);
      if (next.has(ut)) {
        if (next.size <= 1) return prev;
        next.delete(ut);
      } else {
        next.add(ut);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!borough || borough === '0') return;
    let cancelled = false;
    getLocationEstimates(borough).then(({ estimates, source }) => {
      if (cancelled) return;
      setMarketRents(estimatesToRents(estimates));
      setLocationUnitTypes(estimatesToUnitTypes(estimates));
      setRentSource(source);
      setLocationLoaded(true);
      setManualRents(false);
    });
    return () => { cancelled = true; };
  }, [borough]);

  const derivedCosts = useMemo(() => {
    const hardEst = pluto
      ? estimateHardCost({
          bldgClass: pluto.bldgclass,
          zoneDist: pluto.zonedist1,
          numFloors: pluto.numfloors,
          borough: inferBorough(pluto),
          yearBuilt: pluto.yearbuilt,
          landUse: pluto.landuse,
          lotArea: pluto.lotarea,
        })
      : null;

    const landEst = estimateLandCost(
      recentSale?.amount ?? null,
      feasibility?.capacity?.maxBuildableSf ?? null,
      metrics?.ppbsf ?? null,
    );

    return {
      hardCostPerSF: hardEst?.estimatedHardCostPerSF ?? DEFAULT_COSTS.hardCostPerSF,
      hardCostSource: hardEst
        ? `${hardEst.tier} -- $${hardEst.estimatedHardCostPerSF}/SF`
        : 'Default estimate',
      hardAdjustments: hardEst?.adjustments ?? [],
      landCostPerSF: landEst.landCostPerSF,
      landCostSource: landEst.source,
    };
  }, [pluto, recentSale, metrics, feasibility]);

  const [costs, setCosts] = useState<CostAssumptions>(() => ({
    hardCostPerSF: derivedCosts.hardCostPerSF,
    softCostPct: DEFAULT_COSTS.softCostPct,
    landCostPerSF: derivedCosts.landCostPerSF,
    hardCostSource: derivedCosts.hardCostSource,
    landCostSource: derivedCosts.landCostSource,
  }));

  const unitDerivation = useMemo(
    () => deriveDefaultTotalUnits(feasibility?.capacity ?? null, pluto, effectiveNetSF),
    [feasibility?.capacity, pluto, effectiveNetSF]
  );
  const defaultTotal = unitDerivation.total;
  const [totalUnits, setTotalUnits] = useState<number>(defaultTotal);
  const [manualUnits, setManualUnits] = useState(false);

  useEffect(() => {
    if (!manualUnits) setTotalUnits(defaultTotal);
  }, [defaultTotal, manualUnits]);

  const [marketRents, setMarketRents] = useState<Record<string, number>>(getDefaultMarketRents);
  const [manualRents, setManualRents] = useState(false);

  const [manualHard, setManualHard] = useState(false);
  const [manualLand, setManualLand] = useState(false);

  useEffect(() => {
    setCosts((prev) => ({
      ...prev,
      ...(!manualHard && {
        hardCostPerSF: derivedCosts.hardCostPerSF,
        hardCostSource: derivedCosts.hardCostSource,
      }),
      ...(!manualLand && {
        landCostPerSF: derivedCosts.landCostPerSF,
        landCostSource: derivedCosts.landCostSource,
      }),
    }));
  }, [derivedCosts, manualHard, manualLand]);
  const [showAdjustments, setShowAdjustments] = useState(false);

  const currentRentAssumptions = useMemo((): RentAssumption[] => {
    return DEFAULT_RENTS.map((r) => {
      if (r.amiBand === 0 && marketRents[r.unitType] !== undefined) {
        return { ...r, monthlyRent: marketRents[r.unitType] };
      }
      return r;
    });
  }, [marketRents]);

  const currentConstraints = useMemo(
    () => buildConstraints(feasibility, selectedPrograms),
    [feasibility, selectedPrograms],
  );

  const handleRun = useCallback(() => {
    const baseUnitTypes = locationLoaded ? locationUnitTypes : DEFAULT_UNIT_TYPES;
    const filteredUnitTypes = baseUnitTypes.filter((ut) => visibleUnitTypes.has(ut.type));

    const inputs: OptimizerInputs = {
      netResidentialSF: effectiveNetSF,
      totalUnits: totalUnits > 0 ? totalUnits : undefined,
      allowedUnitTypes: filteredUnitTypes.length > 0 ? filteredUnitTypes : baseUnitTypes,
      rentAssumptions: currentRentAssumptions,
      costAssumptions: costs,
      programConstraints: currentConstraints,
    };

    const base = solve(inputs);
    const sensitivity = runSensitivity(inputs, base);
    const result = { ...base, sensitivity };

    setScenarios((prev) => {
      const existing = prev.find((s) => s.source === 'optimized');
      if (existing) {
        return prev.map((s) => s.id === existing.id ? { ...s, result } : s);
      }
      const newScenario: OptimizerScenario = {
        id: crypto.randomUUID(),
        name: 'Optimized',
        source: 'optimized',
        result,
      };
      return [...prev, newScenario];
    });

    setScenarios((prev) => {
      const opt = prev.find((s) => s.source === 'optimized');
      if (opt) setActiveScenarioId(opt.id);
      return prev;
    });
    setEditingScenarioId(null);
    optimizerHasRun.current = true;
  }, [effectiveNetSF, totalUnits, locationLoaded, locationUnitTypes, visibleUnitTypes, currentRentAssumptions, costs, currentConstraints]);

  useEffect(() => {
    if (optimizerHasRun.current) {
      handleRun();
    }
  }, [effectiveNetSF, currentConstraints]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualEvaluate = useCallback((scenarioId: string, allocations: UnitAllocation[]) => {
    const result = buildResultFromAllocations(
      allocations,
      effectiveNetSF,
      currentRentAssumptions,
      costs,
      currentConstraints,
    );
    setScenarios((prev) =>
      prev.map((s) => s.id === scenarioId ? { ...s, result } : s),
    );
    setActiveScenarioId(scenarioId);
    setEditingScenarioId(null);
  }, [effectiveNetSF, currentRentAssumptions, costs, currentConstraints]);

  const handleImportFromPlans = useCallback(() => {
    if (!extractedUnitMix) return;
    const result = buildResultFromUnitMix(
      extractedUnitMix,
      effectiveNetSF,
      currentRentAssumptions,
      costs,
      currentConstraints,
    );
    const newScenario: OptimizerScenario = {
      id: crypto.randomUUID(),
      name: `From Plans`,
      source: 'imported',
      result,
    };
    setScenarios((prev) => [...prev, newScenario]);
    setActiveScenarioId(newScenario.id);
    setEditingScenarioId(null);
    setShowAddMenu(false);
  }, [extractedUnitMix, effectiveNetSF, currentRentAssumptions, costs, currentConstraints]);

  const addManualScenario = useCallback(() => {
    const count = scenarios.filter((s) => s.source === 'manual').length;
    const newScenario: OptimizerScenario = {
      id: crypto.randomUUID(),
      name: `Scenario ${count + 1}`,
      source: 'manual',
      result: null,
    };
    setScenarios((prev) => [...prev, newScenario]);
    setActiveScenarioId(newScenario.id);
    setEditingScenarioId(newScenario.id);
    setShowAddMenu(false);
  }, [scenarios]);

  const removeScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (activeScenarioId === id) {
      setActiveScenarioId((prev) => {
        const remaining = scenarios.filter((s) => s.id !== id);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
    }
    if (editingScenarioId === id) setEditingScenarioId(null);
  }, [activeScenarioId, editingScenarioId, scenarios]);

  const resetHard = () => {
    setCosts((prev) => ({ ...prev, hardCostPerSF: derivedCosts.hardCostPerSF }));
    setManualHard(false);
  };

  const resetLand = () => {
    setCosts((prev) => ({ ...prev, landCostPerSF: derivedCosts.landCostPerSF }));
    setManualLand(false);
  };

  const resetUnits = () => {
    setTotalUnits(defaultTotal);
    setManualUnits(false);
  };

  const resetRents = () => {
    if (locationLoaded && borough) {
      getLocationEstimates(borough).then(({ estimates }) => {
        setMarketRents(estimatesToRents(estimates));
      });
    } else {
      setMarketRents(getDefaultMarketRents());
    }
    setManualRents(false);
  };

  const unitSource = manualUnits ? 'Manual override' : unitDerivation.source;
  const boroughLabel = borough ? getBoroughName(borough) : '';

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
            <Calculator className="h-4 w-4 text-cyan-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">Unit-Mix Optimizer</p>
            <p className="text-[11px] text-slate-400">
              {overrideContext
                ? `Using: ${overrideContext}`
                : 'Heuristic solver: maximize ROI proxy subject to program constraints'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-50 pt-4 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Inputs
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Net Resid SF</span>
                <p className="font-semibold text-slate-700">{effectiveNetSF.toLocaleString()}</p>
                {(boroughLabel || sfSource) && (
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {[boroughLabel, sfSource].filter(Boolean).join(' / ')}
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 block">Total Units</label>
                  {manualUnits && (
                    <button onClick={resetUnits} className="text-cyan-600 hover:text-cyan-700" title="Reset to estimated value">
                      <RotateCcw className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={totalUnits}
                  onChange={(e) => {
                    setTotalUnits(Number(e.target.value));
                    setManualUnits(true);
                  }}
                  className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <p className="text-[9px] text-slate-400 mt-0.5">{unitSource}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-xs">Programs</span>
                  {eligiblePrograms.length > 1 && (
                    <button
                      onClick={toggleAll}
                      className="text-[9px] text-cyan-600 hover:text-cyan-700"
                    >
                      {selectedPrograms.size === eligiblePrograms.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                {eligiblePrograms.length === 0 ? (
                  <p className="text-slate-500 text-xs">None eligible</p>
                ) : (
                  <div className="space-y-1">
                    {eligiblePrograms.map((prog) => {
                      const isOn = selectedPrograms.has(prog.program);
                      const pct = (prog.applicableOption ?? prog.options[0])?.affordableSetAsidePct ?? 0;
                      return (
                        <button
                          key={prog.program}
                          onClick={() => toggleProgram(prog.program)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                            isOn
                              ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {isOn ? (
                              <ToggleRight className="h-3 w-3 text-cyan-600" />
                            ) : (
                              <ToggleLeft className="h-3 w-3 text-slate-400" />
                            )}
                            <span className={isOn ? 'font-medium' : ''}>{prog.program}</span>
                          </span>
                          <span className="text-[9px]">{pct > 0 ? `${pct}%` : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Est. Free Market Rents
                </p>
                {rentSource !== 'Default' && (
                  <p className="text-[9px] text-slate-400">{rentSource}</p>
                )}
              </div>
              {manualRents && (
                <button onClick={resetRents} className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 text-[9px]" title="Reset to location defaults">
                  <RotateCcw className="h-2.5 w-2.5" /> Reset
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {ALL_UNIT_TYPES.map((ut) => {
                const isVisible = visibleUnitTypes.has(ut);
                const isRecommended = unitMixRec.recommended.includes(ut);
                const pctLabel = Math.round((unitMixRec.weights[ut] || 0) * 100);
                return (
                  <button
                    key={ut}
                    onClick={() => toggleUnitType(ut)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors border ${
                      isVisible
                        ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                    title={isRecommended ? `Recommended (${pctLabel}% weight)` : `Optional (${pctLabel}% weight)`}
                  >
                    {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    <span className={isVisible ? 'font-medium' : ''}>{ut}</span>
                    {isRecommended && isVisible && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {unitMixRec.reasoning && (
              <div className="flex items-start gap-1.5 mb-2">
                <Info className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-slate-400 leading-relaxed">{unitMixRec.reasoning}</p>
              </div>
            )}

            <div className={`grid gap-3 text-xs`} style={{ gridTemplateColumns: `repeat(${Math.min(visibleUnitTypes.size, 4)}, minmax(0, 1fr))` }}>
              {ALL_UNIT_TYPES.filter((ut) => visibleUnitTypes.has(ut)).map((ut) => (
                <div key={ut}>
                  <label className="text-slate-400 block">{ut}</label>
                  <div className="relative mt-0.5">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input
                      type="number"
                      value={marketRents[ut]}
                      onChange={(e) => {
                        setMarketRents((prev) => ({ ...prev, [ut]: Number(e.target.value) }));
                        setManualRents(true);
                      }}
                      className="w-full pl-5 pr-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Cost Assumptions
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 block">Hard $/SF</label>
                  {manualHard && (
                    <button onClick={resetHard} className="text-cyan-600 hover:text-cyan-700" title="Reset to estimated value">
                      <RotateCcw className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={costs.hardCostPerSF}
                  onChange={(e) => {
                    setCosts({ ...costs, hardCostPerSF: Number(e.target.value) });
                    setManualHard(true);
                  }}
                  className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <p className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate" title={derivedCosts.hardCostSource}>
                  {derivedCosts.hardCostSource}
                </p>
                {derivedCosts.hardAdjustments.length > 0 && (
                  <button
                    onClick={() => setShowAdjustments(!showAdjustments)}
                    className="text-[9px] text-cyan-600 hover:text-cyan-700 mt-0.5"
                  >
                    {showAdjustments ? 'Hide' : 'Show'} adjustments ({derivedCosts.hardAdjustments.length})
                  </button>
                )}
                {showAdjustments && (
                  <ul className="mt-1 space-y-0.5">
                    {derivedCosts.hardAdjustments.map((a, i) => (
                      <li key={i} className="text-[9px] text-slate-500">{a}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 block">Land $/SF</label>
                  {manualLand && (
                    <button onClick={resetLand} className="text-cyan-600 hover:text-cyan-700" title="Reset to estimated value">
                      <RotateCcw className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={costs.landCostPerSF}
                  onChange={(e) => {
                    setCosts({ ...costs, landCostPerSF: Number(e.target.value) });
                    setManualLand(true);
                  }}
                  className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <p className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate" title={derivedCosts.landCostSource}>
                  {derivedCosts.landCostSource}
                </p>
              </div>
              <div>
                <label className="text-slate-400 block">Soft Cost %</label>
                <input
                  type="number"
                  value={Math.round(costs.softCostPct * 100)}
                  onChange={(e) => setCosts({ ...costs, softCostPct: Number(e.target.value) / 100 })}
                  className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <p className="text-[9px] text-slate-400 mt-0.5">% of hard cost</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              disabled={effectiveNetSF <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Run Optimizer
            </button>

            {scenarios.length < 3 && (
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Scenario
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showAddMenu && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
                    {extractedUnitMix && (
                      <button
                        onClick={handleImportFromPlans}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <FileDown className="h-3.5 w-3.5 text-teal-600" />
                        Import from Plans
                      </button>
                    )}
                    <button
                      onClick={addManualScenario}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <PenLine className="h-3.5 w-3.5 text-cyan-600" />
                      Enter Manually
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {scenarios.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 border-b border-slate-100 overflow-x-auto">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveScenarioId(s.id);
                      if (s.source === 'manual' && !s.result) setEditingScenarioId(s.id);
                      else setEditingScenarioId(null);
                    }}
                    className={`group flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeScenarioId === s.id
                        ? 'border-cyan-600 text-cyan-700'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    <span>{s.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      s.source === 'optimized' ? 'bg-cyan-50 text-cyan-600' :
                      s.source === 'imported' ? 'bg-teal-50 text-teal-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {s.source === 'optimized' ? 'Optimizer' : s.source === 'imported' ? 'Plans' : 'Manual'}
                    </span>
                    {s.result && (
                      <span className={`w-1.5 h-1.5 rounded-full ${s.result.feasible ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    )}
                    {s.source !== 'optimized' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeScenario(s.id); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 rounded transition-opacity"
                      >
                        <X className="h-2.5 w-2.5 text-slate-400 hover:text-red-500" />
                      </button>
                    )}
                  </button>
                ))}
              </div>

              {editingScenarioId && activeScenario?.source === 'manual' && (
                <ScenarioEditor
                  rentAssumptions={currentRentAssumptions}
                  onEvaluate={(allocs) => handleManualEvaluate(editingScenarioId, allocs)}
                  onImportFromPlans={extractedUnitMix ? handleImportFromPlans : undefined}
                  hasExtractedData={!!extractedUnitMix}
                />
              )}

              {activeScenario?.result && !editingScenarioId && (
                <OptimizerResults result={activeScenario.result} />
              )}

              {activeScenario?.source === 'manual' && activeScenario.result && !editingScenarioId && (
                <button
                  onClick={() => setEditingScenarioId(activeScenario.id)}
                  className="flex items-center gap-1.5 text-[10px] text-cyan-600 hover:text-cyan-700 font-medium transition-colors"
                >
                  <PenLine className="h-3 w-3" />
                  Edit Allocations
                </button>
              )}

              <ScenarioComparison scenarios={scenarios} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
