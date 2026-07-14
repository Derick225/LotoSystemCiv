import React, { useState, useMemo } from "react";
import type {
  ForensicReport,
  ForensicEvidence,
  PredictionFeedback,
} from "../types";
import { logError } from "../utils/AppError";
import { NumberBall } from "./NumberBall";
import { deleteForensicReportLocal } from "../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../services/syncService";
import { updatePredictionFeedback } from "../services/predictionHistoryService";
import { isSupabaseConfigured } from "../services/supabaseClient";
import { useToast } from "./ui/Toast";
import { useNexusStore } from "../store/useNexusStore";
import { applyBayesianForensicFeedback } from "../services/prediction/weightsManager";
import { Forensic3DRadar } from "./Forensic3DRadar";
import { audioEngine } from "../utils/audioEngine";
import {
  ThumbsUp,
  ThumbsDown,
  Meh,
  CheckCircle2,
  X as XIcon,
  ScanLine,
  GitMerge,
  Activity,
  LayoutGrid,
  Trash2,
  Cpu,
  Sparkles,
  Waves,
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
  const globalWeights = useNexusStore((state) => state.globalWeights);

  const [activeTab, setActiveTab] = useState<
    "visuel" | "physique" | "analytique" | "cognitif"
  >("visuel");

  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [userRating, setUserRating] = useState<
    PredictionFeedback["userRating"] | null
  >(null);
  const [userComment, setUserComment] = useState("");

  const handleDeleteReport = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce rapport forensique ?"
      )
    ) {
      return;
    }
    try {
      audioEngine.play("success");
      await deleteForensicReportLocal(report.id);
      if (isSupabaseConfigured()) {
        await deleteForensicReportCloud(report.id);
      }
      showToast("Rapport supprimé avec succès", "success");
      onClose();
    } catch (error) {
      logError(error, { action: "delete_report_failed" });
      showToast("Erreur lors de la suppression du rapport", "error");
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
      
      await updatePredictionFeedback(report.predictionId || report.id, updatedFeedback);
      
      await applyBayesianForensicFeedback(report.drawName, report, userRating);
      
      setFeedbackSent(true);
      showToast("Feedback RLHF enregistré et intégré au modèle continu !", "success");
    } catch (error) {
      logError(error, { action: "feedback_submission_failed" });
      showToast("Échec de l'intégration du feedback", "error");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const spatialGridData = useMemo(() => {
    const predicted = new Set<number>();
    const actualSet = new Set<number>();
    const misses = new Set<number>();

    if (Array.isArray(report.matches)) {
      report.matches.forEach((m) => {
        if (m.predicted) predicted.add(m.predicted);
        if (m.errorType === "Hit" && m.actual) actualSet.add(m.actual);
      });
    }

    if (report.missedOpportunities) {
      report.missedOpportunities.forEach((m) => {
        actualSet.add(m.number);
        misses.add(m.number);
      });
    }

    const grid = [];
    for (let i = 1; i <= 90; i++) {
      grid.push({
        num: i,
        isPredicted: predicted.has(i),
        isActual: actualSet.has(i),
        isMissed: misses.has(i),
      });
    }
    return grid;
  }, [report]);

  const getBadgeColor = (type: ForensicEvidence["errorType"]) => {
    switch (type) {
      case "Hit":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700";
      case "Voisin":
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700";
      case "Miroir":
        return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700";
      case "Shadow":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-950 w-full max-w-6xl h-[90vh] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header Section */}
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-black uppercase text-indigo-500 tracking-widest block">
              POST-MORTEM & AUDIT TECHNIQUE
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Rapport #{(report.predictionId || report.id).slice(0, 8)}
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                  {report.drawName}
                </span>
                {report.matches && (
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 px-2.5 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1">
                    <CheckCircle2 size={12} />{" "}
                    {report.matches.filter((m) => m.errorType === "Hit").length} Hits
                  </span>
                )}
                {report.matches && report.matches.some((m) => m.errorType === "Voisin") && (
                  <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1">
                    <GitMerge size={12} />{" "}
                    {report.matches.filter((m) => m.errorType === "Voisin").length} Voisins
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Unified 4-Tab Navigation */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl max-w-full gap-1.5 justify-center">
            {[
              { id: "visuel", label: "Audit Visuel", color: "text-fuchsia-500 dark:text-fuchsia-400" },
              { id: "physique", label: "Dynamiques Physiques", color: "text-indigo-600 dark:text-indigo-400" },
              { id: "analytique", label: "Rigueur Mathématique", color: "text-emerald-600 dark:text-emerald-400" },
              { id: "cognitif", label: "Intelligence IA & Feedback", color: "text-purple-600 dark:text-purple-400" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  audioEngine.play("click");
                  setActiveTab(tab.id as any);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 text-center ${
                  activeTab === tab.id
                    ? `bg-white dark:bg-slate-800 shadow-md ${tab.color}`
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteReport();
              }}
              title="Supprimer définitivement ce rapport"
              className="p-3 bg-white dark:bg-slate-800 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 text-slate-400 transition shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                onClose();
              }}
              className="p-3 bg-white dark:bg-slate-800 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 transition shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <XIcon size={20} />
            </button>
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-10 bg-slate-50/50 dark:bg-slate-900/50">
          {activeTab === "visuel" && (
            <div className="animate-slide-up space-y-6">
              {/* Grid with 3D Radar and Spatial Grid side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2">
                      <Waves size={14} className="text-fuchsia-500 animate-pulse" />
                      Attracteur Chaotique 3D & Orbites Probabilistes
                    </h4>
                  </div>
                  <div className="h-[360px] w-full">
                    <Forensic3DRadar report={report} globalWeights={globalWeights} />
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2 mb-4">
                      <LayoutGrid size={14} className="text-amber-500" />
                      Cartographie Spatiale des Impacts (90 Grille)
                    </h4>
                    <div className="grid grid-cols-10 gap-1 relative">
                      {spatialGridData.map((cell) => {
                        let bgClass = "bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-600";
                        if (cell.isPredicted && cell.isActual) {
                          bgClass = "bg-emerald-500 text-white font-black shadow-md border border-emerald-300";
                        } else if (cell.isPredicted && !cell.isActual) {
                          bgClass = "bg-indigo-500 text-white font-bold opacity-80 border border-indigo-400";
                        } else if (!cell.isPredicted && cell.isMissed) {
                          bgClass = "bg-rose-500 text-white font-black border border-rose-400";
                        }
                        return (
                          <div key={cell.num} className={`aspect-square rounded flex items-center justify-center text-[9px] font-mono transition-all duration-300 ${bgClass}`}>
                            {cell.num}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-center gap-3 mt-4 text-[9px] uppercase font-bold text-slate-500 bg-slate-50 dark:bg-black/20 p-2 rounded-xl">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm"></span> Hit</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500 rounded-sm"></span> Prédite</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded-sm"></span> Manquée</span>
                  </div>
                </div>
              </div>

              {/* Spectral deviations & Rene Thom Topological Tension side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
                  <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2 mb-3">
                    <Waves size={14} className="text-cyan-500" />
                    Divergence de Spectre d'Énergie Spectrale
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4 leading-normal">
                    Quantification du delta énergétique entre les probabilités de la transformée de Fourier (DFT) et le tirage.
                  </p>
                  {report.spectralDeviations && report.spectralDeviations.length > 0 ? (
                    <div className="grid gap-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                      {report.spectralDeviations.slice(0, 10).map((spec, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-lg text-[10px] font-mono">
                          <div className="flex items-center gap-2">
                            <NumberBall number={spec.number} size="xs" />
                            <span className="font-bold text-slate-700 dark:text-slate-300">N° {spec.number}</span>
                          </div>
                          <div className="flex gap-4 text-[10px]">
                            <span>P: {spec.predictedEnergy.toFixed(1)}</span>
                            <span className={spec.actualEnergy > 0 ? "text-emerald-500 font-bold" : "text-slate-400"}>R: {spec.actualEnergy.toFixed(0)}</span>
                            <span className={`font-black ${Math.abs(spec.delta) > 40 ? "text-rose-500" : "text-indigo-500"}`}>
                              Δ {spec.delta > 0 ? "+" : ""}{spec.delta.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Aucune déviation spectrale disponible.</p>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2 mb-3">
                      <Activity size={14} className="text-rose-500" />
                      Tension Topologique de Rupture
                    </h4>
                    <p className="text-[11px] text-slate-500 mb-4 leading-normal">
                      Analyse continue sous le modèle d'une fronce de René Thom (Théorie des Catastrophes) de la dispersion sur la grille.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                    <div className="relative w-12 h-12 flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <circle className="text-slate-200 dark:text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
                        <circle className="text-indigo-500 transition-all duration-1000" strokeDasharray={`${report.topologicalTensionIndex ?? 25}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-800 dark:text-white">
                        {report.topologicalTensionIndex ?? 25}%
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Tension de phase</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {(report.topologicalTensionIndex ?? 25) > 55 ? "Instabilité de cohorte" : "Régime stabilisé"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "physique" && (
            <div className="animate-slide-up space-y-6">
              {/* Kinetic trajectory and drift */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
                <h4 className="font-black text-slate-800 dark:text-white mb-4 uppercase text-xs tracking-wider flex items-center gap-2">
                  <ScanLine size={14} className="text-indigo-500" />
                  Trajectoire Vectorielle & Balistique des Tirages
                </h4>
                <div className="flex flex-col md:flex-row justify-around items-center gap-6 bg-slate-50 dark:bg-black/20 p-5 rounded-2xl border border-slate-100 dark:border-white/5">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[9px] font-black text-indigo-500 uppercase bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded">Prédiction IA</span>
                    <div className="flex gap-1.5">{Array.isArray(report.matches) && report.matches.map((m, i) => <NumberBall key={i} number={m.predicted} size="sm" glow={m.errorType === "Hit"} />)}</div>
                  </div>
                  <div className="text-center text-[10px] font-mono text-slate-400">
                    <span className="block font-black text-emerald-500">{Array.isArray(report.matches) ? report.matches.filter(m => m.errorType === "Hit").length : 0} Hits</span>
                    <span>Vitesse : {(report as any).gravitationalDriftVelocity !== undefined ? `${(report as any).gravitationalDriftVelocity.toFixed(3)} rad/s` : "0.345 rad/s"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[9px] font-black text-emerald-500 uppercase bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded">Tirage Réel</span>
                    <div className="flex gap-1.5">{report.combo?.map((num, i) => <NumberBall key={i} number={num} size="sm" glow={Array.isArray(report.matches) && report.matches.some(m => m.predicted === num && m.errorType === "Hit")} />)}</div>
                  </div>
                </div>

                {Array.isArray(report.matches) && report.matches.some(m => m.errorType !== "Hit") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                    {report.matches.filter(m => m.errorType !== "Hit").map((m, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between text-[10px] font-mono">
                        <span>Prédit: <strong>{m.predicted}</strong> → Réel: <strong>{m.actual || "N/A"}</strong></span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getBadgeColor(m.errorType)}`}>{m.errorType} ({m.delta})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* XAP oracular genome */}
              <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2">
                    <Cpu size={14} className="text-blue-500" />
                    Génome Oraculaire (DNA Explanations - XAP)
                  </h4>
                  {report.consensusStrength !== undefined && <span className="text-[9px] font-mono bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 px-1.5 py-0.5 border border-indigo-100 dark:border-indigo-800 rounded">Consensus: {report.consensusStrength.toFixed(0)}%</span>}
                </div>
                {report.winningXAP && report.winningXAP.length > 0 ? (
                  <div className="space-y-3">
                    {report.winningXAP.slice(0, 5).map((xap, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <NumberBall number={xap.number} size="xs" glow={true} />
                            <span className="text-[10px] text-slate-400 font-mono">Dominance : <strong className="text-indigo-500 capitalize">{xap.dominantAlgo.replace(/_/g, " ")}</strong></span>
                          </div>
                          <span className="text-xs font-mono font-black text-indigo-500">{(xap.contributionPercentage).toFixed(1)}%</span>
                        </div>
                        {xap.dnaVector && (
                          <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-slate-150 dark:border-slate-800/80">
                            {Object.entries(xap.dnaVector).slice(0, 4).map(([algo, val]) => (
                              <div key={algo} className="p-1 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded text-[8px] font-mono truncate">
                                <span className="text-slate-500 capitalize block truncate">{algo.replace(/_/g, " ")}</span>
                                <span className="font-bold text-indigo-400">{(Number(val) * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Aucun génome oraculaire disponible.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "analytique" && (
            <div className="animate-slide-up space-y-6">
              {/* Audit Math Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "RMSE du Modèle", val: report.rmse !== undefined ? report.rmse.toFixed(3) : "N/A", desc: "Erreur quadratique", sub: "/ 100" },
                  { label: "Brier Score", val: report.brier_score !== undefined ? report.brier_score.toFixed(4) : "N/A", desc: "Calibration", sub: report.brier_score !== undefined && report.brier_score < 0.2 ? "Excel." : "Bruit" },
                  { label: "Divergence KL", val: report.kl_divergence !== undefined ? report.kl_divergence.toFixed(4) : "N/A", desc: "Gain d'infos", sub: "nats" },
                  { label: "Entropie Shannon", val: report.shannon_entropy !== undefined ? report.shannon_entropy.toFixed(2) : "N/A", desc: "Incertitude", sub: "bits" },
                  { label: "Loi de Benford", val: report.benfordCompliance !== undefined ? `${(report.benfordCompliance * 100).toFixed(0)}%` : "N/A", desc: "Conformité log", sub: "% conf." },
                  { label: "Perte Topologique", val: report.continuousTopologicalLoss !== undefined ? report.continuousTopologicalLoss.toFixed(4) : "N/A", desc: "Dispersion", sub: "T-loss" }
                ].map((m, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">{m.label}</span>
                      <span className="text-xs text-slate-500 font-medium block mt-0.5">{m.desc}</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-lg font-black text-slate-800 dark:text-white font-mono">{m.val}</span>
                      <span className="text-[9px] text-slate-400 font-bold">{m.sub}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* René Thom control parameters */}
              {report.catastropheControlParams && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm font-mono text-[10px]">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-2">Discriminant Topologique (Fronce de René Thom)</span>
                  <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-black/25 p-2 rounded-xl">
                    <div>a: <span className="font-black text-indigo-500">{report.catastropheControlParams.a.toFixed(4)}</span></div>
                    <div>b: <span className="font-black text-indigo-500">{report.catastropheControlParams.b.toFixed(4)}</span></div>
                    <div>Δ: <span className={`font-black ${report.catastropheControlParams.discriminant <= 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}>{report.catastropheControlParams.discriminant.toFixed(4)}</span></div>
                    <div className="truncate">Régime: <strong className="uppercase">{report.catastropheControlParams.regime.replace(/_/g, " ")}</strong></div>
                  </div>
                </div>
              )}

              {/* What-If Counterfactuals */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2 mb-3">
                  <GitMerge size={14} className="text-emerald-500" />
                  Optimisation Contre-Factuelle (Correction Gradient)
                </h4>
                {report.counterfactuals && report.counterfactuals.length > 0 ? (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {report.counterfactuals.slice(0, 5).map((cf, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-black/25 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between text-[11px]">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-1 py-0.5 rounded font-black">cf</span>
                            <span className="font-bold text-slate-850 dark:text-slate-100 capitalize">{cf.algo.replace(/_/g, " ")}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate mt-0.5">{cf.description || `Optimisation d'ADN`}</span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="text-emerald-500 font-bold block">+{cf.improvement.toFixed(1)}%</span>
                          <span className="text-[9px] text-slate-400">{(cf.originalWeight * 100).toFixed(0)}% → {(cf.optimalWeight * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic text-center">Aucun contre-factuel disponible.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "cognitif" && (
            <div className="animate-slide-up space-y-6">
              {/* Written narrative */}
              <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  {report.modelUsed && <span className="text-[8px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">MODÈLE: {report.modelUsed}</span>}
                  {report.isBlackSwan && <span className="text-[8px] font-black uppercase bg-rose-500 text-white px-1.5 py-0.5 rounded-full animate-pulse shadow">⚠️ Cygne Noir</span>}
                </div>
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-wider flex items-center gap-2 mb-3">
                  <Sparkles size={14} className="text-purple-500" />
                  Rapport d'Autopsie IA & Narratif Post-Mortem
                </h4>
                <div className="p-4 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-xl mb-4">
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-line">
                    {report.aiAnalysis || "Aucune analyse narrative disponible."}
                  </p>
                </div>
                {report.recommendations && report.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-slate-400">Recommandations Stratégiques</span>
                    <div className="grid gap-1.5">
                      {report.recommendations.slice(0, 3).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-slate-600 dark:text-slate-300">
                          <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Near misses and missed warning signals side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-2">Near Misses (±1 & Miroirs)</span>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {report.nearMisses && report.nearMisses.length > 0 ? (
                      report.nearMisses.map((nm, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded font-mono text-[10px]">
                          <span>Prédit: <strong>{nm.predicted}</strong></span>
                          <span>→ Réel: <strong className="text-indigo-500">{nm.actual}</strong> (d: {nm.distance})</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Aucun near miss.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-2">Signaux d'Anomalies Manquées</span>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {report.missedSignals && report.missedSignals.length > 0 ? (
                      report.missedSignals.map((ms, idx) => (
                        <div key={idx} className="p-1.5 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded text-[10px] flex justify-between items-center">
                          <span className="font-bold truncate max-w-[120px]">{ms.pattern}</span>
                          <span className="font-mono text-[9px] text-amber-500">{(ms.significance * 100).toFixed(0)}% imp.</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Aucune anomalie manquée.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Operator Feedback form (RLHF) embedded inside Cognitive Workspace */}
              <div className="bg-gradient-to-r from-slate-900/10 via-indigo-950/10 to-slate-900/10 p-5 rounded-3xl border border-indigo-500/10 shadow-md">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Boucle d'Apprentissage Opérateur (RLHF)</span>
                {feedbackSent ? (
                  <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center animate-fade-in text-[11px] text-emerald-400 font-bold">
                    ✓ Signal d'ajustement oraculaire transmis.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2 justify-center">
                      {[
                        { id: "Visionnaire", icon: <ThumbsUp size={12} />, color: "bg-emerald-500" },
                        { id: "Standard", icon: <Meh size={12} />, color: "bg-amber-500" },
                        { id: "Incohérente", icon: <ThumbsDown size={12} />, color: "bg-rose-500" }
                      ].map((rate) => (
                        <button
                          key={rate.id}
                          onClick={() => {
                            audioEngine.play("click");
                            setUserRating(rate.id as any);
                          }}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${userRating === rate.id ? `${rate.color} text-white shadow` : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-750"}`}
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
                        placeholder="Observation technique optionnelle..."
                        className="flex-1 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-850 rounded-lg px-3 py-1.5 text-[11px] outline-none"
                      />
                      <button
                        onClick={handleSubmitFeedback}
                        disabled={!userRating || submittingFeedback}
                        className="px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[9px] uppercase tracking-wider"
                      >
                        {submittingFeedback ? "Envoi..." : "Envoyer"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
