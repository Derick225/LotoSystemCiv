import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { saveForensicReport, performForensicAnalysis } from "../../services/postPredictionAnalysisService";
import { PredictionForensics } from "../PredictionForensics";
import { MultiLevelConfusionMatrix } from "../MultiLevelConfusionMatrix";
import { UnifiedForensicRadarPanel } from "../UnifiedForensicRadarPanel";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { ClosedLoopAutopsyPanel } from "../ClosedLoopAutopsyPanel";
import { StorageOptimizationModal } from "../StorageOptimizationModal";
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
  Zap,
  Download,
  ShieldCheck,
  FileText,
  CheckSquare,
  Square,
  Check,
  X,
  AlertTriangle,
  Search,
  ArrowUpDown,
  Database,
  Layers,
} from "lucide-react";
import { ForensicReport, ForensicEvidence } from "../../types";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely } from "../../utils/dateUtils";
import { generateLearningSession, applyForensicAdjustments } from "../../services/forensicTrainingBridge";
import { generateMasterPrediction } from "../../services/predictionEngine";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";

type ForensicTab = "audits" | "closedloop" | "confusion" | "timeline" | "radar" | "timemachine";
type SortOption = "date_desc" | "date_asc" | "hits_desc" | "hits_asc" | "drift_desc";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(
  ({ drawName }) => {
    const { showToast } = useToast();
    const history = useNexusStore((state) => state.history);
    const globalWeights = useNexusStore((state) => state.globalWeights);

    const { 
      reports, 
      pendingPredictions, 
      syncReports, 
      refreshLocal,
      deleteReport,
      deleteReports
    } = useForensicData(drawName);

    const [activeTab, setActiveTab] = useState<ForensicTab>("audits");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [sortBy, setSortBy] = useState<SortOption>("date_desc");
    const [syncing, setSyncing] = useState(false);
    const [isBatchApplying, setIsBatchApplying] = useState(false);
    const [isGeneratingAudit, setIsGeneratingAudit] = useState(false);
    const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(
      null,
    );
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    
    // Lazy-loading a full detailed forensic report
    const handleOpenReport = async (rep: ForensicReport) => {
      audioEngine.play("click");
      try {
        const { getFullForensicReportById } = await import("../../services/storageOptimizationService");
        const full = await getFullForensicReportById(rep.id);
        setSelectedReport(full || rep);
      } catch {
        setSelectedReport(rep);
      }
    };
    
    // Multi-selection state for targeted permanent deletion
    const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDeletingBatch, setIsDeletingBatch] = useState(false);

    const handleExportPDF = async () => {
      try {
        setIsExportingPDF(true);
        audioEngine.play("click");
        const { generateForensicLogPDF } = await import("../../services/exportService");
        
        const items = reports.map((rep) => {
          const matchedDraw = rep.drawResultId ? history.find((h) => h.id === rep.drawResultId) : undefined;
          const actualGagnants = rep.combo || matchedDraw?.gagnants || [];
          const suggested = rep.matches?.map((m) => m.predicted) || [];
          const exactHits = rep.matches ? rep.matches.filter((m) => m.errorType === "Hit").map((m) => m.predicted) : [];
          const nearMisses = rep.matches ? rep.matches.filter((m) => m.errorType === "Voisin").map((m) => m.predicted) : [];

          return {
            timestamp: rep.timestamp ? new Date(rep.timestamp).getTime() : Date.now(),
            suggestedNumbers: suggested,
            confidence: rep.forensicScore || (100 - (rep.suspicionScore || 15)),
            result: actualGagnants.length > 0 ? {
              id: rep.drawResultId || `rep-${rep.id}`,
              drawName,
              date: rep.date || matchedDraw?.date || "Tirage Officiel",
              gagnants: actualGagnants,
            } : null,
            hits: exactHits,
            nearMisses: nearMisses,
            precisionPct: suggested.length > 0 ? (exactHits.length / suggested.length) * 100 : 0,
            analysis: rep.aiAnalysis || "Rapport d'Autopsie Médico-Légale",
          };
        });

        await generateForensicLogPDF({
          drawName,
          items,
        });
        showToast("Forensic Log exporté en PDF avec succès !", "success");
        audioEngine.play("success");
      } catch (err) {
        console.error("PDF Export Error:", err);
        showToast("Erreur lors de l'export PDF du Forensic Log", "error");
      } finally {
        setIsExportingPDF(false);
      }
    };

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
        showToast("Rapports actualisés", "info");
      } catch (e) {
        console.error(e);
      }
    };

    // Suppression définitive d'un rapport individuel
    const handleDeleteReport = async (id: string, predictionId?: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const rep = reports.find(r => r.id === id);
      const repDate = rep ? formatDateSafely(rep.date) : id;
      if (!window.confirm(`Supprimer définitivement le rapport d'autopsie (${repDate}) ?\nCette opération est irréversible.`)) {
        return;
      }
      try {
        audioEngine.play("click");
        await deleteReport(id, predictionId || rep?.predictionId);
        setSelectedReportIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        showToast("Rapport d'autopsie définitivement supprimé", "success");
      } catch (error) {
        console.error("Erreur suppression rapport:", error);
        showToast("Erreur de suppression du rapport", "error");
      }
    };

    // Gestion de la sélection individuelle
    const handleToggleSelectReport = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      audioEngine.play("click");
      setSelectedReportIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    // Tout sélectionner parmi les rapports filtrés
    const handleSelectAllFiltered = () => {
      audioEngine.play("click");
      const ids = new Set(filteredReports.map(r => r.id));
      setSelectedReportIds(ids);
      setIsSelectionMode(true);
    };

    // Désélectionner tout
    const handleDeselectAll = () => {
      audioEngine.play("click");
      setSelectedReportIds(new Set());
    };

    // Suppression définitive de la sélection
    const handleDeleteSelected = async () => {
      const count = selectedReportIds.size;
      if (count === 0) return;
      if (!window.confirm(`Supprimer définitivement les ${count} rapport(s) d'autopsie sélectionné(s) ?\nCette opération est irréversible.`)) {
        return;
      }
      try {
        setIsDeletingBatch(true);
        audioEngine.play("click");
        const itemsToDelete = reports
          .filter(r => selectedReportIds.has(r.id))
          .map(r => ({ id: r.id, predictionId: r.predictionId }));

        await deleteReports(itemsToDelete);
        setSelectedReportIds(new Set());
        setIsSelectionMode(false);
        showToast(`${count} rapport(s) d'autopsie définitivement supprimé(s)`, "success");
      } catch (e) {
        console.error("Erreur suppression groupée:", e);
        showToast("Erreur lors de la suppression groupée", "error");
      } finally {
        setIsDeletingBatch(false);
      }
    };

    // Purge directe des rapports en dérive (0/5)
    const handleDeleteDriftReports = async () => {
      const driftReports = reports.filter((rep) => {
        let hits = 0;
        if (typeof rep.matches === "number") hits = rep.matches;
        else if (Array.isArray(rep.matches)) {
          hits = rep.matches.filter((m) => m.errorType === "Hit").length;
        }
        return hits === 0;
      });

      if (driftReports.length === 0) {
        showToast("Aucun rapport d'autopsie en dérive (0/5) à purger.", "info");
        return;
      }

      if (!window.confirm(`Supprimer définitivement tous les ${driftReports.length} rapports d'autopsie en dérive (0/5) ?`)) {
        return;
      }

      try {
        setIsDeletingBatch(true);
        audioEngine.play("click");
        const items = driftReports.map(r => ({ id: r.id, predictionId: r.predictionId }));
        await deleteReports(items);
        setSelectedReportIds(prev => {
          const next = new Set(prev);
          items.forEach(i => next.delete(i.id));
          return next;
        });
        showToast(`${driftReports.length} rapports en dérive supprimés`, "success");
      } catch (e) {
        console.error("Erreur purge dérives:", e);
        showToast("Erreur lors de la purge des dérives", "error");
      } finally {
        setIsDeletingBatch(false);
      }
    };

    // Autopsie flash mathématique complète du dernier tirage effectif
    const handleFlashAutopsy = async () => {
      const cleanHistory = purifyHistoryForDraw(drawName, history);
      if (cleanHistory.length < 2) {
        showToast("Historique insuffisant pour l'autopsie flash (min 2 tirages requis)", "error");
        return;
      }
      setIsGeneratingAudit(true);
      audioEngine.play("scan");
      try {
        const lastDraw = cleanHistory[0];
        const subHistory = cleanHistory.slice(1);
        const pred = await generateMasterPrediction(
          drawName,
          subHistory,
          Math.min(30, subHistory.length),
          globalWeights
        );
        
        // Exécution de l'autopsie médico-légale continue
        const reportData = await performForensicAnalysis(
          drawName,
          lastDraw.date,
          pred.suggestedNumbers,
          lastDraw.gagnants,
          pred.breakdown,
          `flash-${lastDraw.id || Date.now()}`,
          lastDraw.id,
          true,
          cleanHistory
        );

        await saveForensicReport(reportData);
        await refreshLocal();
        setSelectedReport(reportData);
        showToast("Autopsie Médico-Légale calculée avec succès !", "success");
        audioEngine.play("success");
      } catch (err: any) {
        console.error("Flash autopsy error:", err);
        showToast("Erreur lors du calcul de l'autopsie flash", "error");
      } finally {
        setIsGeneratingAudit(false);
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

        for (const rep of reports.slice(0, 10)) {
          const session = await generateLearningSession(rep, validHistory);
          await applyForensicAdjustments(session, undefined, false);
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

    // Exportation du diagnostic médico-légal en JSON
    const handleExportReports = () => {
      if (reports.length === 0) return;
      audioEngine.play("click");
      const blob = new Blob([JSON.stringify(reports, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `autopsies_${drawName.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Rapports d'autopsies exportés en JSON", "success");
    };

    // Helper to get hit count safely
    const getReportHits = (rep: ForensicReport): number => {
      if (typeof rep.matches === "number") return rep.matches;
      if (Array.isArray(rep.matches)) {
        return rep.matches.filter((m) => m.errorType === "Hit").length;
      }
      return 0;
    };

    // Filtrage et Tri des rapports d'audit
    const filteredReports = useMemo(() => {
      let list = [...reports];

      // Status filter
      if (statusFilter !== "all") {
        list = list.filter((rep) => {
          const hits = getReportHits(rep);
          if (statusFilter === "perfect") return hits === 5;
          if (statusFilter === "elite") return hits >= 3 && hits < 5;
          if (statusFilter === "partial") return hits > 0 && hits < 3;
          if (statusFilter === "drift") return hits === 0;
          return true;
        });
      }

      // Search query (Date or Number search)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        list = list.filter((rep) => {
          const dateMatch = rep.date && rep.date.toLowerCase().includes(q);
          const comboMatch = rep.combo && rep.combo.some(n => String(n) === q);
          const verdictMatch = rep.verdict && rep.verdict.toLowerCase().includes(q);
          return dateMatch || comboMatch || verdictMatch;
        });
      }

      // Sorting
      list.sort((a, b) => {
        if (sortBy === "date_desc") {
          const dateA = new Date(a.date || a.timestamp || 0).getTime();
          const dateB = new Date(b.date || b.timestamp || 0).getTime();
          return dateB - dateA;
        }
        if (sortBy === "date_asc") {
          const dateA = new Date(a.date || a.timestamp || 0).getTime();
          const dateB = new Date(b.date || b.timestamp || 0).getTime();
          return dateA - dateB;
        }
        if (sortBy === "hits_desc") {
          return getReportHits(b) - getReportHits(a);
        }
        if (sortBy === "hits_asc") {
          return getReportHits(a) - getReportHits(b);
        }
        if (sortBy === "drift_desc") {
          const driftA = a.divergenceMetric ?? 0;
          const driftB = b.divergenceMetric ?? 0;
          return driftB - driftA;
        }
        return 0;
      });

      return list;
    }, [reports, statusFilter, searchQuery, sortBy]);

    // KPI Summary
    const stats = useMemo(() => {
      if (reports.length === 0) return { avgHits: 0, totalAudits: 0, perfectRate: 0, driftCount: 0 };
      let driftCount = 0;
      const totalHits = reports.reduce((acc, rep) => {
        const h = getReportHits(rep);
        if (h === 0) driftCount++;
        return acc + h;
      }, 0);
      const perfects = reports.filter((r) => getReportHits(r) === 5).length;

      return {
        avgHits: totalHits / reports.length,
        totalAudits: reports.length,
        perfectRate: (perfects / reports.length) * 100,
        driftCount,
      };
    }, [reports]);

    return (
      <div className="w-full space-y-8 animate-fade-in pb-16 font-sans">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <BookOpen size={18} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">
                Post-Mortem & Confrontation Réelle
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
              Autopsies & Rapports Médico-Légaux
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Tirage actif : <strong className="text-emerald-400">{drawName}</strong> • Rétro-propagation d'erreurs, calibration de distribution & traçabilité intégrale
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-flash-autopsy"
              onClick={handleFlashAutopsy}
              disabled={isGeneratingAudit}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Zap size={14} className={isGeneratingAudit ? "animate-spin" : ""} />
              <span>{isGeneratingAudit ? "Analyse..." : "Autopsie Flash"}</span>
            </button>

            <button
              id="btn-retro-propagation"
              onClick={handleGlobalRetroPropagation}
              disabled={isBatchApplying || reports.length === 0}
              className="px-3.5 py-2.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 rounded-xl text-xs font-bold transition-all border border-cyan-800/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Rétro-propager les erreurs de prédiction sur l'ADN du modèle"
            >
              <Cpu size={14} className={isBatchApplying ? "animate-spin" : ""} />
              <span>{isBatchApplying ? "Propagation..." : "Rétro-Propagation"}</span>
            </button>

            <button
              id="btn-export-json"
              onClick={handleExportReports}
              disabled={reports.length === 0}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Exporter les autopsies en JSON"
            >
              <Download size={14} />
              <span>JSON</span>
            </button>

            <button
              id="btn-export-pdf"
              onClick={handleExportPDF}
              disabled={isExportingPDF || reports.length === 0}
              className="px-3.5 py-2.5 bg-fuchsia-950/60 hover:bg-fuchsia-900/60 text-fuchsia-300 rounded-xl text-xs font-bold transition-all border border-fuchsia-800/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Exporter le Forensic Log complet en PDF"
            >
              <FileText size={14} />
              <span>{isExportingPDF ? "PDF..." : "PDF"}</span>
            </button>

            <button
              id="btn-storage-opt"
              onClick={() => {
                audioEngine.play("click");
                setIsStorageModalOpen(true);
              }}
              className="px-3.5 py-2.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 rounded-xl text-xs font-bold transition-all border border-indigo-800/40 flex items-center gap-1.5 cursor-pointer"
              title="Audit de Cohérence & Compression Différentielle IndexedDB"
            >
              <Database size={14} />
              <span>Audit & Stockage</span>
            </button>

            <button
              id="btn-sync-cloud"
              onClick={handleSync}
              disabled={syncing}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
              title="Synchroniser avec le cloud"
            >
              <Cloud size={16} className={syncing ? "animate-spin text-indigo-400" : ""} />
            </button>

            <button
              id="btn-refresh-reports"
              onClick={handleRefresh}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
              title="Rafraîchir"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* KPI QUICK BANNER */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Total Autopsies</span>
            <span className="text-2xl font-black font-mono text-white mt-1">
              {stats.totalAudits}
            </span>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Moyenne Concordance</span>
            <span className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {stats.avgHits.toFixed(2)} / 5
            </span>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Prédictions en Attente</span>
            <span className="text-2xl font-black font-mono text-indigo-400 mt-1">
              {pendingPredictions.length}
            </span>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Taux Parfait (5/5)</span>
            <span className="text-2xl font-black font-mono text-teal-400 mt-1">
              {stats.perfectRate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
          {[
            { id: "audits", label: "Autopsies & Rapports", icon: BookOpen, count: reports.length },
            { id: "closedloop", label: "Boucle Fermée & Auto-Correction", icon: Zap },
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
                  audioEngine.play("click");
                  setActiveTab(tab.id as ForensicTab);
                }}
                className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-500"
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
            {/* Search, Status Filter Badges & Management Tools */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
              {/* Filter pills & Search input */}
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <div className="relative min-w-[180px] max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher date ou numéro..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 text-white placeholder-slate-500 rounded-xl border border-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: "all", label: "Tous" },
                    { id: "perfect", label: "Parfait (5/5)" },
                    { id: "elite", label: "Élite (≥3/5)" },
                    { id: "partial", label: "Partiel (1-2/5)" },
                    { id: "drift", label: "Dérive (0/5)" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        audioEngine.play("click");
                        setStatusFilter(f.id);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        statusFilter === f.id
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 border border-slate-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sorting & Action Tools: Selection Mode & Direct Purge */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sorting Select */}
                <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                  <ArrowUpDown size={12} className="text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="bg-transparent text-slate-300 text-[10px] font-bold uppercase focus:outline-none cursor-pointer"
                  >
                    <option value="date_desc" className="bg-slate-900">Plus récent</option>
                    <option value="date_asc" className="bg-slate-900">Plus ancien</option>
                    <option value="hits_desc" className="bg-slate-900">Hits Max</option>
                    <option value="hits_asc" className="bg-slate-900">Hits Min</option>
                    <option value="drift_desc" className="bg-slate-900">Dérive Max</option>
                  </select>
                </div>

                {/* Purge drift button if drifts exist */}
                {stats.driftCount > 0 && (
                  <button
                    onClick={handleDeleteDriftReports}
                    disabled={isDeletingBatch}
                    className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Supprimer définitivement tous les rapports sans aucun numéro gagnant (0/5)"
                  >
                    <Trash2 size={12} />
                    <span>Purger Dérives ({stats.driftCount})</span>
                  </button>
                )}

                {/* Toggle selection mode */}
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setIsSelectionMode(prev => !prev);
                    if (isSelectionMode) {
                      setSelectedReportIds(new Set());
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                    isSelectionMode || selectedReportIds.size > 0
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                  }`}
                >
                  <CheckSquare size={12} />
                  <span>{isSelectionMode ? "Quitter Sélection" : "Sélectionner"}</span>
                </button>

                <span className="text-xs text-slate-400 font-mono pl-2 border-l border-slate-800">
                  {filteredReports.length} / {reports.length}
                </span>
              </div>
            </div>

            {/* BATCH ACTION BANNER (When at least 1 report is selected) */}
            {(selectedReportIds.size > 0 || isSelectionMode) && (
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-3 animate-fade-in shadow-xl shadow-indigo-950/20">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg">
                    <CheckSquare size={16} />
                  </span>
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    {selectedReportIds.size} rapport{selectedReportIds.size > 1 ? "s" : ""} sélectionné{selectedReportIds.size > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedReportIds.size < filteredReports.length ? (
                    <button
                      onClick={handleSelectAllFiltered}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
                    >
                      Tout sélectionner ({filteredReports.length})
                    </button>
                  ) : (
                    <button
                      onClick={handleDeselectAll}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
                    >
                      Désélectionner tout
                    </button>
                  )}

                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedReportIds.size === 0 || isDeletingBatch}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                    <span>Supprimer la sélection ({selectedReportIds.size})</span>
                  </button>
                </div>
              </div>
            )}

            {/* Grid of Report Cards */}
            {filteredReports.length === 0 ? (
              <div className="p-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-center space-y-3">
                <FileText size={32} className="mx-auto text-slate-600" />
                <p className="text-xs text-slate-400">
                  Aucun rapport d'autopsie correspondant aux filtres. Lancez une "Autopsie Flash" pour confronter la prédiction au dernier résultat réel.
                </p>
                <button
                  onClick={handleFlashAutopsy}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Exécuter une Autopsie Immédiate
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredReports.map((rep) => {
                  const isSelected = selectedReportIds.has(rep.id);
                  const hits = getReportHits(rep);

                  let badgeStyle = "bg-slate-800 text-slate-400 border-slate-700";
                  let badgeLabel = "DÉRIVE";
                  let BadgeIcon = Target;

                  if (hits === 5) {
                    badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    badgeLabel = "PARFAIT (5/5)";
                    BadgeIcon = CheckCircle2;
                  } else if (hits >= 3) {
                    badgeStyle = "bg-teal-500/10 text-teal-400 border-teal-500/20";
                    badgeLabel = `ÉLITE (${hits}/5)`;
                    BadgeIcon = CheckCircle2;
                  } else if (hits > 0) {
                    badgeStyle = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                    badgeLabel = `PARTIEL (${hits}/5)`;
                    BadgeIcon = Activity;
                  }

                  return (
                    <div
                      key={rep.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          handleToggleSelectReport(rep.id);
                        } else {
                          handleOpenReport(rep);
                        }
                      }}
                      className={`cursor-pointer group flex flex-col p-5 bg-slate-900/60 border rounded-3xl transition-all gap-4 justify-between relative ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/50"
                          : "border-slate-800 hover:border-indigo-500/50 hover:shadow-xl"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          {/* Selection Checkbox & Date */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => handleToggleSelectReport(rep.id, e)}
                              className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                                  : "border-slate-700 bg-slate-800/80 text-transparent hover:border-slate-500"
                              }`}
                              title={isSelected ? "Désélectionner" : "Sélectionner pour suppression"}
                            >
                              <Check size={12} className={isSelected ? "opacity-100" : "opacity-0"} />
                            </button>
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              {formatDateSafely(rep.date)}
                            </span>
                          </div>

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
                                    ? "bg-emerald-500 text-white shadow-emerald-500/30"
                                    : "bg-slate-800 border border-slate-700 text-slate-300"
                                }`}
                              >
                                {n}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Metric Bar & Delete button */}
                      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                        <div className="flex items-center gap-3 text-[10px]">
                          <div>
                            <span className="block text-slate-500 uppercase tracking-wider text-[9px]">Stabilité</span>
                            <span className="font-bold text-slate-200 font-mono">
                              {rep.postMortemStabilityScore ?? rep.forensicScore ?? 85}%
                            </span>
                          </div>
                          <div>
                            <span className="block text-slate-500 uppercase tracking-wider text-[9px]">RMSE</span>
                            <span className="font-bold text-slate-200 font-mono">
                              {rep.rmse?.toFixed(1) ?? "N/A"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteReport(rep.id, rep.predictionId, e)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-xl transition-all cursor-pointer"
                          title="Supprimer définitivement ce rapport d'autopsie"
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

        {/* TAB 1.5: CLOSED LOOP AUTOPSY & DNA AUTO-CORRECTION */}
        {activeTab === "closedloop" && (
          <ClosedLoopAutopsyPanel drawName={drawName} />
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
            onDeleteReport={(id, e) => {
              const rep = reports.find((r) => r.id === id);
              handleDeleteReport(id, rep?.predictionId, e);
            }}
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
            onDelete={(id) => {
              deleteReport(id, selectedReport.predictionId);
              setSelectedReport(null);
            }}
          />
        )}

        {/* MODAL AUDIT DE COHÉRENCE & STOCKAGE INDEXEDDB */}
        <StorageOptimizationModal
          drawName={drawName}
          isOpen={isStorageModalOpen}
          onClose={() => setIsStorageModalOpen(false)}
          onDataChanged={() => {
            refreshLocal();
          }}
        />
      </div>
    );
  },
);

