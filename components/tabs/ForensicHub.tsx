import React, { useState, useEffect } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deletePrediction } from "../../services/predictionHistoryService";
import { deleteForensicReportLocal, syncForensicReportsWithCloud } from "../../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../../services/syncService";
import { PredictionForensics } from "../PredictionForensics";
import { Target, Trash2, RefreshCw, Cloud, History, Clock, BookOpen, ArrowUpRight, ArrowDownRight, Brain, Activity, ShieldAlert, CheckCircle2, TrendingUp, Gauge, BrainCircuit } from "lucide-react";
import { ForensicReport, PredictionHistoryItem } from "../../types";
import { useForensicData } from '../../hooks/useForensicData';
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { PredictionHistory } from "../PredictionHistory";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { formatDateSafely } from "../../utils/dateUtils";
import { NeuralFeedbackPanel } from "../NeuralFeedbackPanel";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";

type ForensicMode = "prediction" | "historique" | "timemachine" | "shrinkagedrift" | "neuralfeedback";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const isForensicOptimized = useNexusStore((state) => state.isForensicOptimized);
  const setForensicOptimized = useNexusStore((state) => state.setForensicOptimized);
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

  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditing, setAuditing] = useState(false);
  const [driftCorrelations, setDriftCorrelations] = useState<any[]>([]);
  const [applyingDriftFeedback, setApplyingDriftFeedback] = useState(false);

  const loadDriftCorrelations = async () => {
    try {
      const { analyzeDriftCorrelations } = await import("../../services/training/driftCorrelationService");
      const correlations = await analyzeDriftCorrelations(drawName);
      setDriftCorrelations(correlations);
    } catch (e) {
      console.warn("Failed to load drift correlations", e);
    }
  };

  const applyDriftFeedback = async () => {
    setApplyingDriftFeedback(true);
    try {
      const { applyDriftCorrelationsToNeuralEngine } = await import("../../services/training/driftCorrelationService");
      await applyDriftCorrelationsToNeuralEngine(drawName);
      showToast("Boucle de feedback corrélative appliquée avec succès au Moteur Neural.", "success");
      try { audioEngine.play("success"); } catch(e) {}
      await loadDriftCorrelations(); // reload to show updated state
    } catch (err) {
      showToast("Erreur lors de l'application de la boucle de feedback.", "error");
      try { audioEngine.play("error"); } catch(e) {}
    } finally {
      setApplyingDriftFeedback(false);
    }
  };

  useEffect(() => {
    if (mode === "prediction") {
      loadDriftCorrelations();
    }
  }, [mode, drawName, reports]);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const { runHistoricalShrinkageBacktest } = await import("../../services/prediction/shrinkageVerificationService");
      const report = await runHistoricalShrinkageBacktest(drawName, history, globalWeights);
      setAuditResult(report);
      try { audioEngine.play("success"); } catch(e) {}
    } catch (err) {
      console.error(err);
      try { audioEngine.play("error"); } catch(e) {}
      showToast("Erreur lors de l'exécution de l'audit arithmétique.", "error");
    } finally {
      setAuditing(false);
    }
  };

  useEffect(() => {
    if (mode === "shrinkagedrift" && !auditResult && !auditing) {
      runAudit();
    }
  }, [mode, auditResult, auditing]);

  const ledgerStats = React.useMemo(() => {
    let neighborsCount = 0;
    let mirrorsCount = 0;
    let shadowsCount = 0;
    let machineShifts = 0;
    let benfordDeviations = 0;
    let entropyCollapses = 0;
    const algoDrifts: Record<string, { over: number; under: number; count: number }> = {};

    reports.slice(0, 5).forEach((r) => {
      if (r.entropyCollapse) {
          entropyCollapses++;
      }
      if (r.benfordCompliance !== undefined && r.benfordCompliance < 0.5) {
          benfordDeviations++;
      }

      if (Array.isArray(r.matches)) {
        r.matches.forEach((m) => {
          if (m.errorType === "Voisin") neighborsCount++;
          if (m.errorType === "Miroir") mirrorsCount++;
          if (m.errorType === "Shadow") shadowsCount++;
          if (m.errorType === "Machine") machineShifts++;
        });
      }
      if (Array.isArray(r.algorithmicDrift)) {
        r.algorithmicDrift.forEach((d) => {
          if (!algoDrifts[d.algo]) {
            algoDrifts[d.algo] = { over: 0, under: 0, count: 0 };
          }
          if (d.direction === "overestimating") {
            algoDrifts[d.algo].over += d.driftScore;
          } else {
            algoDrifts[d.algo].under += d.driftScore;
          }
          algoDrifts[d.algo].count++;
        });
      }
    });

    return {
      neighborsCount,
      mirrorsCount,
      shadowsCount,
      machineShifts,
      benfordDeviations,
      entropyCollapses,
      algoDrifts: Object.entries(algoDrifts).map(([algo, data]) => ({
        algo,
        netDrift: (data.over - data.under) / (data.count || 1),
        count: data.count,
      })),
    };
  }, [reports]);

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

  return (
    <div id="forensic-content" className="max-w-7xl mx-auto space-y-6 pt-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center gap-4">
            <Target className="text-emerald-500" size={32} />
            Post-Mortem & Audit
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-xl text-sm leading-relaxed">
            Analyse déterministe des prédictions passées. Isolez les performances algorithmiques et consultez l'historique.
          </p>
        </div>
      </div>

      <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent mb-8">
        <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl md:rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner">
            {[
              { id: "prediction", label: "Rapports", icon: Target, color: "text-slate-900 dark:text-white" },
              { id: "historique", label: "Historique", icon: History, color: "text-indigo-500" },
              { id: "timemachine", label: "Time Machine", icon: Clock, color: "text-fuchsia-500" },
              { id: "shrinkagedrift", label: "Audit Arithmétique", icon: Activity, color: "text-emerald-500" },
              { id: "neuralfeedback", label: "Neural Feedback", icon: BrainCircuit, color: "text-amber-500" }
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

      <div className="flex-1 min-w-0 w-full space-y-8">
        {mode === "neuralfeedback" && (
          <div className="space-y-8 animate-slide-up">
            <NeuralFeedbackPanel />
          </div>
        )}

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
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Rapports & Prédictions</h3>
                <div className="flex gap-2">
                  <button onClick={handleSync} disabled={syncing} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-xl transition-colors" title="Synchroniser avec le Cloud">
                    <Cloud size={18} className={syncing ? "animate-bounce" : ""} />
                  </button>
                  <button onClick={handleRefresh} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 rounded-xl transition-colors" title="Rafraîchir">
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              {/* CONSOLE D'AJUSTEMENT CYBERNÉTIQUE UNIFIÉE */}
              <div className="mb-8 p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Brain className="text-emerald-500 animate-pulse" size={20} />
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Console d'Ajustement Cybernétique
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Calibrage adaptatif continu basé sur l'autopsie des 5 dernières sessions de tirages.
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setForensicOptimized(!isForensicOptimized);
                      try { audioEngine.play("click"); } catch(e) {}
                      showToast(
                        `Optimisation Forensic ${!isForensicOptimized ? "activée" : "désactivée"} avec succès.`,
                        "success"
                      );
                    }}
                    title="Cliquer pour activer/désactiver l'intégration des ajustements d'autopsies passées"
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm ${
                      isForensicOptimized
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-500/25 dark:hover:bg-emerald-500/35 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                        : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300/20"
                    }`}
                  >
                    <Brain size={12} className={isForensicOptimized ? "animate-pulse" : ""} />
                    <span>Optimisation : {isForensicOptimized ? "Active" : "Inactive"}</span>
                  </button>
                </div>

                {/* 6 Core Topological Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Écarts de Voisins</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.neighborsCount}
                      <span className="text-[9px] font-medium text-slate-500">corrigés</span>
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Effets Miroirs</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.mirrorsCount}
                      <span className="text-[9px] font-medium text-slate-500">capturés</span>
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Transpositions d'Ombres</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.shadowsCount}
                      <span className="text-[9px] font-medium text-slate-500">isolées</span>
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Vitesse Machine</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.machineShifts}
                      <span className="text-[9px] font-medium text-slate-500">corrigées</span>
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-rose-500/10 shadow-sm relative overflow-hidden">
                    <span className="text-[9px] font-bold text-rose-400 uppercase block mb-1">Collapses Entropiques</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.entropyCollapses}
                      <span className="text-[9px] font-medium text-rose-500/70">neutralisés</span>
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-emerald-500/10 shadow-sm relative overflow-hidden">
                    <span className="text-[9px] font-bold text-emerald-400 uppercase block mb-1">Déviances Benford</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white flex items-baseline gap-1 font-mono">
                      {ledgerStats.benfordDeviations}
                      <span className="text-[9px] font-medium text-emerald-500/70">réalignées</span>
                    </span>
                  </div>
                </div>

                {/* Algorithmic Drift & proposed weight adjustments */}
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Facteurs Multiplicateurs de Dérive Proposés
                      </h5>
                      <p className="text-[10px] text-slate-500">
                        Ajustements continus calculés par le moteur adaptatif d'après les déviances constatées.
                      </p>
                    </div>
                    
                    <button
                      onClick={applyDriftFeedback}
                      disabled={applyingDriftFeedback || driftCorrelations.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer shadow-md"
                    >
                      <RefreshCw size={12} className={applyingDriftFeedback ? "animate-spin" : ""} />
                      <span>{applyingDriftFeedback ? "Ajustement..." : "Appliquer le Réalignement Cybernétique"}</span>
                    </button>
                  </div>
                  
                  {driftCorrelations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {driftCorrelations.map(corr => (
                        <div key={corr.algoName} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 rounded-xl flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{corr.algoName}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-900 text-slate-500 border border-slate-150 dark:border-slate-850">
                              {corr.failureFrequency} cas
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 font-mono">Sévérité: {corr.driftSeverity > 0 ? "+" : ""}{corr.driftSeverity.toFixed(2)}</span>
                            <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                              corr.proposedWeightMultiplier > 1 ? "text-emerald-500" : "text-rose-500"
                            }`}>
                              {corr.proposedWeightMultiplier > 1 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                              {(corr.proposedWeightMultiplier * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl text-center">
                      <p className="text-[10px] text-slate-500 italic font-medium">Aucun correcteur de dérive requis à ce stade.</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Frise Post-Mortem Unifiée (Drift, Alignement & Navigation) */}
              <UnifiedForensicTimeline 
                reports={reports}
                selectedReport={selectedReport}
                onSelectReport={setSelectedReport}
                onDeleteReport={handleDeleteReport}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* COLUMN 1: En attente de résultat */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <Clock size={16} className="text-indigo-500 animate-pulse" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      En attente de résultat ({pendingPredictions.length})
                    </h4>
                  </div>
                  {pendingPredictions.length === 0 ? (
                    <div className="p-6 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">Aucune prédiction en attente de résultat.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingPredictions.map((p: PredictionHistoryItem) => {
                        const predDate = new Date(p.timestamp);
                        return (
                          <div key={p.id} className="group relative overflow-hidden p-4 bg-slate-50/75 dark:bg-slate-900/30 rounded-2xl border border-slate-150 dark:border-slate-800 hover:border-indigo-500/30 transition-all">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Oracle Prediction</span>
                                <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                                  Généré le {predDate.toLocaleDateString('fr-FR')} à {predDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <button 
                                onClick={(e) => handleDeletePending(p.id, e)} 
                                className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors"
                                title="Supprimer la prédiction"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            
                            <div className="flex gap-1.5">
                              {p.prediction.suggestedNumbers.map((n: number) => (
                                <div 
                                  key={n} 
                                  className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-800 dark:text-slate-200 shadow-sm group-hover:scale-105 transition-transform"
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

                {/* COLUMN 2: Rapports d'Audit */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <BookOpen size={16} className="text-emerald-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Rapports d'Audit ({reports.length})
                    </h4>
                  </div>
                  {reports.length === 0 ? (
                    <div className="p-6 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">Aucun rapport d'audit disponible.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reports.map(rep => {
                        let hits = 0;
                        if (typeof rep.matches === "number") hits = rep.matches;
                        else if (Array.isArray(rep.matches)) {
                          hits = rep.matches.filter((m) => m.errorType === "Hit").length;
                        }

                        // Determine elegant badge style based on precision
                        let badgeStyle = "bg-slate-500/10 text-slate-500 border-slate-300/20";
                        let badgeLabel = "DÉRIVE";
                        let BadgeIcon = Target;

                        if (hits === 5) {
                          badgeStyle = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
                          badgeLabel = "PARFAIT";
                          BadgeIcon = CheckCircle2;
                        } else if (hits >= 3) {
                          badgeStyle = "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20";
                          badgeLabel = "ÉLITE";
                          BadgeIcon = CheckCircle2;
                        } else if (hits > 0) {
                          badgeStyle = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20";
                          badgeLabel = "PARTIEL";
                          BadgeIcon = Activity;
                        }

                        return (
                          <div 
                            key={rep.id} 
                            onClick={() => {
                              try { audioEngine.play("click"); } catch(e) {}
                              setSelectedReport(rep);
                            }} 
                            className="cursor-pointer group relative flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-emerald-500/50 hover:shadow-md transition-all gap-4"
                          >
                            <div className="flex-1">
                              <span className="text-[10px] font-bold text-slate-400">{formatDateSafely(rep.date)}</span>
                              <div className="flex gap-1.5 mt-2">
                                {rep.combo?.map(n => {
                                  // Highlight hits inside the ball list
                                  const isHit = Array.isArray(rep.matches) && rep.matches.some(m => m.predicted === n && m.errorType === "Hit");
                                  return (
                                    <div 
                                      key={n} 
                                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm transition-transform group-hover:scale-105 ${
                                        isHit 
                                          ? "bg-emerald-500 text-white border border-emerald-400" 
                                          : "bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                      }`}
                                    >
                                      {n}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3">
                                <div className={`px-2 py-1 rounded-lg border text-[9px] font-black flex items-center gap-1 ${badgeStyle}`}>
                                  <BadgeIcon size={10} />
                                  <span>{badgeLabel}</span>
                                </div>
                                <div className="text-right">
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Précision</span>
                                  <span className="font-black text-sm text-emerald-500 dark:text-emerald-400">{hits} / 5</span>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => handleDeleteReport(rep.id, e)} 
                                className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all"
                                title="Supprimer ce rapport d'audit"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "shrinkagedrift" && (
          <div className="space-y-8 animate-slide-up">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="text-emerald-500" size={24} />
                    Audit de Dérive Arithmétique Bayésienne
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Analyse continue de l'estimateur James-Stein et recherche de dérives silencieuses sur les données réelles du passé.
                  </p>
                </div>
                <button
                  onClick={runAudit}
                  disabled={auditing}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-55 shadow-md active:scale-95 transition-all cursor-pointer animate-fade-in"
                >
                  <RefreshCw size={14} className={auditing ? "animate-spin" : ""} />
                  <span>{auditing ? "Analyse en cours..." : "Lancer l'Audit"}</span>
                </button>
              </div>

              {auditing && (
                <div className="p-8 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-400 animate-pulse">
                    Reconstitution chronologique des tirages passés et calcul continu de l'estimateur James-Stein...
                  </p>
                </div>
              )}

              {!auditing && auditResult && (
                <div className="space-y-8 animate-fade-in">
                  
                  {/* CARD DE L'INDICE GLOBAL */}
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-150 dark:border-slate-850 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center font-black text-xl border-4 ${
                        auditResult.integrityIndex >= 85
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500 dark:text-emerald-400"
                          : auditResult.integrityIndex >= 60
                          ? "bg-amber-500/10 text-amber-600 border-amber-500 dark:text-amber-400"
                          : "bg-rose-500/10 text-rose-600 border-rose-500 dark:text-rose-400"
                      }`}>
                        {auditResult.integrityIndex}%
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-wider text-slate-400">Indice d'Intégrité Arithmétique</h4>
                        <span className={`text-xl font-bold ${
                          auditResult.integrityIndex >= 85
                            ? "text-emerald-500"
                            : auditResult.integrityIndex >= 60
                            ? "text-amber-500"
                            : "text-rose-500"
                        }`}>
                          {auditResult.integrityIndex >= 85
                            ? "Excellent alignement bayésien"
                            : auditResult.integrityIndex >= 60
                            ? "Dérive arithmétique modérée"
                            : "Ajustement mathématique urgent requis"}
                        </span>
                      </div>
                    </div>
                    {auditResult.remediationAction && (
                      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 md:max-w-md">
                        💡 {auditResult.remediationAction}
                      </div>
                    )}
                  </div>

                  {/* SECTION DES METRIQUES */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">James-Stein Gain</span>
                        <TrendingUp className="text-indigo-500" size={16} />
                      </div>
                      <span className={`text-2xl font-black ${
                        auditResult.relativeAccuracyGain >= 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}>
                        {auditResult.relativeAccuracyGain >= 0 ? "+" : ""}{auditResult.relativeAccuracyGain.toFixed(2)} rangs
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                        {auditResult.relativeAccuracyGain >= 0
                          ? "La réduction bayésienne améliore l'exactitude de classement des numéros gagnants."
                          : "La réduction bayésienne dégrade les numéros gagnants (dérive d'exactitude active)."}
                      </p>
                    </div>

                    <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Moyenne Facteur B</span>
                        <Gauge className="text-amber-500" size={16} />
                      </div>
                      <span className="text-2xl font-black text-slate-800 dark:text-white">
                        {(auditResult.shrinkageFactorStats.mean * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-400 block mt-1">
                        Rang d'amplitude: [{ (auditResult.shrinkageFactorStats.min * 100).toFixed(1) }% - { (auditResult.shrinkageFactorStats.max * 100).toFixed(1) }%]
                      </span>
                    </div>

                    <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Stabilité de Covariance</span>
                        <Activity className="text-emerald-500" size={16} />
                      </div>
                      <span className="text-2xl font-black text-slate-800 dark:text-white">
                        {auditResult.shrinkageFactorStats.variance.toFixed(4)}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                        Variance du facteur B sur l'échantillon. Une valeur &lt; 0.08 garantit une transition saine sans chaos local.
                      </p>
                    </div>
                  </div>

                  {/* RAPPORT DE DÉRIVES SPÉCIFIQUES */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Détection d'anomalies spécifiques</h4>
                    {auditResult.detectedDrifts.length === 0 ? (
                      <div className="p-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 dark:bg-emerald-500/5 rounded-2xl border border-emerald-500/20 flex items-center gap-3 text-sm font-medium">
                        <CheckCircle2 size={18} />
                        <span>Aucune anomalie d'inférence détectée sur le modèle James-Stein. L'ajustement de réduction bayésienne est sain et stabilisé.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {auditResult.detectedDrifts.map((drift: any, index: number) => (
                          <div key={index} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start gap-3">
                            <ShieldAlert className={`mt-0.5 flex-shrink-0 ${
                              drift.severity === "critical"
                                ? "text-rose-500"
                                : drift.severity === "warning"
                                ? "text-amber-500"
                                : "text-blue-500"
                            }`} size={16} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                                  {drift.type}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                  drift.severity === "critical"
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    : drift.severity === "warning"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                }`}>
                                  {drift.severity}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                                {drift.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
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
