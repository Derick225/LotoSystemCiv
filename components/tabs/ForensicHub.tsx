import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deletePrediction } from "../../services/predictionHistoryService";
import { deleteForensicReportLocal, syncForensicReportsWithCloud } from "../../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../../services/syncService";
import { PredictionForensics } from "../PredictionForensics";
import {
  Target,
  Trash2,
  RefreshCw,
  Cloud,
  History,
  Clock,
  Activity,
  CheckCircle2,
  ShieldAlert,
  Zap,
  Sliders,
  Sparkles,
  GitMerge,
  Cpu,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ForensicReport, PredictionHistoryItem, AlgoWeights } from "../../types";
import { useForensicData } from '../../hooks/useForensicData';
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { PredictionHistory } from "../PredictionHistory";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { formatDateSafely } from "../../utils/dateUtils";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";

type ForensicMode = "prediction" | "historique" | "timemachine";
type ForensicPanel = "autopsy" | "drift" | "correction";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const regime = useNexusStore((state) => state.regime);
  const fractal = useNexusStore((state) => state.fractal);
  const { showToast } = useToast();
  
  const { 
      reports, 
      pendingPredictions, 
      setPendingPredictions,
      refreshData: refreshForensicData, 
      setReports 
  } = useForensicData(drawName);

  const [syncing, setSyncing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);
  const [mode, setMode] = useState<ForensicMode>("prediction");
  const [activePanel, setActivePanel] = useState<ForensicPanel>("autopsy");
  const [applyingAdjustments, setApplyingAdjustments] = useState(false);

  // SYMBIOSE : Écouteur d'événements pour navigation croisée
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.subTab) {
        setMode(customEvent.detail.subTab as ForensicMode);
        const contentElement = document.getElementById("forensic-content");
        if (contentElement)
          contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("NAVIGATE_SUB_FORENSIC", handleNavigation);
    return () => window.removeEventListener("NAVIGATE_SUB_FORENSIC", handleNavigation);
  }, []);

  useEffect(() => {
    refreshForensicData();
  }, [refreshForensicData]);

  const handleRefresh = () => {
    try { audioEngine.play("click"); } catch(e) {}
    refreshForensicData();
  };

  const handleSync = async () => {
    try { audioEngine.play("click"); } catch(e) {}
    setSyncing(true);
    try {
      const synced = await syncForensicReportsWithCloud();
      const filtered = synced.filter((r) => r.drawName === drawName);
      
      const uniqueMap = new Map<string, ForensicReport>();
      filtered.forEach((r) => {
        if (r && r.id) {
          uniqueMap.set(r.id, r);
        }
      });
      
      setReports(Array.from(uniqueMap.values()));
      try { audioEngine.play("success"); } catch(e) {}
      showToast("Synchronisation Cloud terminée.", "success");
    } catch (e) {
      try { audioEngine.play("error"); } catch(e) {}
      showToast("Erreur de synchronisation.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { audioEngine.play("click"); } catch(e) {}
    if (!confirm("Supprimer ce rapport Forensic (Local + Cloud) ?")) return;

    try {
      const report = reports.find((r) => r.id === id);
      if (report?.predictionId) {
        await deletePrediction(report.predictionId);
      }
      await deleteForensicReportLocal(id);
      await deleteForensicReportCloud(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedReport?.id === id) setSelectedReport(null);
      try { audioEngine.play("success"); } catch(e) {}
      showToast("Rapport supprimé.", "info");
    } catch (e) {
      try { audioEngine.play("error"); } catch(e) {}
      showToast("Erreur suppression.", "error");
    }
  };

  const handleDeletePending = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { audioEngine.play("click"); } catch(e) {}
    if (!confirm("Supprimer cette prédiction en attente ?")) return;

    try {
      await deletePrediction(id);
      setPendingPredictions((prev: PredictionHistoryItem[]) => prev.filter((p: PredictionHistoryItem) => p.id !== id));
      try { audioEngine.play("success"); } catch(e) {}
      showToast("Prédiction supprimée.", "info");
    } catch (e) {
      try { audioEngine.play("error"); } catch(e) {}
      showToast("Erreur lors de la suppression.", "error");
    }
  };

  // Active Report for Panel 1 (Autopsy)
  const activeReport = useMemo(() => {
    if (selectedReport) return selectedReport;
    return reports.length > 0 ? reports[0] : null;
  }, [selectedReport, reports]);

  // Derived Drift Metrics for Panel 2
  const driftMetrics = useMemo(() => {
    // Hurst exponent
    let hurstVal = 0.54;
    if (fractal && fractal.length > 0 && fractal[0].hurst !== undefined) {
      hurstVal = fractal[0].hurst;
    } else if (regime?.chaosDimension) {
      hurstVal = Math.max(0.3, Math.min(0.85, 2 - regime.chaosDimension));
    }


    // Shannon entropy
    let entropyVal = 4.25;
    if (activeReport?.shannon_entropy !== undefined) {
      entropyVal = activeReport.shannon_entropy;
    } else if (reports.length > 0 && reports[0].shannon_entropy !== undefined) {
      entropyVal = reports[0].shannon_entropy;
    }

    // Drift level classification
    let statusLabel = "STABLE";
    let statusColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    let desc = "Régime déterministe régulier. Alignement optimal des poids.";

    if (hurstVal < 0.45 || entropyVal > 4.8) {
      statusLabel = "FORTE DÉRIVE";
      statusColor = "text-rose-500 bg-rose-500/10 border-rose-500/20";
      desc = "Fluctuations chaotiques élevées. Réajustement des algorithmes recommandé.";
    } else if (hurstVal < 0.55 || entropyVal > 4.4) {
      statusLabel = "DÉRIVE MODÉRÉE";
      statusColor = "text-amber-500 bg-amber-500/10 border-amber-500/20";
      desc = "Micro-variations de régime. Poids sous surveillance active.";
    }

    const tension = activeReport?.topologicalTensionIndex ?? 22;
    const klDiv = activeReport?.kl_divergence ?? 0.048;

    return {
      hurstVal,
      entropyVal,
      statusLabel,
      statusColor,
      desc,
      tension,
      klDiv,
    };
  }, [fractal, regime, activeReport, reports]);

  // Top 3 Underperforming Algorithms & Suggested Boosts for Panel 3
  const correctionData = useMemo(() => {
    const defaultAlgos = [
      { name: "Markov Transition (2nd Order)", algoKey: "markovOrder2", deficit: 18.5, boost: 0.08, reason: "Sous-pondération sur transitions paires" },
      { name: "Fractal Hurst Rescaled Range", algoKey: "fractalHurst", deficit: 14.2, boost: 0.06, reason: "Décalage d'échelle de résonance" },
      { name: "Hawkes Spatio-Temporal Volatility", algoKey: "hawkesIntensity", deficit: 11.0, boost: 0.04, reason: "Inertie temporelle sur salves" },
    ];

    if (!reports || reports.length === 0) return defaultAlgos;

    // Extract counterfactuals or missed signals from active report
    if (activeReport?.counterfactuals && activeReport.counterfactuals.length >= 3) {
      return activeReport.counterfactuals.slice(0, 3).map((cf) => ({
        name: cf.algo.replace(/_/g, " "),
        algoKey: cf.algo,
        deficit: cf.improvement,
        boost: Math.max(0.02, cf.optimalWeight - cf.originalWeight),
        reason: `Gain d'alignement estimé: +${cf.improvement.toFixed(1)}%`,
      }));
    }

    return defaultAlgos;
  }, [reports, activeReport]);

  // 1-Click Apply Weight Adjustments
  const handleApplyAdjustments = async () => {
    try { audioEngine.play("click"); } catch (e) { console.warn("Audio play failed"); }
    setApplyingAdjustments(true);

    try {
      const updatedWeights: Record<string, number> = { ...(globalWeights as unknown as Record<string, number>) };
      
      // Apply boost to identified top underperforming algorithms
      correctionData.forEach((item) => {
        const current = updatedWeights[item.algoKey] || 0.1;
        updatedWeights[item.algoKey] = Math.min(0.4, current + item.boost);
      });

      // Renormalize weights so their sum equals 1
      const total = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
      if (total > 0) {
        Object.keys(updatedWeights).forEach((k) => {
          updatedWeights[k] /= total;
        });
      }

      await updateGlobalWeights(updatedWeights as unknown as AlgoWeights, drawName);
      try { audioEngine.play("success"); } catch (e) { console.warn("Audio play failed"); }
      showToast("Ajustements de poids appliqués au modèle continu avec succès !", "success");
    } catch (e) {
      try { audioEngine.play("error"); } catch (e) { console.warn("Audio play failed"); }
      showToast("Échec de l'application des ajustements.", "error");
    } finally {
      setApplyingAdjustments(false);
    }
  };

  return (
    <div id="forensic-content" className="max-w-7xl mx-auto space-y-6 pt-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center gap-4">
            <Target className="text-emerald-500" size={32} />
            Hub Forensique & Audit
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 max-w-xl text-sm leading-relaxed">
            Centre d'autopsie post-tirage, détection de dérive spatiale et boucle d'auto-correction déterministe.
          </p>
        </div>
      </div>

      {/* Primary Sub-Tabs Navigation */}
      <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent mb-6">
        <div className="overflow-x-auto scrollbar-hide pb-2">
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner">
            {[
              { id: "prediction", label: "Rapports & Audit", icon: Target, color: "text-emerald-500" },
              { id: "historique", label: "Historique", icon: History, color: "text-indigo-500" },
              { id: "timemachine", label: "Time Machine", icon: Clock, color: "text-fuchsia-500" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  try { audioEngine.play("click"); } catch(e) {}
                  setMode(tab.id as ForensicMode);
                }}
                className={`px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                  mode === tab.id
                    ? "bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                <tab.icon size={14} className={mode === tab.id ? tab.color : ""} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Workspace Modes */}
      <div className="flex-1 min-w-0 w-full space-y-8">
        {mode === "historique" && (
          <div className="space-y-8 animate-slide-up">
            <PredictionHistory drawName={drawName} />
          </div>
        )}

        {mode === "timemachine" && (
          <div className="space-y-8 animate-slide-up">
            <ForensicTimeMachine drawName={drawName} history={history} currentWeights={globalWeights} />
          </div>
        )}

        {mode === "prediction" && (
          <div className="space-y-8 animate-slide-up">
            {/* Top Bar Controls */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 md:p-8 border border-slate-200/60 dark:border-slate-800 shadow-xl space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Panneaux d'Analyse</h3>
                  <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 rounded-full border border-emerald-500/20 uppercase">
                    3-Panel Streamlined
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={handleSync} disabled={syncing} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-xl transition-colors" title="Synchroniser avec le Cloud">
                    <Cloud size={16} className={syncing ? "animate-bounce" : ""} />
                  </button>
                  <button onClick={handleRefresh} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 rounded-xl transition-colors" title="Rafraîchir">
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>

              {/* 3 Streamlined Panels Tabs Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: "autopsy",
                    title: "1. Autopsie & Alignement",
                    desc: "Taux de correspondance direct et décalages de voisinage",
                    icon: Target,
                    activeColor: "border-emerald-500 text-emerald-500 bg-emerald-500/5",
                  },
                  {
                    id: "drift",
                    title: "2. Détection de Dérive",
                    desc: "Exposant Hurst, Entropie Shannon & tension de phase",
                    icon: Activity,
                    activeColor: "border-indigo-500 text-indigo-500 bg-indigo-500/5",
                  },
                  {
                    id: "correction",
                    title: "3. Auto-Correction & Rétro-Action",
                    desc: "Sous-performances & réajustement de poids 1-Clic",
                    icon: Sliders,
                    activeColor: "border-fuchsia-500 text-fuchsia-500 bg-fuchsia-500/5",
                  },
                ].map((panel) => {
                  const isActive = activePanel === panel.id;
                  const Icon = panel.icon;
                  return (
                    <button
                      key={panel.id}
                      onClick={() => {
                        try { audioEngine.play("click"); } catch(e) {}
                        setActivePanel(panel.id as ForensicPanel);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between group ${
                        isActive
                          ? `bg-white dark:bg-slate-850 shadow-lg ${panel.activeColor} ring-1 ring-emerald-500/20`
                          : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-black uppercase tracking-wider ${isActive ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                          {panel.title}
                        </span>
                        <Icon size={18} className={isActive ? panel.activeColor.split(" ")[1] : "text-slate-400"} />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-snug">
                        {panel.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* PANEL 1: AUTOPSIE & ALIGNEMENT */}
              {activePanel === "autopsy" && (
                <div className="space-y-6 animate-fade-in pt-2">
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800">
                      <div>
                        <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest block">
                          Comparaison Directe Réel vs Prédit
                        </span>
                        <h4 className="text-base font-black text-slate-800 dark:text-white mt-0.5">
                          {activeReport ? `Tirage: ${activeReport.drawName}` : "Aucun rapport sélectionné"}
                        </h4>
                      </div>

                      {activeReport && (
                        <div className="flex items-center gap-3">
                          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                            <span className="block text-[8px] font-bold text-slate-400 uppercase">Taux de Correspondance</span>
                            <span className="text-sm font-black text-emerald-500 font-mono">
                              {(((Array.isArray(activeReport.matches) ? activeReport.matches.filter(m => m.errorType === "Hit").length : 0) / 5) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
                            <span className="block text-[8px] font-bold text-slate-400 uppercase">Hits Directs</span>
                            <span className="text-sm font-black text-indigo-400 font-mono">
                              {Array.isArray(activeReport.matches) ? activeReport.matches.filter(m => m.errorType === "Hit").length : 0} / 5
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {activeReport ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Numbers Comparison */}
                        <div className="space-y-4">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                            Combinaisons Alignées
                          </span>
                          
                          <div className="space-y-3">
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-indigo-500 uppercase">Prédit par l'IA</span>
                              <div className="flex gap-1.5">
                                {Array.isArray(activeReport.matches) && activeReport.matches.map((m, idx) => (
                                  <div
                                    key={idx}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                                      m.errorType === "Hit"
                                        ? "bg-emerald-500 text-white"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                    }`}
                                  >
                                    {m.predicted}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase">Tirage Réel Officiel</span>
                              <div className="flex gap-1.5">
                                {activeReport.combo?.map((num, idx) => {
                                  const isHit = Array.isArray(activeReport.matches) && activeReport.matches.some(m => m.predicted === num && m.errorType === "Hit");
                                  return (
                                    <div
                                      key={idx}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${
                                        isHit
                                          ? "bg-emerald-500 text-white"
                                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                      }`}
                                    >
                                      {num}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Neighbor Offsets Breakdown */}
                        <div className="space-y-4">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                            Décalages de Voisinage & Near-Misses
                          </span>
                          
                          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                            {Array.isArray(activeReport.matches) && activeReport.matches.some(m => m.errorType !== "Hit") ? (
                              activeReport.matches.filter(m => m.errorType !== "Hit").map((m, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-[10px] font-mono">
                                  <span>Prédit: <strong className="text-indigo-400">{m.predicted}</strong> → Réel: <strong>{m.actual || "N/A"}</strong></span>
                                  <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                    {m.errorType} (Δ: {m.delta})
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-400 italic text-center py-4">
                                Alignement parfait ou aucun décalage de voisinage détecté.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-6">
                        Sélectionnez un rapport ci-dessous pour lancer l'autopsie d'alignement.
                      </p>
                    )}
                  </div>

                  {/* Frise Post-Mortem Unifiée */}
                  <UnifiedForensicTimeline 
                    reports={reports}
                    selectedReport={selectedReport}
                    onSelectReport={setSelectedReport}
                    onDeleteReport={handleDeleteReport}
                  />
                </div>
              )}

              {/* PANEL 2: DÉTECTION DE DÉRIVE (DRIFT & REGIME SHIFT) */}
              {activePanel === "drift" && (
                <div className="space-y-6 animate-fade-in pt-2">
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-6">
                    
                    {/* Unique Fractal Gauge Section */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="space-y-2 max-w-md">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5">
                          <Zap size={14} /> Jauge Unique de Stabilité Fractale
                        </span>
                        <h4 className="text-lg font-black text-slate-800 dark:text-white">
                          Exposant de Hurst & Entropie de Shannon
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {driftMetrics.desc}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${driftMetrics.statusColor} flex items-center gap-2`}>
                          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                          {driftMetrics.statusLabel}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Hurst: {driftMetrics.hurstVal.toFixed(3)} | Entropy: {driftMetrics.entropyVal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Topological & Divergence Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Exposant de Hurst (H)
                        </span>
                        <span className="text-2xl font-black font-mono text-indigo-500">
                          {driftMetrics.hurstVal.toFixed(3)}
                        </span>
                        <span className="block text-[8px] text-slate-500 mt-1">
                          {driftMetrics.hurstVal > 0.5 ? "Persistance (Tendance)" : "Anti-persistance (Chaotique)"}
                        </span>
                      </div>

                      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Entropie Shannon (S)
                        </span>
                        <span className="text-2xl font-black font-mono text-purple-500">
                          {driftMetrics.entropyVal.toFixed(2)}
                        </span>
                        <span className="block text-[8px] text-slate-500 mt-1">
                          Atypicité du spectre d'information
                        </span>
                      </div>

                      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Divergence KL & Tension
                        </span>
                        <span className="text-2xl font-black font-mono text-emerald-500">
                          {driftMetrics.klDiv.toFixed(3)}
                        </span>
                        <span className="block text-[8px] text-slate-500 mt-1">
                          Tension phase: {driftMetrics.tension}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PANEL 3: AUTO-CORRECTION & RÉTRO-ACTION */}
              {activePanel === "correction" && (
                <div className="space-y-6 animate-fade-in pt-2">
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-6">
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-black uppercase text-fuchsia-500 tracking-widest block">
                          Boucle Rétroactive Continu
                        </span>
                        <h4 className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                          Top 3 Algorithmes en Sous-Performance & Boosts Suggérés
                        </h4>
                      </div>

                      <button
                        onClick={handleApplyAdjustments}
                        disabled={applyingAdjustments}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                      >
                        <Sparkles size={16} />
                        {applyingAdjustments ? "Application..." : "Appliquer les Ajustements (1-Clic)"}
                      </button>
                    </div>

                    {/* List of Underperforming Algos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {correctionData.map((algo, idx) => (
                        <div key={idx} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-black text-fuchsia-500 font-mono">
                                #0{idx + 1} SOUS-PERFORMANCE
                              </span>
                              <span className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded font-mono">
                                -{algo.deficit.toFixed(1)}%
                              </span>
                            </div>
                            <h5 className="text-sm font-black text-slate-800 dark:text-white">
                              {algo.name}
                            </h5>
                            <p className="text-[10px] text-slate-400 mt-1 italic leading-tight">
                              {algo.reason}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between font-mono text-xs">
                            <span className="text-slate-500 text-[10px] font-bold">Boost suggéré :</span>
                            <span className="font-black text-emerald-500">
                              +{(algo.boost * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Predictions List */}
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-indigo-500 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Prédictions en Attente de Tirage ({pendingPredictions.length})
                  </h4>
                </div>

                {pendingPredictions.length === 0 ? (
                  <div className="p-6 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">Aucune prédiction en attente de résultat.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingPredictions.map((p: PredictionHistoryItem) => {
                      const predDate = new Date(p.timestamp);
                      return (
                        <div key={p.id} className="group relative p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/30 transition-all flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Oracle Prediction</span>
                              <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                                {predDate.toLocaleDateString('fr-FR')} à {predDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <button 
                              onClick={(e) => handleDeletePending(p.id, e)} 
                              className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          
                          <div className="flex gap-1.5">
                            {p.prediction.suggestedNumbers.map((n: number) => (
                              <div 
                                key={n} 
                                className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-800 dark:text-slate-200 shadow-sm"
                              >
                                {n}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedReport && (
          <PredictionForensics report={selectedReport} onClose={() => setSelectedReport(null)} />
        )}
      </div>
    </div>
  );
});

