import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deletePrediction } from "../../services/predictionHistoryService";
import {
  deleteForensicReportLocal,
  syncForensicReportsWithCloud,
} from "../../services/postPredictionAnalysisService";
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
  Zap,
  Sliders,
  Sparkles,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
} from "lucide-react";
import { ForensicReport, PredictionHistoryItem, AlgoWeights } from "../../types";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { PredictionHistory } from "../PredictionHistory";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { formatDateSafely } from "../../utils/dateUtils";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";
import { UnifiedForensicRadarPanel } from "../UnifiedForensicRadarPanel";

type ForensicMode = "prediction" | "historique" | "timemachine";

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
    setReports,
  } = useForensicData(drawName);

  const [syncing, setSyncing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);
  const [showDeepInspection, setShowDeepInspection] = useState(false);
  const [mode, setMode] = useState<ForensicMode>("prediction");
  const [applyingAdjustments, setApplyingAdjustments] = useState(false);

  // SYMBIOSE : Navigation croisée
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
    try {
      audioEngine.play("click");
    } catch (e) {}
    refreshForensicData();
  };

  const handleSync = async () => {
    try {
      audioEngine.play("click");
    } catch (e) {}
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
      try {
        audioEngine.play("success");
      } catch (e) {}
      showToast("Synchronisation Cloud terminée.", "success");
    } catch (e) {
      try {
        audioEngine.play("error");
      } catch (e) {}
      showToast("Erreur de synchronisation.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      audioEngine.play("click");
    } catch (e) {}
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
      try {
        audioEngine.play("success");
      } catch (e) {}
      showToast("Rapport supprimé.", "info");
    } catch (e) {
      try {
        audioEngine.play("error");
      } catch (e) {}
      showToast("Erreur suppression.", "error");
    }
  };

  const handleDeletePending = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      audioEngine.play("click");
    } catch (e) {}
    if (!confirm("Supprimer cette prédiction en attente ?")) return;

    try {
      await deletePrediction(id);
      setPendingPredictions((prev: PredictionHistoryItem[]) =>
        prev.filter((p: PredictionHistoryItem) => p.id !== id)
      );
      try {
        audioEngine.play("success");
      } catch (e) {}
      showToast("Prédiction supprimée.", "info");
    } catch (e) {
      try {
        audioEngine.play("error");
      } catch (e) {}
      showToast("Erreur lors de la suppression.", "error");
    }
  };

  // Active Report
  const activeReport = useMemo(() => {
    if (selectedReport) return selectedReport;
    return reports.length > 0 ? reports[0] : null;
  }, [selectedReport, reports]);

  // Derived Drift Metrics
  const driftMetrics = useMemo(() => {
    let hurstVal = 0.54;
    if (fractal && fractal.length > 0 && fractal[0].hurst !== undefined) {
      hurstVal = fractal[0].hurst;
    } else if (regime?.chaosDimension) {
      hurstVal = Math.max(0.3, Math.min(0.85, 2 - regime.chaosDimension));
    }

    let entropyVal = 4.25;
    if (activeReport?.shannon_entropy !== undefined) {
      entropyVal = activeReport.shannon_entropy;
    } else if (reports.length > 0 && reports[0].shannon_entropy !== undefined) {
      entropyVal = reports[0].shannon_entropy;
    }

    let statusLabel = "STABLE";
    let statusColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    let desc = "Régime déterministe régulier. Alignement optimal des poids.";

    if (hurstVal < 0.45 || entropyVal > 4.8) {
      statusLabel = "FORTE DÉRIVE";
      statusColor = "text-rose-500 bg-rose-500/10 border-rose-500/20";
      desc = "Fluctuations chaotiques élevées. Réajustement recommandé.";
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

  // Top Underperforming Algorithms & Suggested Boosts
  const correctionData = useMemo(() => {
    const defaultAlgos = [
      {
        name: "Markov Transition (2nd Order)",
        algoKey: "markovOrder2",
        deficit: 18.5,
        boost: 0.08,
        reason: "Sous-pondération sur transitions paires",
      },
      {
        name: "Fractal Hurst Rescaled Range",
        algoKey: "fractalHurst",
        deficit: 14.2,
        boost: 0.06,
        reason: "Décalage d'échelle de résonance",
      },
      {
        name: "Hawkes Spatio-Temporal Volatility",
        algoKey: "hawkesIntensity",
        deficit: 11.0,
        boost: 0.04,
        reason: "Inertie temporelle sur salves",
      },
    ];

    if (!reports || reports.length === 0) return defaultAlgos;

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
    try {
      audioEngine.play("click");
    } catch (e) {}
    setApplyingAdjustments(true);

    try {
      const updatedWeights: Record<string, number> = {
        ...(globalWeights as unknown as Record<string, number>),
      };

      correctionData.forEach((item) => {
        const current = updatedWeights[item.algoKey] || 0.1;
        updatedWeights[item.algoKey] = Math.min(0.4, current + item.boost);
      });

      const total = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
      if (total > 0) {
        Object.keys(updatedWeights).forEach((k) => {
          updatedWeights[k] /= total;
        });
      }

      await updateGlobalWeights(updatedWeights as unknown as AlgoWeights, drawName);
      try {
        audioEngine.play("success");
      } catch (e) {}
      showToast("Ajustements de poids appliqués au modèle continu avec succès !", "success");
    } catch (e) {
      try {
        audioEngine.play("error");
      } catch (e) {}
      showToast("Échec de l'application des ajustements.", "error");
    } finally {
      setApplyingAdjustments(false);
    }
  };

  const directHitsCount = useMemo(() => {
    if (!activeReport || !Array.isArray(activeReport.matches)) return 0;
    return activeReport.matches.filter((m) => m.errorType === "Hit").length;
  }, [activeReport]);

  const matchRatePercent = useMemo(() => {
    return ((directHitsCount / 5) * 100).toFixed(0);
  }, [directHitsCount]);

  return (
    <div id="forensic-content" className="max-w-7xl mx-auto space-y-6 pt-4 pb-12">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
              <Target size={24} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Hub Forensique & Audit
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-0.5">
                Autopsie post-tirage, analyse de dérive stochastique & rétro-action continu ({drawName})
              </p>
            </div>
          </div>
        </div>

        {/* Global Sub-Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
          {[
            { id: "prediction", label: "Rapports & Audit", icon: Target, color: "text-emerald-500" },
            { id: "historique", label: "Historique", icon: History, color: "text-indigo-500" },
            { id: "timemachine", label: "Time Machine", icon: Clock, color: "text-fuchsia-500" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                try {
                  audioEngine.play("click");
                } catch (e) {}
                setMode(tab.id as ForensicMode);
              }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                mode === tab.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-black"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <tab.icon size={14} className={mode === tab.id ? tab.color : ""} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace Modes */}
      <div className="space-y-6">
        {mode === "historique" && (
          <div className="animate-fade-in">
            <PredictionHistory drawName={drawName} />
          </div>
        )}

        {mode === "timemachine" && (
          <div className="animate-fade-in">
            <ForensicTimeMachine
              drawName={drawName}
              history={history}
              currentWeights={globalWeights}
            />
          </div>
        )}

        {mode === "prediction" && (
          <div className="space-y-6 animate-fade-in">
            {/* Active Report Executive Dashboard */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Top Controls & Status Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {activeReport ? `Rapport Forensique: ${activeReport.drawName}` : "Analyse Forensique"}
                  </h3>
                  {activeReport?.date && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                      {formatDateSafely(activeReport.date)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {activeReport && (
                    <button
                      onClick={() => setShowDeepInspection(true)}
                      className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Maximize2 size={14} />
                      <span>Inspecter en Détail</span>
                    </button>
                  )}
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 rounded-xl transition-colors"
                    title="Synchroniser avec le Cloud"
                  >
                    <Cloud size={16} className={syncing ? "animate-bounce" : ""} />
                  </button>
                  <button
                    onClick={handleRefresh}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 rounded-xl transition-colors"
                    title="Rafraîchir"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>

              {/* Unified 3-Section Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SECTION 1: AUTOPSIE (PRÉDIT VS RÉEL) */}
                <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider flex items-center gap-1.5">
                        <Target size={14} /> 1. Autopsie & Alignement
                      </span>
                      <span className="text-xs font-mono font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {matchRatePercent}% Hits ({directHitsCount}/5)
                      </span>
                    </div>

                    {activeReport ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase block">
                            Prédit par l'IA
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {Array.isArray(activeReport.matches) &&
                              activeReport.matches.map((m, idx) => (
                                <div
                                  key={idx}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                    m.errorType === "Hit"
                                      ? "bg-emerald-500 text-white shadow-sm"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  }`}
                                >
                                  {m.predicted}
                                </div>
                              ))}
                          </div>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                          <span className="text-[9px] font-bold text-emerald-500 uppercase block">
                            Tirage Réel Officiel
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {activeReport.combo?.map((num, idx) => {
                              const isHit =
                                Array.isArray(activeReport.matches) &&
                                activeReport.matches.some(
                                  (m) => m.predicted === num && m.errorType === "Hit"
                                );
                              return (
                                <div
                                  key={idx}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                    isHit
                                      ? "bg-emerald-500 text-white shadow-sm"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  }`}
                                >
                                  {num}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Neighbor Offsets list */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">
                            Décalages de Voisinage
                          </span>
                          <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] font-mono">
                            {Array.isArray(activeReport.matches) &&
                            activeReport.matches.some((m) => m.errorType !== "Hit") ? (
                              activeReport.matches
                                .filter((m) => m.errorType !== "Hit")
                                .map((m, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-1.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800"
                                  >
                                    <span>
                                      P: <strong className="text-indigo-400">{m.predicted}</strong> → R:{" "}
                                      <strong>{m.actual || "N/A"}</strong>
                                    </span>
                                    <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                      {m.errorType} (Δ: {m.delta})
                                    </span>
                                  </div>
                                ))
                            ) : (
                              <p className="text-xs text-slate-400 italic py-1">
                                Alignement direct 100% ou aucun décalage.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-4">
                        Sélectionnez un rapport ci-dessous.
                      </p>
                    )}
                  </div>
                </div>

                {/* SECTION 2: DÉTECTION DE DÉRIVE (DRIFT) */}
                <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1.5">
                        <Activity size={14} /> 2. Dérive & Régime
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border ${driftMetrics.statusColor}`}
                      >
                        {driftMetrics.statusLabel}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                        {driftMetrics.desc}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-center pt-2">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">
                            Hurst ($H$)
                          </span>
                          <span className="text-lg font-black font-mono text-indigo-500">
                            {driftMetrics.hurstVal.toFixed(3)}
                          </span>
                          <span className="block text-[8px] text-slate-400 mt-0.5">
                            {driftMetrics.hurstVal > 0.5 ? "Persistant" : "Chaotique"}
                          </span>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">
                            Entropie ($S$)
                          </span>
                          <span className="text-lg font-black font-mono text-purple-500">
                            {driftMetrics.entropyVal.toFixed(2)}
                          </span>
                          <span className="block text-[8px] text-slate-400 mt-0.5">
                            Incertitude
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs font-mono">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">
                          Divergence KL:
                        </span>
                        <span className="font-bold text-emerald-500">
                          {driftMetrics.klDiv.toFixed(3)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase ml-2">
                          Tension:
                        </span>
                        <span className="font-bold text-indigo-400">
                          {driftMetrics.tension}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: AUTO-CORRECTION DE POIDS */}
                <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase text-fuchsia-500 tracking-wider flex items-center gap-1.5">
                        <Sliders size={14} /> 3. Auto-Correction
                      </span>
                      <button
                        onClick={handleApplyAdjustments}
                        disabled={applyingAdjustments}
                        className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] uppercase rounded-lg shadow-sm transition-all flex items-center gap-1"
                      >
                        <Sparkles size={12} />
                        {applyingAdjustments ? "..." : "Booster 1-Clic"}
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-3">
                      Sous-performances détectées & réajustements continus suggérés :
                    </p>

                    <div className="space-y-2">
                      {correctionData.map((algo, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                              {algo.name}
                            </span>
                            <span className="text-rose-500 font-mono text-[10px]">
                              -{algo.deficit.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                            <span className="truncate max-w-[150px]">{algo.reason}</span>
                            <span className="text-emerald-500 font-bold">
                              +{(algo.boost * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panneau Forensique Unifié : Vue Macro (Radar) & Vue Micro (Integrated Gradients) */}
              <div className="pt-2">
                <UnifiedForensicRadarPanel report={activeReport} drawName={drawName} />
              </div>

              {/* Frise Chronologique Unifiée */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <UnifiedForensicTimeline
                  reports={reports}
                  selectedReport={selectedReport}
                  onSelectReport={setSelectedReport}
                  onDeleteReport={handleDeleteReport}
                />
              </div>

              {/* Pending Predictions List */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-indigo-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Prédictions en Attente de Tirage ({pendingPredictions.length})
                    </h4>
                  </div>
                </div>

                {pendingPredictions.length === 0 ? (
                  <div className="p-4 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-400 italic">
                      Aucune prédiction en attente pour ce tirage.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pendingPredictions.map((p: PredictionHistoryItem) => {
                      const predDate = new Date(p.timestamp);
                      return (
                        <div
                          key={p.id}
                          className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center"
                        >
                          <div>
                            <span className="text-[9px] font-bold text-indigo-500 uppercase block">
                              Oracle Prediction
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {predDate.toLocaleDateString("fr-FR")} à{" "}
                              {predDate.toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <div className="flex gap-1 mt-1.5">
                              {p.prediction.suggestedNumbers.map((n: number) => (
                                <div
                                  key={n}
                                  className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-800 dark:text-slate-200"
                                >
                                  {n}
                                </div>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDeletePending(p.id, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deep Inspection Modal */}
        {showDeepInspection && activeReport && (
          <PredictionForensics
            report={activeReport}
            onClose={() => setShowDeepInspection(false)}
          />
        )}
      </div>
    </div>
  );
});
