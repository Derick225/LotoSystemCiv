import React, { useState, useMemo } from "react";
import type { ForensicReport, PredictionFeedback } from "../types";
import { logError } from "../utils/AppError";
import { deleteForensicReportLocal } from "../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../services/syncService";
import { updatePredictionFeedback } from "../services/predictionHistoryService";
import { isSupabaseConfigured } from "../services/supabaseClient";
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
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [userRating, setUserRating] = useState<
    PredictionFeedback["userRating"] | null
  >(null);
  const [userComment, setUserComment] = useState("");

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
      if (isSupabaseConfigured()) await deleteForensicReportCloud(report.id);
      showToast("Rapport supprimé", "success");
      onClose();
    } catch (error) {
      logError(error, { action: "delete_report_failed" });
      showToast("Erreur lors de la suppression", "error");
    }
  };

  const handleSubmitFeedback = async () => {
    if (!userRating) return;
    setSubmittingFeedback(true);
    try {
      audioEngine.play("success");
      const updatedFeedback: PredictionFeedback = {
        keyLearning: userComment || "Ajustement manuel",
        userRating,
        userComment,
      };

      await updatePredictionFeedback(
        report.predictionId || report.id,
        updatedFeedback,
      );
      await applyBayesianForensicFeedback(report.drawName, report, userRating);

      setFeedbackSent(true);
      showToast("Feedback RLHF intégré", "success");
    } catch (error) {
      logError(error, { action: "feedback_submission_failed" });
      showToast("Échec de l'intégration", "error");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const isHit = (n: number, type: "main" | "special") => {
    if (!Array.isArray(report.matches)) return false;
    return report.matches.some(
      (m) => m.predicted === n && m.errorType === "Hit",
    );
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
                    label: "Topologie",
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

              {/* RLHF Feedback */}
              <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-3">
                  Self-Learning (RLHF)
                </span>
                {feedbackSent ? (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-500/20 text-center text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ Feedback intégré à l'Oracle
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {[
                        {
                          id: "Visionnaire",
                          icon: <ThumbsUp size={12} />,
                          color:
                            "bg-emerald-500 border-emerald-500 text-emerald-600",
                        },
                        {
                          id: "Standard",
                          icon: <Meh size={12} />,
                          color: "bg-amber-500 border-amber-500 text-amber-600",
                        },
                        {
                          id: "Incohérente",
                          icon: <ThumbsDown size={12} />,
                          color: "bg-rose-500 border-rose-500 text-rose-600",
                        },
                      ].map((rate) => (
                        <button
                          key={rate.id}
                          onClick={() => {
                            audioEngine.play("click");
                            setUserRating(
                              rate.id as PredictionFeedback["userRating"],
                            );
                          }}
                          className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all border ${
                            userRating === rate.id
                              ? `${rate.color.split(" ")[0]} text-white border-transparent shadow-md`
                              : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {rate.icon} {rate.id}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userComment}
                        onChange={(e) => setUserComment(e.target.value)}
                        placeholder="Observation technique..."
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs outline-none"
                      />
                      <button
                        onClick={handleSubmitFeedback}
                        disabled={!userRating || submittingFeedback}
                        className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {submittingFeedback ? "..." : "Valider"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
