import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  executeClosedLoopAutopsy,
  ClosedLoopAutopsyReport,
} from "../services/prediction/closedLoopAutopsyService";
import { useToast } from "./ui/Toast";
import { audioEngine } from "../utils/audioEngine";
import {
  Zap,
  Cpu,
  Target,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Compass,
} from "lucide-react";

export const ClosedLoopAutopsyPanel: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);

  const [selectedDrawIndex, setSelectedDrawIndex] = useState<number>(0);
  const [report, setReport] = useState<ClosedLoopAutopsyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applied, setApplied] = useState<boolean>(false);

  // Filtrage strict par tirage (Tirage Isolation)
  const drawHistory = useMemo(() => {
    return history.filter(
      (d) =>
        d.drawName &&
        d.drawName.trim().toLowerCase() === drawName.trim().toLowerCase()
    );
  }, [drawName, history]);

  const runAutopsy = async (index: number) => {
    try {
      setLoading(true);
      setApplied(false);
      const res = await executeClosedLoopAutopsy(
        drawName,
        index,
        drawHistory.length > 0 ? drawHistory : history,
        globalWeights
      );
      setReport(res);
    } catch (e: any) {
      showToast(e.message || "Erreur lors de l'autopsie en boucle fermée", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAutopsy(selectedDrawIndex);
  }, [drawName, selectedDrawIndex, drawHistory.length]);

  const handleApplyCorrection = () => {
    if (!report) return;
    try {
      setIsApplying(true);
      audioEngine.play("click");
      setGlobalWeights(report.correctedWeights);
      setApplied(true);
      showToast("ADN Algorithmique recalibré par Boucle Fermée !", "success");
      audioEngine.play("success");
    } catch (e) {
      showToast("Erreur lors de l'application de la correction", "error");
    } finally {
      setIsApplying(false);
    }
  };

  if (drawHistory.length < 3) {
    return (
      <div className="p-8 bg-slate-900/60 rounded-3xl border border-white/5 text-center space-y-3 font-sans">
        <AlertCircle size={28} className="text-amber-400 mx-auto" />
        <h4 className="text-sm font-black text-white uppercase">
          Historique Insuffisant pour la Boucle Fermée ({drawHistory.length} tirages)
        </h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Ce module nécessite au moins 3 tirages enregistrés pour {drawName} afin d'effectuer l'autopsie rétrospective et le calcul du gradient d'erreur.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in font-sans">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/70 p-6 rounded-3xl border border-white/5 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Zap size={13} className="text-indigo-400 animate-pulse" />
            Closed-Loop Retrospective Autopsy & DNA Auto-Correction
          </div>
          <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">
            Autopsie Rétrospective en Boucle Fermée
          </h3>
          <p className="text-xs text-slate-400">
            Reconstitue la distribution de probabilité d'inférence face au tirage sélectionné et rétro-propage le gradient d'erreur ∇L(w).
          </p>
        </div>

        {/* SELECTEUR DU TIRAGE CIBLE */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-initial">
            <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">
              Tirage Cible Autopsié :
            </label>
            <select
              value={selectedDrawIndex}
              onChange={(e) => setSelectedDrawIndex(Number(e.target.value))}
              className="w-full md:w-56 px-3 py-2 bg-slate-950 text-white rounded-xl border border-white/10 text-xs font-mono font-bold focus:outline-none focus:border-indigo-500"
            >
              {drawHistory.slice(0, 30).map((d, idx) => (
                <option key={d.id || idx} value={idx}>
                  {d.date} - ({d.gagnants?.join(", ")})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runAutopsy(selectedDrawIndex)}
            disabled={loading}
            className="p-2.5 bg-slate-800 text-slate-300 hover:text-white rounded-xl mt-4 transition-all"
            title="Recalculer"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-indigo-400" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw className="animate-spin text-indigo-500 mx-auto" size={28} />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Calcul de la Divergence KL & Inversion du Gradient...
          </p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* NARRATIVE REMARQUE & ACTIONS */}
          <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-indigo-400 flex-shrink-0" />
                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                  Diagnostic Rétrospectif & Bilan
                </h4>
              </div>

              <button
                onClick={handleApplyCorrection}
                disabled={isApplying || applied}
                className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer ${
                  applied
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                {applied ? (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Correction Appliquée à l'ADN</span>
                  </>
                ) : (
                  <>
                    <Cpu size={15} />
                    <span>Recalibrer l'ADN par Boucle Fermée</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-indigo-100 leading-relaxed font-medium">
              {report.summaryRemark}
            </p>
          </div>

          {/* KPI CARDS (DIVERGENCE KL, BRIER SCORE, HITS) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Précision Calibration
              </span>
              <span className="text-2xl font-black font-mono text-emerald-400 block">
                {report.calibrationAccuracy}%
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Brier Score : {report.brierScore.toFixed(4)}
              </span>
            </div>

            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Divergence KL (D_KL)
              </span>
              <span className="text-2xl font-black font-mono text-indigo-400 block">
                {report.klDivergence.toFixed(3)}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Entropie Croisée : {report.crossEntropy.toFixed(2)}
              </span>
            </div>

            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Gagnants Capturés (Top 10)
              </span>
              <span className="text-2xl font-black font-mono text-cyan-400 block">
                {report.directHitsTop10.length} / 5
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Top 5 : {report.directHitsTop5.length} exacts ({report.directHitsTop5.join(", ") || "0"})
              </span>
            </div>

            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Taux d'Apprentissage η(t)
              </span>
              <span className="text-2xl font-black font-mono text-amber-400 block">
                {(report.learningRate * 100).toFixed(2)}%
              </span>
              <span className="text-[9px] text-slate-500 font-mono truncate block">
                {report.temporalDriftMetrics 
                  ? `Résistance Dérive: ${(report.temporalDriftMetrics.driftResistanceFactor * 100).toFixed(1)}%` 
                  : "Dérive Temporelle"}
              </span>
            </div>
          </div>

          {/* DYNAMIC CYCLIC PHASE & TEMPORAL DRIFT DIAGNOSTIC */}
          {report.cyclicPhaseProfile && (
            <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Compass size={16} className="text-indigo-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">
                    Matrice de Confiance Cyclique & Exposant de Lyapunov
                  </h4>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  report.cyclicPhaseProfile.phase === 'PERIODIC_ATTRACTOR'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : report.cyclicPhaseProfile.phase === 'STOCHASTIC_DISPERSION'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                }`}>
                  {report.cyclicPhaseProfile.phaseLabel}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {report.cyclicPhaseProfile.narrativeInterpretation}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-1">Résonance Attracteurs</span>
                  <span className="text-base font-black font-mono text-emerald-400">
                    {(report.cyclicPhaseProfile.macroFamilyWeights.attractorResonance * 100).toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                    Spectres, Fractales, Momentum
                  </span>
                </div>

                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-1">Diffusion Stochastique</span>
                  <span className="text-base font-black font-mono text-cyan-400">
                    {(report.cyclicPhaseProfile.macroFamilyWeights.stochasticDiffusion * 100).toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                    Cadence d'écarts, Markov, Bayes
                  </span>
                </div>

                <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-1">Affinité Topologique</span>
                  <span className="text-base font-black font-mono text-indigo-400">
                    {(report.cyclicPhaseProfile.macroFamilyWeights.topologicalAffinity * 100).toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                    Réseau, Voisins, Transfert
                  </span>
                </div>
              </div>

              {report.temporalDriftMetrics && (
                <div className="p-3.5 bg-indigo-950/30 rounded-xl border border-indigo-500/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" />
                    <span className="text-indigo-200 text-[11px] font-bold">Calibration η(t) = η0 / (1 + λ · D_KL) :</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-400 flex-wrap">
                    <span>D_KL(P||Q) : <strong className="text-white">{report.temporalDriftMetrics.klDivergence.toFixed(4)}</strong></span>
                    <span>Var(Entropie H) : <strong className="text-white">{report.temporalDriftMetrics.entropyVariance.toFixed(5)}</strong></span>
                    <span>Amortissement λ : <strong className="text-white">{report.temporalDriftMetrics.lambda.toFixed(3)}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMPARAISON NUMÉROS SORTIS VS TOP PRÉDITS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Target size={15} className="text-emerald-400" />
                Numéros Gagnants Réels vs Prédiction Reconstituée
              </h4>

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                    Gagnants Réels du {report.targetDrawDate} :
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {report.actualWinners.map((w) => {
                      const isTop5 = report.top5Predicted.includes(w);
                      const isTop10 = report.top10Predicted.includes(w);
                      return (
                        <span
                          key={w}
                          className={`w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center border shadow-md ${
                            isTop5
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-2 ring-emerald-500/30"
                              : isTop10
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {w}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                    Top 5 Prédit :
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {report.top5Predicted.map((p) => {
                      const isWinner = report.actualWinners.includes(p);
                      return (
                        <span
                          key={p}
                          className={`w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center border ${
                            isWinner
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-slate-950 text-slate-400 border-white/5"
                          }`}
                        >
                          {p}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {report.actualMachine.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                      Plateau Machine Sortant :
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {report.actualMachine.map((m) => (
                        <span
                          key={m}
                          className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 font-mono font-bold text-xs flex items-center justify-center border border-cyan-500/20"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FRÔLEMENTS & NEAR-MISSES */}
            <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Compass size={15} className="text-indigo-400" />
                Détection des Near-Misses & Frôlements Spatiaux
              </h4>

              {report.nearMisses.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-6 text-center">
                  Aucun frôlement immédiat (+/-1, +/-2 ou miroir) détecté sur ce tirage.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {report.nearMisses.map((nm, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950/60 rounded-xl border border-white/5 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 font-black flex items-center justify-center text-xs">
                          {nm.actualWinner}
                        </span>
                        <ArrowRight size={12} className="text-slate-500" />
                        <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-black flex items-center justify-center text-xs">
                          {nm.closestPredicted}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          {nm.description}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px] font-bold">
                        $\Delta = {nm.distance}$
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* GRADIENTS PAR ALGORITHME & PROPOSITION DE RECALIBRAGE */}
          <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Sliders size={15} className="text-cyan-400" />
                Gradient d'Attribution & Proposition de Poids (∇L(w))
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                Normalisation continue sur le simplexe ∑ w = 1
              </span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
              {report.algoGradients.map((g) => {
                const isPositiveDelta = g.deltaPercent > 0;
                return (
                  <div
                    key={g.key}
                    className="p-3 bg-slate-950/60 rounded-xl border border-white/5 flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-slate-200 font-bold block truncate">
                        {g.label}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
                        <span>Attribution Gagnants : {(g.attributionToWinners * 100).toFixed(1)}%</span>
                        <span>Gradient : {g.gradient.toFixed(3)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">
                          Actuel : {(g.currentWeight * 100).toFixed(1)}%
                        </span>
                        <span className="text-white font-black">
                          Proposé : {(g.recommendedWeight * 100).toFixed(1)}%
                        </span>
                      </div>

                      <span
                        className={`px-2 py-1 rounded text-[10px] font-black min-w-[55px] text-center ${
                          isPositiveDelta
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {isPositiveDelta ? "+" : ""}
                        {g.deltaPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
