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

  const [activeTab, setActiveTab] = useState<"spatial" | "logic">("spatial");

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

  const hitsCount = useMemo(() => {
    if (!report.matches) return 0;
    return report.matches.filter((m) => m.errorType === "Hit").length;
  }, [report.matches]);

  const neighborsCount = useMemo(() => {
    if (!report.matches) return 0;
    return report.matches.filter((m) => m.errorType === "Voisin").length;
  }, [report.matches]);

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
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 px-2.5 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1">
                  <CheckCircle2 size={12} /> {hitsCount} Hits
                </span>
                {neighborsCount > 0 && (
                  <span className="bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-750 px-2.5 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1">
                    <GitMerge size={12} /> {neighborsCount} Voisins
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Clean 2-Workspace Navigation */}
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl w-full sm:w-auto border border-slate-200/50 dark:border-slate-850">
            {[
              { id: "spatial", label: "Diagnostic Spatial & Visuel", color: "text-fuchsia-600 dark:text-fuchsia-400" },
              { id: "logic", label: "Analyse Analytique & IA", color: "text-purple-600 dark:text-purple-400" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  audioEngine.play("click");
                  setActiveTab(tab.id as any);
                }}
                className={`px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 sm:flex-initial text-center ${
                  activeTab === tab.id
                    ? `bg-white dark:bg-slate-800 shadow ${tab.color}`
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-8 bg-slate-50/50 dark:bg-slate-900/50">
          
          {/* WORKSPACE 1: DIAGNOSTIC SPATIAL & VISUEL */}
          {activeTab === "spatial" && (
            <div className="animate-slide-up space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left: 3D Attractor & Trajectories */}
                <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-lg overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 flex justify-between items-center">
                      <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2">
                        <Waves size={14} className="text-fuchsia-500 animate-pulse" />
                        Attracteur Chaotique 3D & Orbites Probabilistes
                      </h4>
                    </div>
                    <div className="h-[320px] w-full">
                      <Forensic3DRadar report={report} globalWeights={globalWeights} />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800 shadow-lg">
                    <h4 className="font-black text-slate-800 dark:text-white mb-4 uppercase text-[10px] tracking-wider flex items-center gap-2">
                      <ScanLine size={14} className="text-indigo-500" />
                      Trajectoire Vectorielle & Balistique des Tirages
                    </h4>
                    <div className="flex flex-col md:flex-row justify-around items-center gap-4 bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-indigo-500 uppercase bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded">Prédiction IA</span>
                        <div className="flex gap-1.5">
                          {Array.isArray(report.matches) && report.matches.map((m, i) => (
                            <NumberBall key={i} number={m.predicted} size="sm" glow={m.errorType === "Hit"} />
                          ))}
                        </div>
                      </div>
                      <div className="text-center text-[10px] font-mono text-slate-400">
                        <span className="block font-black text-emerald-500">{hitsCount} Hits</span>
                        <span>Vitesse : {report.gravitationalDriftVelocity !== undefined ? `${report.gravitationalDriftVelocity.toFixed(3)} rad/s` : "0.345 rad/s"}</span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-emerald-500 uppercase bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded">Tirage Réel</span>
                        <div className="flex gap-1.5">
                          {report.combo?.map((num, i) => (
                            <NumberBall key={i} number={num} size="sm" glow={Array.isArray(report.matches) && report.matches.some(m => m.predicted === num && m.errorType === "Hit")} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {Array.isArray(report.matches) && report.matches.some(m => m.errorType !== "Hit") && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 max-h-[100px] overflow-y-auto custom-scrollbar">
                        {report.matches.filter(m => m.errorType !== "Hit").map((m, idx) => (
                          <div key={idx} className="p-2 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between text-[10px] font-mono">
                            <span>Prédit: <strong>{m.predicted}</strong> → Réel: <strong>{m.actual || "N/A"}</strong></span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getBadgeColor(m.errorType)}`}>{m.errorType} ({m.delta})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Cartographie Spatiale Grid & Spectral Waves */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-lg flex flex-col justify-between">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-4">
                      <LayoutGrid size={14} className="text-amber-500" />
                      Cartographie Spatiale des Impacts (90 Grille)
                    </h4>
                    <div className="grid grid-cols-10 gap-1.5 relative">
                      {spatialGridData.map((cell) => {
                        let bgClass = "bg-slate-50 dark:bg-slate-850 text-slate-400 dark:text-slate-600 border border-slate-100 dark:border-slate-800/60";
                        if (cell.isPredicted && cell.isActual) {
                          bgClass = "bg-emerald-500 text-white font-black shadow-md border border-emerald-300";
                        } else if (cell.isPredicted && !cell.isActual) {
                          bgClass = "bg-indigo-500 text-white font-bold opacity-85 border border-indigo-400";
                        } else if (!cell.isPredicted && cell.isMissed) {
                          bgClass = "bg-rose-500 text-white font-black border border-rose-400";
                        }
                        return (
                          <div key={cell.num} className={`aspect-square rounded flex items-center justify-center text-[8px] font-mono transition-all duration-300 ${bgClass}`}>
                            {cell.num}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-center gap-3 mt-4 text-[9px] uppercase font-bold text-slate-500 bg-slate-50 dark:bg-black/20 p-2 rounded-xl">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm"></span> Hit</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500 rounded-sm"></span> Prédite</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded-sm"></span> Manquée</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-5">
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-3">
                      <Waves size={14} className="text-cyan-500" />
                      Spectre d'Énergie & Tension Topologique
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Spectral */}
                      <div className="p-3 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5">
                        <span className="text-[8px] text-slate-400 uppercase font-black block mb-1">Divergence Spectrale</span>
                        {report.spectralDeviations && report.spectralDeviations.length > 0 ? (
                          <span className="text-xs font-mono font-black text-slate-700 dark:text-slate-300">
                            Δ {(report.spectralDeviations[0]?.delta || 0).toFixed(1)} mHz
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">0.0 mHz</span>
                        )}
                      </div>
                      {/* Tension */}
                      <div className="p-3 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5 flex items-center gap-2">
                        <div className="relative w-8 h-8 flex-shrink-0">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <circle className="text-slate-200 dark:text-slate-800" strokeWidth="4" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
                            <circle className="text-indigo-500" strokeDasharray={`${report.topologicalTensionIndex ?? 25}, 100`} strokeWidth="4" strokeLinecap="round" stroke="currentColor" fill="none" r="16" cx="18" cy="18" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-slate-800 dark:text-white">
                            {report.topologicalTensionIndex ?? 25}%
                          </div>
                        </div>
                        <div>
                          <span className="text-[7px] font-black uppercase text-slate-400 block">Tension Phase</span>
                          <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 truncate max-w-[60px] block">
                            {(report.topologicalTensionIndex ?? 25) > 55 ? "Instable" : "Sain"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WORKSPACE 2: ANALYSE ANALYTIQUE & IA */}
          {activeTab === "logic" && (
            <div className="animate-slide-up space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left: AI Autopsy & RLHF Feedback */}
                <div className="lg:col-span-7 space-y-6">
                  
                  <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-lg relative">
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      {report.modelUsed && (
                        <span className="text-[8px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                          MODÈLE: {report.modelUsed}
                        </span>
                      )}
                      {report.isBlackSwan && (
                        <span className="text-[8px] font-black uppercase bg-rose-500 text-white px-1.5 py-0.5 rounded-full animate-pulse shadow">
                          ⚠️ Cygne Noir
                        </span>
                      )}
                    </div>
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-purple-500" />
                      Rapport d'Autopsie IA & Narratif Post-Mortem
                    </h4>
                    <div className="p-4 bg-slate-50/75 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded-xl mb-4 max-h-[160px] overflow-y-auto custom-scrollbar">
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-line">
                        {report.aiAnalysis || "Aucune analyse narrative disponible."}
                      </p>
                    </div>
                    {report.recommendations && report.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[8px] font-black uppercase text-slate-400">Recommandations Stratégiques</span>
                        <div className="grid gap-1.5">
                          {report.recommendations.slice(0, 2).map((rec, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-slate-600 dark:text-slate-300">
                              <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                              <span>{rec}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Near Misses / Anomaly Signals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                      <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest block mb-2">Near Misses (±1 & Miroirs)</span>
                      <div className="space-y-1.5 max-h-[110px] overflow-y-auto custom-scrollbar">
                        {report.nearMisses && report.nearMisses.length > 0 ? (
                          report.nearMisses.slice(0, 3).map((nm, idx) => (
                            <div key={idx} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded font-mono text-[9px]">
                              <span>Prédit: <strong>{nm.predicted}</strong></span>
                              <span>→ Réel: <strong className="text-indigo-500">{nm.actual}</strong> (d: {nm.distance})</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[9px] text-slate-400 italic">Aucun near miss.</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                      <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest block mb-2">Signaux d'Anomalies Manquées</span>
                      <div className="space-y-1.5 max-h-[110px] overflow-y-auto custom-scrollbar">
                        {report.missedSignals && report.missedSignals.length > 0 ? (
                          report.missedSignals.slice(0, 3).map((ms, idx) => (
                            <div key={idx} className="p-1.5 bg-slate-50 dark:bg-black/25 border border-slate-100 dark:border-slate-800 rounded text-[9px] flex justify-between items-center font-mono">
                              <span className="font-bold truncate max-w-[120px]">{ms.pattern}</span>
                              <span className="text-amber-500">{(ms.significance * 100).toFixed(0)}%</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[9px] text-slate-400 italic">Aucune anomalie manquée.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Operator Feedback form (RLHF) */}
                  <div className="bg-gradient-to-r from-slate-900/5 via-indigo-950/5 to-slate-900/5 dark:from-slate-900/10 dark:to-slate-900/10 p-5 rounded-3xl border border-indigo-500/10 shadow">
                    <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest block mb-2">Boucle d'Apprentissage Opérateur (RLHF)</span>
                    {feedbackSent ? (
                      <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center animate-fade-in text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        ✓ Signal d'ajustement oraculaire transmis au moteur rétroactif.
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
                              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 transition-all ${userRating === rate.id ? `${rate.color} text-white shadow` : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-750"}`}
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
                            placeholder="Observation technique d'autopsie..."
                            className="flex-1 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-850 rounded-lg px-3 py-1.5 text-[10px] outline-none"
                          />
                          <button
                            onClick={handleSubmitFeedback}
                            disabled={!userRating || submittingFeedback}
                            className="px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-black text-[9px] uppercase tracking-wider disabled:opacity-50"
                          >
                            {submittingFeedback ? "Envoi..." : "Envoyer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Analytical Verification metrics, Catastrophes, Counterfactuals */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Grid of 6 Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "RMSE", val: report.rmse !== undefined ? report.rmse.toFixed(2) : "N/A", desc: "Erreur quadratique" },
                      { label: "Brier Score", val: report.brier_score !== undefined ? report.brier_score.toFixed(4) : "N/A", desc: "Calibration" },
                      { label: "Divergence KL", val: report.kl_divergence !== undefined ? report.kl_divergence.toFixed(4) : "N/A", desc: "Gain d'infos" },
                      { label: "Entropie Shannon", val: report.shannon_entropy !== undefined ? report.shannon_entropy.toFixed(2) : "N/A", desc: "Incertitude" },
                      { label: "Loi de Benford", val: report.benfordCompliance !== undefined ? `${(report.benfordCompliance * 100).toFixed(0)}%` : "N/A", desc: "Conformité log" },
                      { label: "Perte Topologique", val: report.continuousTopologicalLoss !== undefined ? report.continuousTopologicalLoss.toFixed(4) : "N/A", desc: "Dispersion" }
                    ].map((m, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block">{m.label}</span>
                          <span className="text-[7px] text-slate-500 font-medium block mt-0.5 leading-tight">{m.desc}</span>
                        </div>
                        <span className="text-sm font-black text-slate-800 dark:text-white font-mono mt-1.5 block">{m.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* René Thom control parameters */}
                  {report.catastropheControlParams && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm font-mono text-[9px]">
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block mb-2">Fronce de René Thom (Catastrophes)</span>
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-black/25 p-2 rounded-xl">
                        <div>a: <span className="font-black text-indigo-500">{report.catastropheControlParams.a.toFixed(3)}</span></div>
                        <div>b: <span className="font-black text-indigo-500">{report.catastropheControlParams.b.toFixed(3)}</span></div>
                        <div>Δ: <span className={`font-black ${report.catastropheControlParams.discriminant <= 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}>{report.catastropheControlParams.discriminant.toFixed(3)}</span></div>
                        <div className="truncate">Régime: <strong className="uppercase">{report.catastropheControlParams.regime.replace(/_/g, " ")}</strong></div>
                      </div>
                    </div>
                  )}

                  {/* What-If Counterfactuals */}
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-lg">
                    <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-3">
                      <Cpu size={14} className="text-emerald-500" />
                      Optimisation Contre-Factuelle (Correction Gradient)
                    </h4>
                    {report.counterfactuals && report.counterfactuals.length > 0 ? (
                      <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                        {report.counterfactuals.slice(0, 3).map((cf, idx) => (
                          <div key={idx} className="p-2 bg-slate-50 dark:bg-black/25 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between text-[10px] font-mono">
                            <div className="truncate">
                              <span className="font-bold text-slate-700 dark:text-slate-300 capitalize truncate block">{cf.algo.replace(/_/g, " ")}</span>
                              <span className="text-[8px] text-slate-400 block font-sans">Poids : {(cf.originalWeight * 100).toFixed(0)}% → {(cf.optimalWeight * 100).toFixed(0)}%</span>
                            </div>
                            <span className="text-emerald-500 font-bold shrink-0 font-mono">+{cf.improvement.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 italic text-center">Aucun contre-factuel disponible.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
