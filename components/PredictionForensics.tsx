import React, { useState, useMemo } from "react";
import type { ForensicReport, PredictionFeedback } from "../types";
import { logError } from "../utils/AppError";
import { deleteForensicReportLocal } from "../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../services/syncService";
import { updatePredictionFeedback } from "../services/predictionHistoryService";
import { isFirebaseConfigured } from "../services/firebaseClient";
import { useToast } from "./ui/Toast";
import { applyBayesianForensicFeedback } from "../services/prediction/weightsManager";
import { audioEngine } from "../utils/audioEngine";
import {
  ThumbsUp,
  ThumbsDown,
  Meh,
  X as XIcon,
  Trash2,
  Cpu,
  Target,
  Brain,
} from "lucide-react";

interface PredictionForensicsProps {
  report: ForensicReport;
  onClose: () => void;
}

export const PredictionForensics: React.FC<PredictionForensicsProps> = ({
  report,
  onClose,
}) => {
  const { showToast } = useToast();
  const handleDeleteReport = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce rapport forensique ?",
      )
    )
      return;
    try {
      audioEngine.play("success");
      await deleteForensicReportLocal(report.id);
      if (isFirebaseConfigured()) await deleteForensicReportCloud(report.id);
      showToast("Rapport supprimé", "success");
      onClose();
    } catch (error) {
      logError(error, { action: "delete_report_failed" });
      showToast("Erreur lors de la suppression", "error");
    }
  };

  const isHit = (n: number, type: "main" | "special") => {
    if (!Array.isArray(report.matches)) return false;
    return report.matches.some(
      (m) => m.predicted === n && m.errorType === "Hit",
    );
  };

  const handleFeedback = async (rating: "positive" | "neutral" | "negative") => {
    if (!report.predictionId) {
      showToast("ID de prédiction manquant", "error");
      return;
    }

    const userRating: "Visionnaire" | "Standard" | "Incohérente" = 
      rating === "positive" ? "Visionnaire" : 
      rating === "neutral" ? "Standard" : 
      "Incohérente";

    try {
      audioEngine.play("click");
      await updatePredictionFeedback(report.predictionId, {
        userRating,
        keyLearning: "Ajustement suite à l'autopsie forensique",
        userComment: ""
      });
      await applyBayesianForensicFeedback(report.drawName, report, userRating);
      showToast("Retour enregistré, poids ajustés (RLHF)", "success");
    } catch (e) {
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col my-auto max-h-[90vh]">
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 rounded-t-3xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Brain size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                Autopsie Forensique
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                {report.drawName} • {new Date(report.date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteReport}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
              title="Supprimer l'autopsie"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT COLUMN: Results & Analysis */}
            <div className="space-y-6">
              {/* Combinations distinctes */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
                  <Target size={12} /> Bilan du Tirage
                </h3>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase block mb-2">
                      Main Numbers
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {report.combo?.map((n) => (
                        <div
                          key={n}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                            isHit(n, "main")
                              ? "bg-emerald-500 text-white border-transparent"
                              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyse Causale supprimée */}
            </div>

            {/* RIGHT COLUMN: Metrics & RLHF */}
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "RMSE", val: report.rmse?.toFixed(2) ?? "N/A" },
                  {
                    label: "Brier Score",
                    val: report.brier_score?.toFixed(4) ?? "N/A",
                  },
                  {
                    label: "Divergence KL",
                    val: report.kl_divergence?.toFixed(4) ?? "N/A",
                  },
                  {
                    label: "Wasserstein",
                    val: report.wassersteinLoss?.toFixed(4) ?? "N/A",
                  },
                  {
                    label: "Entropie Shannon",
                    val: report.shannon_entropy?.toFixed(2) ?? "N/A",
                  },
                  {
                    label: "Topologie (Loss)",
                    val: report.continuousTopologicalLoss?.toFixed(4) ?? "N/A",
                  },
                ].map((m, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col"
                  >
                    <span className="text-[9px] font-black uppercase text-slate-400">
                      {m.label}
                    </span>
                    <span className="text-sm font-black text-slate-800 dark:text-white font-mono mt-1">
                      {m.val}
                    </span>
                  </div>
                ))}
              </div>

              {/* Counterfactuals */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-3">
                  <Cpu size={14} className="text-indigo-500" />
                  Optimisation Contre-Factuelle
                </h4>
                {report.counterfactuals && report.counterfactuals.length > 0 ? (
                  <div className="space-y-2">
                    {report.counterfactuals.slice(0, 3).map((cf, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center justify-between text-[10px] font-mono"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">
                          {cf.algo.replace(/_/g, " ")}
                        </span>
                        <div className="flex gap-2 items-center">
                          <span className="text-slate-500">
                            {(cf.originalWeight * 100).toFixed(0)}% →{" "}
                            {(cf.optimalWeight * 100).toFixed(0)}%
                          </span>
                          <span className="text-indigo-500 font-bold">
                            +{cf.improvement.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">
                    Aucun contre-factuel disponible.
                  </p>
                )}
              </div>

              {/* RLHF Section */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-500/30 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-3">
                  <Brain size={14} className="text-indigo-500" />
                  RLHF (Reinforcement Learning from Human Feedback)
                </h4>
                <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                  Évaluez la qualité de cette prédiction. Vos retours ajusteront
                  directement les poids algorithmiques via le moteur de
                  Bayes-Markov pour les prochains tirages.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleFeedback("positive")}
                    className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                  >
                    <ThumbsUp size={16} />
                    <span className="text-[9px] font-bold uppercase">Succès</span>
                  </button>
                  <button
                    onClick={() => handleFeedback("neutral")}
                    className="p-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                  >
                    <Meh size={16} />
                    <span className="text-[9px] font-bold uppercase">Passable</span>
                  </button>
                  <button
                    onClick={() => handleFeedback("negative")}
                    className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                  >
                    <ThumbsDown size={16} />
                    <span className="text-[9px] font-bold uppercase">Échec</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
