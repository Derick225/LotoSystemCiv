import React, { useState, useMemo } from "react";
import {
  InterDrawCooccurrenceReport,
  InterDrawTargetPairCooccurrence,
  InterDrawCrossDyad,
  InterDrawBivariateTrigger,
  InterDrawPatternReport
} from "../../services/interDrawPatternService";
import {
  BivariateDyadsReportHpc,
  InterDrawCrossDyadHpc
} from "../../services/wasm/lotoEngineBridge";
import { InterDrawPatternView } from "./InterDrawPatternView";
import { NumberBall } from "../NumberBall";
import { audioEngine } from "../../utils/audioEngine";
import {
  Zap,
  Layers,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Flame,
  Info,
  SlidersHorizontal,
  ChevronRight,
  Network,
  Grid,
  BarChart3,
  Search,
  Activity
} from "lucide-react";

interface InterDrawCooccurrenceViewProps {
  cooccurrences?: InterDrawCooccurrenceReport;
  patterns?: InterDrawPatternReport;
  bivariateHpcReport?: BivariateDyadsReportHpc;
  targetDraw: string;
  predecessorName: string;
  predecessorNumbers: number[];
}

export const InterDrawCooccurrenceView: React.FC<InterDrawCooccurrenceViewProps> = ({
  cooccurrences,
  patterns,
  bivariateHpcReport,
  targetDraw,
  predecessorName,
  predecessorNumbers
}) => {
  const [activeTab, setActiveTab] = useState<'DYADS' | 'MACHINE_DYADS' | 'MATRIX_90' | 'PATTERNS' | 'BIVARIATE'>('DYADS');
  const [dyadFilter, setDyadFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [bivariateFilter, setBivariateFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [selectedPair, setSelectedPair] = useState<InterDrawTargetPairCooccurrence | null>(null);
  
  // Pour la matrice de transition 90x90 Wasm
  const [selectedMatrixSource, setSelectedMatrixSource] = useState<number>(() => {
    return predecessorNumbers.length > 0 ? predecessorNumbers[0] : 1;
  });
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>("");

  if (!cooccurrences && !bivariateHpcReport) {
    return (
      <div className="p-8 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-white/5">
        <p className="text-xs text-slate-400 italic">
          Données de dyades et cooccurrences en cours de calcul ou historique apparié insuffisant.
        </p>
      </div>
    );
  }

  const activePredSet = useMemo(() => new Set(predecessorNumbers), [predecessorNumbers]);

  // Source des dyades : prioriser les dyades Wasm calculées en Rust Core si disponibles
  const wasmDyads: InterDrawCrossDyadHpc[] = bivariateHpcReport?.dyads || [];
  const hasWasmDyads = wasmDyads.length > 0;
  const wasmMachineDyads: InterDrawCrossDyadHpc[] = bivariateHpcReport?.machineDyads || [];
  const hasMachineDyads = wasmMachineDyads.length > 0;

  const displayedWasmDyads = useMemo(() => {
    if (!hasWasmDyads) return [];
    if (dyadFilter === 'ACTIVE') {
      return wasmDyads.filter(d => activePredSet.has(d.sourceNumber)).slice(0, 30);
    }
    return wasmDyads.slice(0, 40);
  }, [wasmDyads, hasWasmDyads, dyadFilter, activePredSet]);

  const displayedLegacyDyads = useMemo(() => {
    if (!cooccurrences) return [];
    return dyadFilter === 'ACTIVE'
      ? cooccurrences.activeCrossDyads
      : cooccurrences.topCrossDyads;
  }, [cooccurrences, dyadFilter]);

  const displayedBivariates = useMemo(() => {
    if (!cooccurrences) return [];
    return bivariateFilter === 'ACTIVE'
      ? cooccurrences.activeBivariateTriggers
      : cooccurrences.bivariateTriggers;
  }, [cooccurrences, bivariateFilter]);

  // Transitions pour la matrice 90x90 Wasm pour la ligne selectedMatrixSource
  const matrixTransitions = useMemo(() => {
    if (!bivariateHpcReport?.transitionMatrix || selectedMatrixSource < 1 || selectedMatrixSource > 90) {
      return [];
    }
    const matrix = bivariateHpcReport.transitionMatrix;
    const rowOffset = (selectedMatrixSource - 1) * 90;
    const results: { targetNumber: number; prob: number; lift: number }[] = [];
    const baseline = 5.0 / 90.0;

    for (let t = 1; t <= 90; t++) {
      const prob = matrix[rowOffset + (t - 1)] || 0;
      const lift = baseline > 0 ? prob / baseline : 1.0;
      results.push({
        targetNumber: t,
        prob: Math.round(prob * 1000) / 10,
        lift: Math.round(lift * 100) / 100
      });
    }

    let filtered = results;
    if (matrixSearchQuery.trim()) {
      const q = parseInt(matrixSearchQuery.trim(), 10);
      if (!isNaN(q) && q >= 1 && q <= 90) {
        filtered = filtered.filter(item => item.targetNumber === q);
      }
    }

    return filtered.sort((a, b) => b.prob - a.prob);
  }, [bivariateHpcReport, selectedMatrixSource, matrixSearchQuery]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* 1. EN-TÊTE MÉTHODOLOGIQUE & MÉTRIQUES CLÉS */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-indigo-500/20 dark:border-indigo-500/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
              <Sparkles size={13} className="animate-pulse" />
              Pilier 3 : Dyades Croisées & Invariants Statistiques
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-1">
              Dyades & Invariances Structurelles Inter-Tirages
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Corrélation bivariée $u128$ et invariants séquentiels pour <strong className="text-slate-800 dark:text-slate-200">{targetDraw}</strong> conditionné par <strong className="text-slate-800 dark:text-slate-200">{predecessorName}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Baseline Null 5/90</span>
              <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                {cooccurrences ? (cooccurrences.theoreticalPairProb * 100).toFixed(3) : "0.309"}%
              </span>
            </div>
            {bivariateHpcReport && (
              <div className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 text-right">
                <span className="text-[9px] uppercase font-bold text-indigo-500 block">Z-Score Moyen Réseau</span>
                <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                  {bivariateHpcReport.meanCouplingZ > 0 ? `+${bivariateHpcReport.meanCouplingZ}` : bivariateHpcReport.meanCouplingZ}
                </span>
              </div>
            )}
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Tirages Appariés</span>
              <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">
                {bivariateHpcReport?.totalPairedDraws || cooccurrences?.sampleSize || 0} cycles
              </span>
            </div>
          </div>
        </div>

        {/* Bannière d'état des numéros prédécesseurs actifs */}
        <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
              Vecteur Source ({predecessorName}) :
            </span>
            <div className="flex flex-wrap gap-1.5">
              {predecessorNumbers.map(n => (
                <NumberBall key={`coocc-pred-${n}`} number={n} size="xs" />
              ))}
            </div>
          </div>
          <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium">
            Probabilités conjointes et z-scores filtrés contre le bruit stochastique (AGENTS.md).
          </span>
        </div>
      </div>

      {/* SOUS-NAVIGATION INTERNE DU PILIER 3 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            audioEngine.play("click");
            setActiveTab('DYADS');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'DYADS'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Layers size={14} className={activeTab === 'DYADS' ? 'animate-pulse' : 'text-indigo-400'} />
          <span>Dyades Croisées & Paires</span>
          {hasWasmDyads && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono font-bold">
              WASM {wasmDyads.length}
            </span>
          )}
        </button>

        {hasMachineDyads && (
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveTab('MACHINE_DYADS');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'MACHINE_DYADS'
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30 scale-102"
                : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
            }`}
          >
            <Activity size={14} className={activeTab === 'MACHINE_DYADS' ? 'animate-pulse' : 'text-cyan-400'} />
            <span>Dyades Machine (HPC)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[9px] font-mono font-bold">
              {wasmMachineDyads.length}
            </span>
          </button>
        )}

        <button
          onClick={() => {
            audioEngine.play("click");
            setActiveTab('MATRIX_90');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'MATRIX_90'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Grid size={14} className={activeTab === 'MATRIX_90' ? 'animate-pulse' : 'text-sky-400'} />
          <span>Matrice Transition 90×90</span>
          <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[9px] font-mono font-bold">
            8100 Cellules
          </span>
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setActiveTab('PATTERNS');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'PATTERNS'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Network size={14} className={activeTab === 'PATTERNS' ? 'animate-pulse' : 'text-purple-400'} />
          <span>Invariants Structurels</span>
          <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-mono font-bold">
            5 Invariants
          </span>
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setActiveTab('BIVARIATE');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'BIVARIATE'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Flame size={14} className={activeTab === 'BIVARIATE' ? 'animate-pulse' : 'text-rose-400'} />
          <span>Déclencheurs Bivariés (Paires → Cible)</span>
          {cooccurrences && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[9px] font-mono font-bold">
              {cooccurrences.bivariateTriggers.length}
            </span>
          )}
        </button>
      </div>

      {/* SOUS-VUE 1 : DYADES CROISÉES & PAIRES */}
      {activeTab === 'DYADS' && (
        <div className="space-y-6">
          {/* PAIRES CIBLES CONDITIONNÉES */}
          {cooccurrences && (
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" />
                    Top Paires Cibles Fortement Catalysées (C(5, 2) conditionnées)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Paires de numéros dans {targetDraw} surreprésentées suite aux sorties de {predecessorName}.
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  Tri continu par Score Sigmoïde & Lift
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {cooccurrences.topConditionedPairs.map((p, idx) => {
                  const isSelected = selectedPair?.label === p.label;
                  const hasTriggers = p.triggerSources.length > 0;

                  return (
                    <div
                      key={`cond-pair-${p.label}`}
                      onClick={() => {
                        audioEngine.play("click");
                        setSelectedPair(isSelected ? null : p);
                      }}
                      className={`
                        p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3
                        ${isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-400 shadow-md ring-2 ring-indigo-500/20 scale-[1.01]"
                          : p.lift >= 2.0
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-slate-400">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <NumberBall number={p.pair[0]} size="sm" />
                            <span className="text-slate-400 font-black">+</span>
                            <NumberBall number={p.pair[1]} size="sm" />
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Score</span>
                          <span className="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">
                            {p.score}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2 bg-white/70 dark:bg-slate-900/50 rounded-xl border border-slate-200/50 dark:border-white/5 text-center">
                        <div>
                          <span className="text-[8px] uppercase text-slate-400 font-bold block">Lift</span>
                          <span className={`text-xs font-black font-mono ${p.lift >= 2.0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                            {p.lift}x
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase text-slate-400 font-bold block">PMI</span>
                          <span className="text-xs font-black font-mono text-indigo-500">
                            {p.pmi}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase text-slate-400 font-bold block">Z-Score</span>
                          <span className="text-xs font-black font-mono text-amber-500">
                            {p.zScore > 0 ? `+${p.zScore}` : p.zScore}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/50 dark:border-white/5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 font-medium">Déclencheurs :</span>
                          {hasTriggers ? (
                            p.triggerSources.map(tr => (
                              <span
                                key={`tr-badge-${p.label}-${tr}`}
                                className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 font-mono font-bold text-[9px]"
                              >
                                {tr < 10 ? `0${tr}` : tr}
                              </span>
                            ))
                          ) : (
                            <span className="italic text-slate-400 text-[9px]">Transversal</span>
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-slate-400">
                          {p.historicalOccurrences} occ.
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DYADES CROISÉES UNIFIÉES (AVEC RUST WASM EN PRIORITÉ) */}
          <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers size={16} className="text-indigo-500" />
                    Dyades Croisées Inter-Tirages (Source → Cible)
                  </h4>
                  {hasWasmDyads && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono font-bold uppercase">
                      Rust Wasm HPC
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Transitions directes avec z-scores continus certifiés $z = (O - E) / \sigma$.
                </p>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setDyadFilter('ACTIVE');
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                    dyadFilter === 'ACTIVE'
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Actives ({hasWasmDyads ? wasmDyads.filter(d => activePredSet.has(d.sourceNumber)).length : cooccurrences?.activeCrossDyads.length || 0})
                </button>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setDyadFilter('ALL');
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                    dyadFilter === 'ALL'
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  Top Globales ({hasWasmDyads ? wasmDyads.length : cooccurrences?.topCrossDyads.length || 0})
                </button>
              </div>
            </div>

            {/* Rendu Wasm si disponible */}
            {hasWasmDyads ? (
              displayedWasmDyads.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  Aucune dyade active détectée pour les numéros actuels.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {displayedWasmDyads.map((d, idx) => {
                    const isRepeat = d.sourceNumber === d.targetNumber;
                    const isActive = activePredSet.has(d.sourceNumber);

                    return (
                      <div
                        key={`dyad-wasm-${d.sourceNumber}-${d.targetNumber}`}
                        className={`
                          p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-2.5
                          ${isActive
                            ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500/40 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-white/5"
                          }
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">
                            #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black text-[8px] uppercase">
                                Active
                              </span>
                            )}
                            {isRepeat && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-black text-[8px] uppercase">
                                Report
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-2 py-1">
                          <div className="text-center">
                            <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Source</span>
                            <NumberBall number={d.sourceNumber} size="sm" />
                          </div>
                          <ArrowRight size={14} className="text-indigo-400 flex-shrink-0 mt-3" />
                          <div className="text-center">
                            <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Cible</span>
                            <NumberBall number={d.targetNumber} size="sm" />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 text-[10px] space-y-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Obs / Exp :</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                              {d.occurrences} / {d.expectedOccurrences}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Z-Score :</span>
                            <span className={`font-mono font-black ${d.zScore >= 2.0 ? 'text-emerald-500' : 'text-indigo-500'}`}>
                              {d.zScore > 0 ? `+${d.zScore}` : d.zScore}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Lift :</span>
                            <span className={`font-mono font-black ${d.lift >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-500'}`}>
                              {d.lift}x
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Certitude :</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {d.significanceScore}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Fallback Legacy */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {displayedLegacyDyads.map((d, idx) => {
                  const isRepeat = d.sourceNumber === d.targetNumber;

                  return (
                    <div
                      key={`dyad-${d.sourceNumber}-${d.targetNumber}`}
                      className={`
                        p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-2.5
                        ${d.isActiveInCurrentPred
                          ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500/40 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-white/5"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          #{idx + 1}
                        </span>
                        {d.isActiveInCurrentPred && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black text-[8px] uppercase">
                            Active
                          </span>
                        )}
                        {isRepeat && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-black text-[8px] uppercase">
                            Report
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-center gap-2 py-1">
                        <div className="text-center">
                          <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Source</span>
                          <NumberBall number={d.sourceNumber} size="sm" />
                        </div>
                        <ArrowRight size={14} className="text-indigo-400 flex-shrink-0 mt-3" />
                        <div className="text-center">
                          <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Cible</span>
                          <NumberBall number={d.targetNumber} size="sm" />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 text-[10px] space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-400">Probabilité :</span>
                          <span className="font-mono font-black text-slate-800 dark:text-slate-200">{d.probability}%</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-400">Lift :</span>
                          <span className={`font-mono font-black ${d.lift >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-500'}`}>
                            {d.lift}x
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-400">Jaccard :</span>
                          <span className="font-mono text-slate-500">{d.jaccard}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SOUS-VUE MACHINE DYADS */}
      {activeTab === 'MACHINE_DYADS' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-cyan-500/20 dark:border-cyan-500/10 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-cyan-400" />
                <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Dyades Croisées du Canal Machine (Machine → Gagnants)
                </h4>
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[9px] font-mono font-bold">
                  HPC Vectorisé
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Corrélations bivariées stochastiques mesurant le transfert des numéros Machine de {predecessorName} vers les gagnants de {targetDraw}.
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-mono font-bold">
              {wasmMachineDyads.length} dyades significatives
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {wasmMachineDyads.slice(0, 30).map((d, idx) => (
              <div
                key={`mach-dyad-${d.sourceNumber}-${d.targetNumber}`}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-cyan-500/30 flex flex-col justify-between gap-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 font-bold">#{idx + 1}</span>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[9px] font-bold">
                    z = +{d.zScore.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-2 py-1">
                  <div className="text-center">
                    <span className="text-[8px] font-black uppercase text-cyan-400 block mb-0.5">Machine</span>
                    <NumberBall number={d.sourceNumber} size="sm" />
                  </div>
                  <ArrowRight size={13} className="text-cyan-500 mt-2 shrink-0" />
                  <div className="text-center">
                    <span className="text-[8px] font-black uppercase text-amber-400 block mb-0.5">Gagnant</span>
                    <NumberBall number={d.targetNumber} size="sm" />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-white/5 text-[10px] space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400">Occurrences :</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {d.occurrences}x <span className="text-[9px] text-slate-400">(att. {d.expectedOccurrences.toFixed(1)})</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400">Sur-représentation :</span>
                    <span className="font-mono font-black text-cyan-400">
                      {d.lift}x
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SOUS-VUE 2 : MATRICE DE TRANSITION 90x90 WASM */}
      {activeTab === 'MATRIX_90' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Grid size={16} className="text-sky-500" />
                <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Matrice de Transition Bivariée 90×90 (P(t | s))
                </h4>
                <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 text-[9px] font-mono font-bold">
                  Wasm Core
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Distribution markovienne des probabilités de sortie du tirage cible pour chaque numéro source $s \in [1..90]$.
              </p>
            </div>

            {/* Raccourcis pour les 5 boules du tirage précédent */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Actifs :</span>
              {predecessorNumbers.map(n => (
                <button
                  key={`mat-btn-${n}`}
                  onClick={() => {
                    audioEngine.play("click");
                    setSelectedMatrixSource(n);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                    selectedMatrixSource === n
                      ? "bg-sky-600 text-white shadow-md ring-2 ring-sky-400"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  {n < 10 ? `0${n}` : n}
                </button>
              ))}
            </div>
          </div>

          {/* Sélecteur de numéro source et recherche */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <NumberBall number={selectedMatrixSource} size="md" />
              <div>
                <span className="text-xs font-black uppercase text-slate-900 dark:text-white block">
                  Numéro Source Sélectionné : #{selectedMatrixSource}
                </span>
                <span className="text-[10px] text-slate-500">
                  {predecessorNumbers.includes(selectedMatrixSource)
                    ? "★ Numéro présent dans le tirage précédent"
                    : "Numéro de référence du réseau"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-44">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={matrixSearchQuery}
                  onChange={(e) => setMatrixSearchQuery(e.target.value)}
                  placeholder="Cible 1-90..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <select
                value={selectedMatrixSource}
                onChange={(e) => {
                  audioEngine.play("click");
                  setSelectedMatrixSource(parseInt(e.target.value, 10));
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {Array.from({ length: 90 }, (_, i) => i + 1).map(num => (
                  <option key={`opt-src-${num}`} value={num}>
                    Source #{num < 10 ? `0${num}` : num}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grille de distribution conditionnelle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Top Destinations Projetées (sur 90) :
              </span>
              <span className="font-mono text-[10px]">
                Baseline théorique : 5.56% (Lift 1.0x)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
              {matrixTransitions.slice(0, 30).map((t, idx) => {
                const isRepeat = t.targetNumber === selectedMatrixSource;
                const isOverperforming = t.lift >= 1.5;

                return (
                  <div
                    key={`mat-cell-${selectedMatrixSource}-${t.targetNumber}`}
                    className={`
                      p-2.5 rounded-xl border flex flex-col justify-between transition-all
                      ${isOverperforming
                        ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/30"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-white/5"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-slate-400 font-bold">
                        #{idx + 1}
                      </span>
                      {isRepeat && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[8px] font-black uppercase">
                          Report
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 my-1">
                      <NumberBall number={t.targetNumber} size="xs" />
                      <div>
                        <span className="text-xs font-black font-mono text-slate-900 dark:text-white block">
                          {t.prob}%
                        </span>
                        <span className={`text-[9px] font-mono font-bold ${isOverperforming ? 'text-emerald-500' : 'text-slate-400'}`}>
                          Lift: {t.lift}x
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SOUS-VUE 3 : INVARIANTS STRUCTURELS (PATTERNS) */}
      {activeTab === 'PATTERNS' && (
        <InterDrawPatternView
          patterns={patterns}
          targetDraw={targetDraw}
          predecessorName={predecessorName}
          predecessorNumbers={predecessorNumbers}
        />
      )}

      {/* SOUS-VUE 4 : DÉCLENCHEURS BIVARIÉS */}
      {activeTab === 'BIVARIATE' && cooccurrences && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <Flame size={16} className="text-rose-500" />
                Déclencheurs Bivariés (Paire Source (p1, p2) → Numéro Cible)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Synergies d’ordre 2 : quand une paire spécifique sort ensemble au tirage précédent, quel numéro cible est activé ?
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setBivariateFilter('ACTIVE');
                }}
                className={`px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                  bivariateFilter === 'ACTIVE'
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Paires Actives ({cooccurrences.activeBivariateTriggers.length})
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setBivariateFilter('ALL');
                }}
                className={`px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                  bivariateFilter === 'ALL'
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Historique Global ({cooccurrences.bivariateTriggers.length})
              </button>
            </div>
          </div>

          {displayedBivariates.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              Aucun déclencheur bivarié actif observé dans l’historique pour les paires actuelles du prédécesseur.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayedBivariates.map((bt, idx) => (
                <div
                  key={`biv-${bt.sourcePair[0]}-${bt.sourcePair[1]}-${bt.targetNumber}`}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">#{idx + 1}</span>
                    {bt.isActiveInCurrentPred && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 font-black text-[8px] uppercase">
                        Paire Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <div className="flex items-center gap-1">
                      <NumberBall number={bt.sourcePair[0]} size="xs" />
                      <span className="text-slate-400 font-bold text-xs">+</span>
                      <NumberBall number={bt.sourcePair[1]} size="xs" />
                    </div>
                    <ArrowRight size={13} className="text-slate-400 flex-shrink-0" />
                    <NumberBall number={bt.targetNumber} size="sm" />
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 text-[10px] flex items-center justify-between">
                    <span className="text-slate-400">Lift :</span>
                    <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                      {bt.lift}x
                    </span>
                    <span className="text-slate-400 font-mono text-[9px]">
                      ({bt.occurrences}/{bt.pairOccurrences} fois)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
