import React, { useState } from "react";
import {
  InterDrawCooccurrenceReport,
  InterDrawTargetPairCooccurrence,
  InterDrawCrossDyad,
  InterDrawBivariateTrigger
} from "../../services/interDrawPatternService";
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
  ChevronRight
} from "lucide-react";

interface InterDrawCooccurrenceViewProps {
  cooccurrences?: InterDrawCooccurrenceReport;
  targetDraw: string;
  predecessorName: string;
  predecessorNumbers: number[];
}

export const InterDrawCooccurrenceView: React.FC<InterDrawCooccurrenceViewProps> = ({
  cooccurrences,
  targetDraw,
  predecessorName,
  predecessorNumbers
}) => {
  const [dyadFilter, setDyadFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [bivariateFilter, setBivariateFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [selectedPair, setSelectedPair] = useState<InterDrawTargetPairCooccurrence | null>(null);

  if (!cooccurrences) {
    return (
      <div className="p-8 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-white/5">
        <p className="text-xs text-slate-400 italic">
          Données de cooccurrences en cours de calcul ou historique apparié insuffisant.
        </p>
      </div>
    );
  }

  const activePredSet = new Set(predecessorNumbers);
  const displayedDyads = dyadFilter === 'ACTIVE'
    ? cooccurrences.activeCrossDyads
    : cooccurrences.topCrossDyads;

  const displayedBivariates = bivariateFilter === 'ACTIVE'
    ? cooccurrences.activeBivariateTriggers
    : cooccurrences.bivariateTriggers;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* 1. EN-TÊTE MÉTHODOLOGIQUE & MÉTRIQUES CLÉS */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-indigo-500/20 dark:border-indigo-500/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
              <Sparkles size={13} className="animate-pulse" />
              Détecteur de Cooccurrences Multi-Ordres
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-1">
              Cooccurrences & Synergies Inter-Tirages
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Évaluation bayésienne continue des paires stimulées dans <strong className="text-slate-800 dark:text-slate-200">{targetDraw}</strong> sous le conditionnement du tirage précédent (<strong className="text-slate-800 dark:text-slate-200">{predecessorName}</strong>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Baseline Null 5/90</span>
              <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                {(cooccurrences.theoreticalPairProb * 100).toFixed(3)}%
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Tirages Appariés</span>
              <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">
                {cooccurrences.sampleSize} tirages
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
            Toutes les probabilités jointes ci-dessous sont conditionnées par ces 5 attracteurs réels.
          </span>
        </div>
      </div>

      {/* 2. PAIRES CIBLES CONDITIONNÉES PAR LE PRÉDÉCESSEUR */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              Top Paires Cibles Fortement Catalysées (C(5, 2) conditionnées)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Paires de numéros dans {targetDraw} dont l’apparition conjointe est statistiquement surreprésentée suite aux sorties de {predecessorName}.
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

                {/* Indicateurs statistiques continus */}
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

                {/* Sources d'excitation active */}
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

      {/* 3. DYADES CROISÉES INTER-TIRAGES (SOURCE -> CIBLE) */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Layers size={16} className="text-indigo-500" />
              Dyades Croisées Inter-Tirages (Numéro Source → Numéro Cible)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Corrélation bilatérale directe entre un numéro sorti au tirage $t-1$ et sa transition unitaire au tirage $t$.
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
              Actives ({cooccurrences.activeCrossDyads.length})
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
              Top Globales ({cooccurrences.topCrossDyads.length})
            </button>
          </div>
        </div>

        {displayedDyads.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            Aucune dyade active détectée pour les numéros actuels.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {displayedDyads.map((d, idx) => {
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

      {/* 4. DÉCLENCHEURS BIVARIÉS (PAIRE SOURCE -> CIBLE) */}
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
    </div>
  );
};
