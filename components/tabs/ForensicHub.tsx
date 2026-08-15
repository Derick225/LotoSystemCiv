import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deleteForensicReportLocal } from "../../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../../services/syncService";
import { PredictionForensics } from "../PredictionForensics";
import { MultiLevelConfusionMatrix } from "../MultiLevelConfusionMatrix";
import { UnifiedForensicRadarPanel } from "../UnifiedForensicRadarPanel";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import {
  Target,
  Trash2,
  RefreshCw,
  Cloud,
  BookOpen,
  Activity,
  CheckCircle2,
  Compass,
  Radar,
  Clock,
  Cpu,
  Sparkles,
  Sliders,
  Filter,
} from "lucide-react";
import { ForensicReport } from "../../types";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely } from "../../utils/dateUtils";
import { generateLearningSession, applyForensicAdjustments } from "../../services/forensicTrainingBridge";

type ForensicTab = "audits" | "confusion" | "timeline" | "radar" | "timemachine";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(
  ({ drawName }) => {
    const { showToast } = useToast();
    const history = useNexusStore((state) => state.history);
    const globalWeights = useNexusStore((state) => state.globalWeights);

    const { reports, pendingPredictions, syncReports, refreshLocal } =
      useForensicData(drawName);

    const [activeTab, setActiveTab] = useState<ForensicTab>("audits");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [syncing, setSyncing] = useState(false);
    const [isBatchApplying, setIsBatchApplying] = useState(false);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(
      null,
    );

    const handleSync = async () => {
      try {
        audioEngine.play("click");
        setSyncing(true);
        await syncReports();
        showToast("Synchronisation cloud terminée", "success");
      } catch (e) {
        showToast("Échec de synchronisation", "error");
      } finally {
        setSyncing(false);
      }
    };

    const handleRefresh = async () => {
      try {
        audioEngine.play("click");
        await refreshLocal();
      } catch (e) {
        console.error(e);
      }
    };

    const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("Supprimer ce rapport d'audit ?")) return;
      try {
        audioEngine.play("success");
        await deleteForensicReportLocal(id);
        await deleteForensicReportCloud(id);
        showToast("Rapport supprimé", "success");
        refreshLocal();
      } catch (error) {
        showToast("Erreur de suppression", "error");
      }
    };

    // Rétro-propagation globale des ajustements forensiques sur le modèle
    const handleGlobalRetroPropagation = async () => {
      if (reports.length === 0) {
        showToast("Aucun rapport disponible pour la rétro-propagation", "error");
        return;
      }
      try {
        setIsBatchApplying(true);
        audioEngine.play("click");
        const currentHistory = history.filter((d) => d.drawName === drawName);
        const validHistory = currentHistory.length > 0 ? currentHistory : history;

        let lastSession = null;
        for (const rep of reports.slice(0, 10)) {
          const session = await generateLearningSession(rep, validHistory);
          await applyForensicAdjustments(session, undefined, false);
          lastSession = session;
        }

        showToast("Rétro-propagation consolidée effectuée avec succès !", "success");
        audioEngine.play("success");
      } catch (e) {
        console.error("Batch retro-propagation error:", e);
        showToast("Erreur lors de la rétro-propagation", "error");
      } finally {
        setIsBatchApplying(false);
      }
    };

    // Filtrage des rapports d'audit
    const filteredReports = useMemo(() => {
      if (statusFilter === "all") return reports;
      return reports.filter((rep) => {
        let hits = 0;
        if (typeof rep.matches === "number") hits = rep.matches;
        else if (Array.isArray(rep.matches)) {
          hits = rep.matches.filter((m) => m.errorType === "Hit").length;
        }
        if (statusFilter === "perfect") return hits === 5;
        if (statusFilter === "elite") return hits >= 3 && hits < 5;
        if (statusFilter === "partial") return hits > 0 && hits < 3;
        if (statusFilter === "drift") return hits === 0;
        return true;
      });
    }, [reports, statusFilter]);

    // KPI Summary
    const stats = useMemo(() => {
      if (reports.length === 0) return { avgHits: 0, totalAudits: 0, perfectRate: 0 };
      const totalHits = reports.reduce((acc, rep) => {
        let h = 0;
        if (typeof rep.matches === "number") h = rep.matches;
        else if (Array.isArray(rep.matches)) {
          h = rep.matches.filter((m) => m.errorType === "Hit").length;
        }
        return acc + h;
      }, 0);
      const perfects = reports.filter((r) => {
        let h = typeof r.matches === "number" ? r.matches : (Array.isArray(r.matches) ? r.matches.filter((m) => m.errorType === "Hit").length : 0);
        return h === 5;
      }).length;

      return {
        avgHits: totalHits / reports.length,
        totalAudits: reports.length,
        perfectRate: (perfects / reports.length) * 100,
      };
    }, [reports]);

    return (
      <div className="w-full h-full flex flex-col p-4 md:p-8 animate-fade-in custom-scrollbar overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full space-y-6">
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl ring-1 ring-emerald-500/20">
                <Target size={26} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                    Laboratoire Forensique & Diagnostic Post-Mortem
                  </h1>
                  <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-500/20">
                    {drawName}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Autopsie balistique, matrice de confusion multi-niveaux et rétro-propagation des erreurs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleGlobalRetroPropagation}
                disabled={isBatchApplying || reports.length === 0}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Rétro-propager les déviations forensiques aux poids de l'IA"
              >
                <Cpu size={14} className={isBatchApplying ? "animate-spin" : ""} />
                <span>{isBatchApplying ? "Rétro-Propagation..." : "Rétro-Propagation"}</span>
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 rounded-xl transition-colors"
                title="Synchroniser avec le Cloud"
              >
                <Cloud size={16} className={syncing ? "animate-bounce" : ""} />
              </button>
              <button
                onClick={handleRefresh}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 rounded-xl transition-colors"
                title="Rafraîchir"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* KPI QUICK BANNER */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Audits</span>
              <span className="text-xl font-black font-mono text-slate-800 dark:text-white mt-1">
                {stats.totalAudits}
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Moyenne Concordance</span>
              <span className="text-xl font-black font-mono text-emerald-500 mt-1">
                {stats.avgHits.toFixed(2)} / 5
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Prédictions en Attente</span>
              <span className="text-xl font-black font-mono text-indigo-500 mt-1">
                {pendingPredictions.length}
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Taux Parfait (5/5)</span>
              <span className="text-xl font-black font-mono text-teal-500 mt-1">
                {stats.perfectRate.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* SUB-NAVIGATION TABS */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
            {[
              { id: "audits", label: "Autopsies & Rapports", icon: BookOpen, count: reports.length },
              { id: "confusion", label: "Matrice de Proximité & Confusion", icon: Compass },
              { id: "timeline", label: "Frise Chronologique", icon: Activity },
              { id: "radar", label: "Radar Macro/Micro & SHAP", icon: Radar },
              { id: "timemachine", label: "Time Machine & OOS", icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    try {
                      audioEngine.play("click");
                    } catch (e) {}
                    setActiveTab(tab.id as ForensicTab);
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md"
                      : "bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-mono ${
                      isActive ? "bg-white/20 text-white dark:bg-black/20 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: AUDITS & RAPPORTS */}
          {activeTab === "audits" && (
            <div className="space-y-6">
              {/* Pending predictions banner */}
              {pendingPredictions.length > 0 && (
                <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-rose-500 animate-pulse" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-rose-500">
                        {pendingPredictions.length} Prédiction(s) en attente de confrontation réelle
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Les résultats réels associés ont été identifiés. Cliquez pour exécuter immédiatement l'autopsie.
                    </p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-xs uppercase tracking-widest rounded-xl transition-colors border border-rose-500/30 whitespace-nowrap cursor-pointer"
                  >
                    Exécuter l'Autopsie
                  </button>
                </div>
              )}

              {/* Status Filter Badges */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                    <Filter size={12} /> Filtre :
                  </span>
                  {[
                    { id: "all", label: "Tous" },
                    { id: "perfect", label: "Parfait (5/5)" },
                    { id: "elite", label: "Élite (≥3/5)" },
                    { id: "partial", label: "Partiel (1-2/5)" },
                    { id: "drift", label: "Dérive (0/5)" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        statusFilter === f.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {filteredReports.length} / {reports.length} rapports
                </span>
              </div>

              {/* Grid of Report Cards */}
              {filteredReports.length === 0 ? (
                <div className="p-8 bg-slate-50/50 dark:bg-slate-900/10 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    Aucun rapport d'audit correspondant aux filtres.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredReports.map((rep) => {
                    let hits = 0;
                    if (typeof rep.matches === "number") hits = rep.matches;
                    else if (Array.isArray(rep.matches)) {
                      hits = rep.matches.filter((m) => m.errorType === "Hit").length;
                    }

                    let badgeStyle = "bg-slate-500/10 text-slate-500 border-slate-300/20";
                    let badgeLabel = "DÉRIVE";
                    let BadgeIcon = Target;

                    if (hits === 5) {
                      badgeStyle = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
                      badgeLabel = "PARFAIT (5/5)";
                      BadgeIcon = CheckCircle2;
                    } else if (hits >= 3) {
                      badgeStyle = "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20";
                      badgeLabel = `ÉLITE (${hits}/5)`;
                      BadgeIcon = CheckCircle2;
                    } else if (hits > 0) {
                      badgeStyle = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20";
                      badgeLabel = `PARTIEL (${hits}/5)`;
                      BadgeIcon = Activity;
                    }

                    return (
                      <div
                        key={rep.id}
                        onClick={() => {
                          try {
                            audioEngine.play("click");
                          } catch (e) {}
                          setSelectedReport(rep);
                        }}
                        className="cursor-pointer group flex flex-col p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl hover:border-indigo-500/50 hover:shadow-lg transition-all gap-4 justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              {formatDateSafely(rep.date)}
                            </span>
                            <div className={`px-2.5 py-1 rounded-xl border text-[9px] font-black flex items-center gap-1 ${badgeStyle}`}>
                              <BadgeIcon size={11} />
                              <span>{badgeLabel}</span>
                            </div>
                          </div>

                          {/* Combo Balls */}
                          <div className="flex gap-1.5 flex-wrap mt-3">
                            {rep.combo?.map((n) => {
                              const isHit =
                                Array.isArray(rep.matches) &&
                                rep.matches.some((m) => m.predicted === n && m.errorType === "Hit");
                              return (
                                <div
                                  key={n}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm transition-transform group-hover:scale-105 font-mono ${
                                    isHit
                                      ? "bg-emerald-500 text-white border-transparent shadow-emerald-500/30"
                                      : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  {n}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Metric Bar & Delete */}
                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                          <div className="flex items-center gap-3 text-[10px]">
                            <div>
                              <span className="block text-slate-400 uppercase tracking-wider text-[9px]">Stabilité</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                                {rep.postMortemStabilityScore ?? rep.forensicScore ?? 85}%
                              </span>
                            </div>
                            <div>
                              <span className="block text-slate-400 uppercase tracking-wider text-[9px]">RMSE</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                                {rep.rmse?.toFixed(1) ?? "N/A"}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteReport(rep.id, e)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                            title="Supprimer ce rapport"
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
          )}

          {/* TAB 2: MATRICE DE CONFUSION & PROXIMITÉ */}
          {activeTab === "confusion" && (
            <MultiLevelConfusionMatrix
              reports={reports}
              drawName={drawName}
              onSelectReport={(rep) => setSelectedReport(rep)}
            />
          )}

          {/* TAB 3: FRISE CHRONOLOGIQUE */}
          {activeTab === "timeline" && (
            <UnifiedForensicTimeline
              reports={reports}
              selectedReport={selectedReport}
              onSelectReport={(rep) => setSelectedReport(rep)}
              onDeleteReport={handleDeleteReport}
            />
          )}

          {/* TAB 4: RADAR MACRO/MICRO & ATTRIBUTION SHAP */}
          {activeTab === "radar" && (
            <UnifiedForensicRadarPanel
              report={selectedReport || reports[0] || null}
              drawName={drawName}
            />
          )}

          {/* TAB 5: TIME MACHINE & SIMULATION HISTORIQUE */}
          {activeTab === "timemachine" && (
            <ForensicTimeMachine
              drawName={drawName}
              history={history}
              currentWeights={globalWeights}
            />
          )}

          {/* MODAL DETAILED AUTOPSY REPORT */}
          {selectedReport && (
            <PredictionForensics
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
            />
          )}
        </div>
      </div>
    );
  },
);
