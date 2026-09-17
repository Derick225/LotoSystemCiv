import React, { useState, useEffect, useCallback } from "react";
import { AlgoWeights, DrawResult } from "../../types";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Dna,
  Download,
  Fingerprint,
  Layers,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import {
  calculateDnaPerformanceDrift,
  type DnaPerformanceDriftReport,
  type NumberDnaAttribution,
} from "../../services/prediction/dnaAuditLogService";
import { NumberBall } from "../NumberBall";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { saveAlgoWeights } from "../../services/prediction/weightsManager";

interface DnaPerformanceDriftPanelProps {
  drawName: string;
  history: DrawResult[];
  activeWeights: AlgoWeights;
  onWeightsUpdated?: (newWeights: AlgoWeights) => void;
}

export const DnaPerformanceDriftPanel: React.FC<DnaPerformanceDriftPanelProps> = ({
  drawName,
  history,
  activeWeights,
  onWeightsUpdated,
}) => {
  const { showToast } = useToast();
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DnaPerformanceDriftReport | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [applyingFix, setApplyingFix] = useState(false);

  const runDriftEvaluation = useCallback(async () => {
    setLoading(true);
    try {
      const cleanHistory = purifyHistoryForDraw(drawName, history);
      const res = await calculateDnaPerformanceDrift(drawName, cleanHistory, activeWeights);
      setReport(res);
    } catch (err) {
      console.error("[DnaDriftPanel] Erreur d'évaluation:", err);
      showToast("Erreur lors du calcul de la dérive ADN", "error");
    } finally {
      setLoading(false);
    }
  }, [drawName, history, activeWeights, showToast]);

  useEffect(() => {
    runDriftEvaluation();
  }, [runDriftEvaluation]);

  const handleApplyAdjustments = async () => {
    if (!report || !Array.isArray(report.recommendedDnaAdjustments) || report.recommendedDnaAdjustments.length === 0) return;
    setApplyingFix(true);
    try {
      audioEngine.play("success");
      const updatedWeights: AlgoWeights = { ...activeWeights };
      (report.recommendedDnaAdjustments || []).forEach((adj) => {
        if (adj && adj.algoKey) {
          (updatedWeights as Record<string, number>)[adj.algoKey] = adj.recommendedWeight;
        }
      });

      const { applyOptimizedWeights } = await import("../../services/prediction/optimizationController");
      const optResult = await applyOptimizedWeights({
        drawName,
        weights: updatedWeights,
        origin: "HYPERPARAM_TUNER",
        performance: {
          score: Math.max(0, 100 - (report.overallDriftPercentage || 0)),
          relativeGain: report.overallDriftPercentage || 0,
          hitRate: report.hitRate,
          brierScore: report.brierScore,
        },
        causalAuditTrail: [
          `Compensation de dérive ADN appliquée sur ${drawName}`,
          `Dérive globale: ${(report.overallDriftPercentage || 0).toFixed(1)}%`,
          `Ajustements: ${report.recommendedDnaAdjustments.length} algorithmes recalibrés`,
        ],
        reason: `Régulation Dérive ADN (${(report.overallDriftPercentage || 0).toFixed(1)}%)`,
        history,
      });

      if (onWeightsUpdated) {
        onWeightsUpdated(optResult.appliedWeights);
      }
      showToast(
        optResult.wasDamped
          ? `Ajustements ADN appliqués avec amortissement continu de sécurité (Δ=${(optResult.driftDelta * 100).toFixed(1)}%).`
          : "Ajustements de calibration ADN appliqués avec succès !",
        optResult.wasDamped ? "warning" : "success"
      );
      runDriftEvaluation();
    } catch (err) {
      console.error("[DnaDriftPanel] Erreur d'application:", err);
      showToast("Échec de l'application des ajustements", "error");
    } finally {
      setApplyingFix(false);
    }
  };

  const filteredAlgorithms = (report?.algorithmDriftBreakdown || []).filter((algo) => {
    if (filterStatus === "all") return true;
    return algo.status === filterStatus;
  });

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* 1. Header & Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-xl relative overflow-hidden">
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
              <Activity size={12} className="animate-pulse" />
              Surveillance Post-Tirage
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase">
              Tirage Actif : {drawName}
            </span>
          </div>
          <h3 className="text-xl md:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            Dérive de Performance ADN (Neural Drift)
          </h3>
          <p className="text-xs text-slate-400 max-w-2xl">
            Mesure différentiable de l'écart entre le profil ADN injecté par le moteur neural et la
            réalité statistique observée lors des tirages réels.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10">
          <button
            onClick={() => {
              audioEngine.play("click");
              runDriftEvaluation();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Recalculer le Drift</span>
          </button>

          {report && report.recommendedDnaAdjustments.length > 0 && (
            <button
              onClick={handleApplyAdjustments}
              disabled={applyingFix}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={14} />
              <span>{applyingFix ? "Calibration..." : "Calibrer les Poids"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Métrique 1: Dérive Globale */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Drift Global Neural</span>
              <TrendingDown size={14} className="text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl md:text-3xl font-black font-mono ${
                  report.overallDriftPercentage < 20
                    ? "text-emerald-400"
                    : report.overallDriftPercentage < 40
                    ? "text-amber-400"
                    : "text-rose-400"
                }`}
              >
                {report.overallDriftPercentage}%
              </span>
              <span className="text-xs text-slate-500">dispersion</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${
                  report.overallDriftPercentage < 20
                    ? "bg-emerald-500"
                    : report.overallDriftPercentage < 40
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(100, report.overallDriftPercentage)}%` }}
              />
            </div>
          </div>

          {/* Métrique 2: KL Divergence */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Divergence de Kullback</span>
              <Cpu size={14} className="text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black font-mono text-purple-400">
                {report.klDivergence}
              </span>
              <span className="text-xs text-slate-500">nats</span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              Entropie relative du paysage tensoriel
            </p>
          </div>

          {/* Métrique 3: Brier Quadratic Score */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Brier Score (Erreur)</span>
              <Scale size={14} className="text-sky-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black font-mono text-sky-400">
                {report.brierScore}
              </span>
              <span className="text-xs text-slate-500">MSE</span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              Mesure d'erreur continue objective
            </p>
          </div>

          {/* Métrique 4: Taux d'Attribution Utile */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Échantillon Évalué</span>
              <Layers size={14} className="text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black font-mono text-emerald-400">
                {report.evaluatedDrawsCount}
              </span>
              <span className="text-xs text-slate-500">tirages passés</span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              Dernier tirage analysé : {report.lastDrawDate || "N/A"}
            </p>
          </div>
        </div>
      )}

      {/* 3. Attribution ADN des Numéros du Dernier Tirage */}
      {report && report.winningNumbersAttribution.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dna size={16} className="text-purple-400" />
              <h4 className="text-sm font-black uppercase tracking-wider text-white">
                ADN Rétrospectif des Numéros Gagnants (Dernier Tirage)
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Tirage du {report.lastDrawDate}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {report.winningNumbersAttribution.map((attr) => (
              <div
                key={attr.number}
                className="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl space-y-2 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <NumberBall number={attr.number} size="md" />
                  <span className="text-[9px] font-mono text-purple-400 font-bold bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-800/40">
                    Poids {attr.dominantWeight.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-white truncate">
                    {attr.dominantAlgoLabel}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {attr.causalCategory}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Table des Dérives Algorithmiques avec Filtres */}
      {report && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Sliders size={16} className="text-indigo-400" />
                Matrice de Dérive par Moteur Algorithmique
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Comparaison du poids injecté ($w_i$) et de l'utilité empirique réelle ($u_i$).
              </p>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: "all", label: "Tous" },
                { id: "DIVERGENT", label: "Divergents", color: "text-rose-400" },
                { id: "OVER_WEIGHTED", label: "Surpondérés", color: "text-amber-400" },
                { id: "UNDER_WEIGHTED", label: "Sous-pondérés", color: "text-sky-400" },
                { id: "OPTIMAL", label: "Optimaux", color: "text-emerald-400" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    filterStatus === f.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                  <th className="py-3 px-3">Algorithme</th>
                  <th className="py-3 px-3 text-right">Poids Injecté ($w$)</th>
                  <th className="py-3 px-3 text-right">Utilité Réelle ($u$)</th>
                  <th className="py-3 px-3 text-right">Écart ($\Delta$)</th>
                  <th className="py-3 px-3 text-center">Statut Dérive</th>
                  <th className="py-3 px-3 text-right">Hits Observés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredAlgorithms.map((algo) => {
                  const isDivergent = algo.status === "DIVERGENT";
                  const isOver = algo.status === "OVER_WEIGHTED";
                  const isUnder = algo.status === "UNDER_WEIGHTED";

                  return (
                    <tr
                      key={algo.algoKey}
                      className="hover:bg-slate-800/40 transition-colors duration-150"
                    >
                      <td className="py-3 px-3 font-sans font-bold text-white flex items-center gap-2">
                        <span>{algo.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({algo.algoKey})
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300">
                        {(algo.injectedWeight * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right text-indigo-400 font-bold">
                        {(algo.empiricalUtility * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`flex items-center justify-end gap-1 font-bold ${
                            algo.driftDelta > 0
                              ? "text-amber-400"
                              : algo.driftDelta < 0
                              ? "text-sky-400"
                              : "text-slate-400"
                          }`}
                        >
                          {algo.driftDelta > 0 ? (
                            <ArrowUpRight size={12} />
                          ) : (
                            <ArrowDownRight size={12} />
                          )}
                          {Math.abs(algo.driftDelta * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            isDivergent
                              ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                              : isOver
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : isUnder
                              ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {algo.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300 font-bold">
                        {algo.hitContributionCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Causal Conclusions & Adjustments */}
      {report && report.causalSummary.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <ShieldCheck size={18} />
            <h4 className="text-sm font-black uppercase tracking-wider text-white">
              Synthèse & Recommandations de Calibration Déterministe
            </h4>
          </div>

          <div className="space-y-2">
            {report.causalSummary.map((text, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-xs text-slate-300 flex items-start gap-2.5"
              >
                <span className="text-indigo-400 font-bold mt-0.5">•</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default DnaPerformanceDriftPanel;
