import React, { useState, useEffect } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deletePrediction } from "../../services/predictionHistoryService";
import { deleteForensicReportLocal, syncForensicReportsWithCloud } from "../../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../../services/syncService";
import { PredictionForensics } from "../PredictionForensics";
import { Target, Trash2, RefreshCw, Cloud, History, Clock, ShieldAlert, CheckCircle2, TrendingUp, Gauge } from "lucide-react";
import { ForensicReport, PredictionHistoryItem } from "../../types";
import { useForensicData } from '../../hooks/useForensicData';
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { PredictionHistory } from "../PredictionHistory";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { formatDateSafely } from "../../utils/dateUtils";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";

type ForensicMode = "prediction" | "historique" | "timemachine" | "shrinkagedrift" | "neuralfeedback";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
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
              { id: "prediction", label: "Rapports & Audit", icon: Target, color: "text-slate-900 dark:text-white" },
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



        {selectedReport && (
          <PredictionForensics report={selectedReport} onClose={() => setSelectedReport(null)} />
        )}
      </div>
    </div>
  );
});
