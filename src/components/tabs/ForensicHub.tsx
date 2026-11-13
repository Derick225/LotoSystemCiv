import React, { useState, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { saveForensicReport, performForensicAnalysis } from "../../services/postPredictionAnalysisService";
import { PredictionForensics } from "../PredictionForensics";
import { MultiLevelConfusionMatrix } from "../MultiLevelConfusionMatrix";
import { UnifiedForensicRadarPanel } from "../UnifiedForensicRadarPanel";
import { UnifiedForensicTimeline } from "../UnifiedForensicTimeline";
import { ForensicTimeMachine } from "../ForensicTimeMachine";
import { ClosedLoopAutopsyPanel } from "../ClosedLoopAutopsyPanel";
import { StorageOptimizationModal } from "../StorageOptimizationModal";
import { StochasticEntropyPanel } from "../forensic/StochasticEntropyPanel";
import { DnaReferenceAuditor } from "../genomic/DnaReferenceAuditor";
import { SubAlgorithmDriftHeatmap } from "../genomic/SubAlgorithmDriftHeatmap";
import { ExpertBiasAdjuster } from "../genomic/ExpertBiasAdjuster";
import { NeuralSelfOptimizationPanel } from "../genomic/NeuralSelfOptimizationPanel";
import { UnifiedDnaSieveRadar } from "../genomic/UnifiedDnaSieveRadar";
import { ForensicAuditLogsView } from "../genomic/ForensicAuditLogsView";
import { DrawDnaHistoryViewer } from "../prediction/DrawDnaHistoryViewer";
import { DnaGeneSequencerPanel } from "../genomic/DnaGeneSequencerPanel";
import {
  BookOpen,
  Activity,
  Compass,
  Radar,
  Clock,
  Zap,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Dna,
  Flame,
  BrainCircuit,
  Sliders,
} from "lucide-react";
import {
  buildUnifiedForensicScenario,
  exportUnifiedScenarioToJSON,
  importUnifiedScenarioFromJSON,
  reinjectScenarioIntoState,
  extractMathProofMetadata,
} from "../../services/forensic/forensicProofStandard";
import { ForensicReport } from "../../types";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely } from "../../utils/dateUtils";
import { runUnifiedDnaGeneSequencer } from "../../services/prediction/dnaGeneSequenceService";
import { generateMasterPrediction } from "../../services/prediction/predictionFacade";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { ForensicHubHeader } from "../forensic/ForensicHubHeader";
import { ForensicKpiBanner, ForensicKpiStats } from "../forensic/ForensicKpiBanner";
import { ForensicAutopsyTable } from "../forensic/ForensicAutopsyTable";

type ForensicTab = "audits" | "closedloop" | "dna_drift" | "matrices_entropy" | "timemachine";

// ── Confirmation Modal interne (remplace window.confirm) ──
const ConfirmModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;
  const btnColor =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
      : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30";
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span
            className={`p-2.5 rounded-xl ${
              variant === "danger" ? "bg-rose-500/10 text-rose-400" : "bg-indigo-500/10 text-indigo-400"
            }`}
          >
            <AlertTriangle size={20} />
          </span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">{title}</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{message}</p>
        <div className="flex items-center gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg cursor-pointer active:scale-95 ${btnColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Helper mathématiques déterministes (zéro nombre magique) ──
const computeMedian = (sorted: number[]): number => {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const computeStdDev = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const computeHitsTrend = (
  reportsChronological: ForensicReport[],
  getHits: (r: ForensicReport) => number
): number => {
  if (reportsChronological.length < 3) return 0;
  const n = reportsChronological.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = getHits(reportsChronological[i]);
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return 2 / (1 + Math.exp(-5 * slope)) - 1;
};

const computeRetroPropDepth = (
  reports: ForensicReport[],
  getHits: (r: ForensicReport) => number
): number => {
  const n = reports.length;
  if (n === 0) return 0;
  const hits = reports.map(getHits);
  const mean = hits.reduce((a, b) => a + b, 0) / n;
  const sigma = computeStdDev(hits, mean);
  const maxSigma = 2.5;
  const depth = Math.ceil(Math.sqrt(n) * (1 + sigma / maxSigma));
  return Math.min(n, Math.max(3, depth));
};

export const ForensicHub: React.FC<{
  drawName: string;
  initialTab?: string;
  initialSubView?: string;
}> = React.memo(({ drawName, initialTab, initialSubView }) => {
  const { showToast } = useToast();
  const navigateToModule = useNexusStore((state) => state.navigateToModule);
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);
  const activeSubTab = useNexusStore((state) => state.activeSubTab);

  const { reports, pendingPredictions, syncReports, refreshLocal, deleteReport, deleteReports } =
    useForensicData(drawName);

  const [activeTab, setActiveTab] = useState<ForensicTab>(() => {
    if (
      initialTab === "dna_drift" ||
      initialTab === "dna_history" ||
      initialTab === "DNA_AUDITOR" ||
      initialTab === "DRIFT_HEATMAP" ||
      initialTab === "history_dna"
    ) {
      return "dna_drift";
    }
    return "audits";
  });

  const [auditSubView, setAuditSubView] = useState<"table" | "logs">("table");
  const [closedLoopSubView, setClosedLoopSubView] = useState<"autopsy" | "neural_opt" | "expert_bias">(
    "autopsy"
  );
  const [dnaSubView, setDnaSubView] = useState<
    "reference" | "gene_sequencer" | "drift_heatmap" | "sieve_radar" | "history_dna"
  >(() => {
    if (initialSubView === "gene_sequencer" || initialTab === "GENE_SEQUENCER") {
      return "gene_sequencer";
    }
    if (initialSubView === "history_dna" || initialTab === "dna_history" || initialTab === "history_dna") {
      return "history_dna";
    }
    if (initialTab === "DRIFT_HEATMAP") return "drift_heatmap";
    if (initialTab === "SIEVE_RADAR") return "sieve_radar";
    return "reference";
  });
  const [matrixSubView, setMatrixSubView] = useState<"confusion" | "entropy" | "radar" | "timeline">(
    "confusion"
  );

  // Écoute des sous-onglets globaux ou navigation externe
  React.useEffect(() => {
    if (!activeSubTab) return;
    const sub = activeSubTab.toUpperCase();
    if (sub === "DNA_AUDITOR" || sub === "DNA") {
      setActiveTab("dna_drift");
      setDnaSubView("reference");
    } else if (sub === "GENE_SEQUENCER" || sub === "SEQUENCER" || sub === "EPIGENOME") {
      setActiveTab("dna_drift");
      setDnaSubView("gene_sequencer");
    } else if (
      sub === "FUSION" ||
      sub === "MODEL_FUSION" ||
      sub === "TRIPARTITE_FUSION" ||
      sub === "DARWIN" ||
      sub === "LINEAGE" ||
      sub === "DNA_LINEAGE" ||
      sub === "GENEALOGIE"
    ) {
      navigateToModule("admin", "fusion");
    } else if (sub === "DRIFT_HEATMAP" || sub === "HEATMAP" || sub === "DRIFT" || sub === "DNA_DRIFT") {
      setActiveTab("dna_drift");
      setDnaSubView("drift_heatmap");
    } else if (sub === "SIEVE_RADAR" || sub === "RADAR") {
      setActiveTab("dna_drift");
      setDnaSubView("sieve_radar");
    } else if (
      sub === "HISTORY_DNA" ||
      sub === "DNA_HISTORY" ||
      sub === "DNAHISTORY" ||
      sub === "WINNING_DNA" ||
      sub === "DNA_TIRAGES"
    ) {
      setActiveTab("dna_drift");
      setDnaSubView("history_dna");
    } else if (sub === "NEURAL_OPT" || sub === "NEURAL") {
      setActiveTab("closedloop");
      setClosedLoopSubView("neural_opt");
    } else if (sub === "EXPERT_BIAS" || sub === "BIAS") {
      setActiveTab("closedloop");
      setClosedLoopSubView("expert_bias");
    } else if (sub === "AUTOPSY" || sub === "CLOSEDLOOP") {
      setActiveTab("closedloop");
      setClosedLoopSubView("autopsy");
    } else if (sub === "FORENSIC_LOGS" || sub === "LOGS") {
      setActiveTab("audits");
      setAuditSubView("logs");
    } else if (sub === "PREDICTION" || sub === "AUDITS" || sub === "TABLE") {
      setActiveTab("audits");
      setAuditSubView("table");
    } else if (sub === "CONFUSION") {
      setActiveTab("matrices_entropy");
      setMatrixSubView("confusion");
    } else if (sub === "ENTROPY") {
      setActiveTab("matrices_entropy");
      setMatrixSubView("entropy");
    } else if (sub === "TIMELINE") {
      setActiveTab("matrices_entropy");
      setMatrixSubView("timeline");
    } else if (sub === "TIMEMACHINE") {
      setActiveTab("timemachine");
    }
  }, [activeSubTab, navigateToModule]);

  const [syncing, setSyncing] = useState<boolean>(false);
  const [isBatchApplying, setIsBatchApplying] = useState<boolean>(false);
  const [isGeneratingAudit, setIsGeneratingAudit] = useState<boolean>(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState<boolean>(false);
  const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // État de la modale de confirmation interne
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "info";
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const openConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      variant?: "danger" | "info";
      onConfirm: () => void;
    }) => {
      setConfirmState({ ...opts, isOpen: true });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const getReportHits = useCallback((rep: ForensicReport): number => {
    if (typeof rep.matches === "number") return rep.matches;
    if (Array.isArray(rep.matches)) {
      return rep.matches.filter((m) => m.errorType === "Hit").length;
    }
    return 0;
  }, []);

  // KPI Summary
  const stats: ForensicKpiStats & { driftCount: number } = useMemo(() => {
    if (reports.length === 0) {
      return {
        avgHits: 0,
        totalAudits: 0,
        perfectRate: 0,
        driftCount: 0,
        medianHits: 0,
        stdDevHits: 0,
        trend: 0,
      };
    }
    let driftCount = 0;
    const allHits: number[] = [];
    reports.forEach((rep) => {
      const h = getReportHits(rep);
      allHits.push(h);
      if (h === 0) driftCount++;
    });
    const totalHits = allHits.reduce((acc, h) => acc + h, 0);
    const perfects = allHits.filter((h) => h === 5).length;
    const avgHits = totalHits / allHits.length;
    const sortedHits = [...allHits].sort((a, b) => a - b);
    const medianHits = computeMedian(sortedHits);
    const stdDevHits = computeStdDev(allHits, avgHits);
    const chronoReports = [...reports].sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tA - tB;
    });
    const trend = computeHitsTrend(chronoReports, getReportHits);

    return {
      avgHits,
      totalAudits: reports.length,
      perfectRate: (perfects / reports.length) * 100,
      driftCount,
      medianHits,
      stdDevHits,
      trend,
    };
  }, [reports, getReportHits]);

  const handleOpenReport = useCallback(
    async (rep: ForensicReport) => {
      audioEngine.play("click");
      try {
        const { getFullForensicReportById } = await import("../../services/storageOptimizationService");
        const full = await getFullForensicReportById(rep.id);
        setSelectedReport(full || rep);
      } catch {
        setSelectedReport(rep);
      }
    },
    []
  );

  const handleExportPDF = useCallback(async () => {
    try {
      setIsExportingPDF(true);
      audioEngine.play("click");
      const { generateForensicLogPDF } = await import("../../services/exportService");

      const items = reports.map((rep) => {
        const matchedDraw = rep.drawResultId ? history.find((h) => h.id === rep.drawResultId) : undefined;
        const actualGagnants = rep.combo || matchedDraw?.gagnants || [];
        const suggested = rep.matches?.map((m) => m.predicted) || [];
        const exactHits = rep.matches
          ? rep.matches.filter((m) => m.errorType === "Hit").map((m) => m.predicted)
          : [];
        const nearMisses = rep.matches
          ? rep.matches.filter((m) => m.errorType === "Voisin").map((m) => m.predicted)
          : [];

        return {
          timestamp: rep.timestamp ? new Date(rep.timestamp).getTime() : Date.now(),
          suggestedNumbers: suggested,
          confidence:
            rep.forensicScore ??
            (rep.suspicionScore !== undefined ? 100 - rep.suspicionScore : undefined),
          result:
            actualGagnants.length > 0
              ? {
                  id: rep.drawResultId || `rep-${rep.id}`,
                  drawName,
                  date: rep.date || matchedDraw?.date || "Tirage Officiel",
                  gagnants: actualGagnants,
                }
              : null,
          hits: exactHits,
          nearMisses: nearMisses,
          precisionPct: suggested.length > 0 ? (exactHits.length / suggested.length) * 100 : 0,
          analysis: rep.aiAnalysis || "Rapport d'Autopsie Médico-Légale",
        };
      });

      await generateForensicLogPDF({ drawName, items });
      showToast("Forensic Log exporté en PDF avec succès !", "success");
      audioEngine.play("success");
    } catch (err) {
      console.error("PDF Export Error:", err);
      showToast("Erreur lors de l'export PDF du Forensic Log", "error");
    } finally {
      setIsExportingPDF(false);
    }
  }, [reports, history, drawName, showToast]);

  const handleSync = useCallback(async () => {
    try {
      audioEngine.play("click");
      setSyncing(true);
      await syncReports();
      showToast("Synchronisation cloud terminée", "success");
    } catch {
      showToast("Échec de synchronisation", "error");
    } finally {
      setSyncing(false);
    }
  }, [syncReports, showToast]);

  const handleRefresh = useCallback(async () => {
    try {
      audioEngine.play("click");
      await refreshLocal();
      showToast("Rapports actualisés", "info");
    } catch (e) {
      console.error(e);
    }
  }, [refreshLocal, showToast]);

  const handleDeleteReport = useCallback(
    (id: string, predictionId?: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const rep = reports.find((r) => r.id === id);
      const repDate = rep ? formatDateSafely(rep.date) : id;
      openConfirm({
        title: "Suppression Définitive",
        message: `Supprimer définitivement le rapport d'autopsie du ${repDate} ?\nCette opération est irréversible et supprimera toutes les données associées.`,
        confirmLabel: "Supprimer",
        variant: "danger",
        onConfirm: async () => {
          closeConfirm();
          try {
            audioEngine.play("click");
            await deleteReport(id, predictionId || rep?.predictionId);
            setSelectedReportIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            showToast("Rapport d'autopsie définitivement supprimé", "success");
          } catch (error) {
            console.error("Erreur suppression rapport:", error);
            showToast("Erreur de suppression du rapport", "error");
          }
        },
      });
    },
    [reports, openConfirm, closeConfirm, deleteReport, showToast]
  );

  const handleToggleSelectReport = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    audioEngine.play("click");
    setSelectedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback((ids: Set<string>) => {
    setSelectedReportIds(ids);
  }, []);

  const handleDeselectAll = useCallback(() => {
    audioEngine.play("click");
    setSelectedReportIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    const count = selectedReportIds.size;
    if (count === 0) return;
    openConfirm({
      title: "Suppression Groupée",
      message: `Supprimer définitivement les ${count} rapport(s) d'autopsie sélectionné(s) ?\nCette opération est irréversible.`,
      confirmLabel: `Supprimer ${count} rapport(s)`,
      variant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          setIsDeletingBatch(true);
          audioEngine.play("click");
          const itemsToDelete = reports
            .filter((r) => selectedReportIds.has(r.id))
            .map((r) => ({ id: r.id, predictionId: r.predictionId }));

          await deleteReports(itemsToDelete);
          setSelectedReportIds(new Set());
          showToast(`${count} rapport(s) d'autopsie définitivement supprimé(s)`, "success");
        } catch (e) {
          console.error("Erreur suppression groupée:", e);
          showToast("Erreur lors de la suppression groupée", "error");
        } finally {
          setIsDeletingBatch(false);
        }
      },
    });
  }, [selectedReportIds, openConfirm, closeConfirm, reports, deleteReports, showToast]);

  const handleDeleteDriftReports = useCallback(async () => {
    const driftReports = reports.filter((rep) => getReportHits(rep) === 0);

    if (driftReports.length === 0) {
      showToast("Aucun rapport d'autopsie en dérive (0/5) à purger.", "info");
      return;
    }

    openConfirm({
      title: "Purge des Dérives",
      message: `Supprimer définitivement les ${driftReports.length} rapport(s) d'autopsie en dérive (0/5) ?\nCes rapports n'ont produit aucun numéro gagnant.`,
      confirmLabel: `Purger ${driftReports.length} dérive(s)`,
      variant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          setIsDeletingBatch(true);
          audioEngine.play("click");
          const items = driftReports.map((r) => ({ id: r.id, predictionId: r.predictionId }));
          await deleteReports(items);
          setSelectedReportIds((prev) => {
            const next = new Set(prev);
            items.forEach((i) => next.delete(i.id));
            return next;
          });
          showToast(`${driftReports.length} rapports en dérive supprimés`, "success");
        } catch (e) {
          console.error("Erreur purge dérives:", e);
          showToast("Erreur lors de la purge des dérives", "error");
        } finally {
          setIsDeletingBatch(false);
        }
      },
    });
  }, [reports, getReportHits, openConfirm, closeConfirm, deleteReports, showToast]);

  const handleFlashAutopsy = useCallback(async () => {
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
      const histLen = subHistory.length;
      const adaptiveDepth = Math.min(histLen, Math.max(5, Math.ceil(Math.sqrt(histLen) * 2)));
      const pred = await generateMasterPrediction(drawName, subHistory, adaptiveDepth, globalWeights);

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
    } catch (err) {
      console.error("Flash autopsy error:", err);
      showToast("Erreur lors du calcul de l'autopsie flash", "error");
    } finally {
      setIsGeneratingAudit(false);
    }
  }, [drawName, history, globalWeights, refreshLocal, showToast]);

  const handleGlobalRetroPropagation = useCallback(async () => {
    if (reports.length === 0) {
      showToast("Aucun rapport disponible pour la rétro-propagation", "error");
      return;
    }
    try {
      setIsBatchApplying(true);
      audioEngine.play("click");
      const cleanHistory = purifyHistoryForDraw(drawName, history);
      const depth = computeRetroPropDepth(reports, getReportHits);
      const scopedReports = reports.slice(0, depth);

      const synthesis = await runUnifiedDnaGeneSequencer(drawName, cleanHistory, globalWeights, {
        forensicReports: scopedReports,
        applyWeights: true,
      });

      setGlobalWeights(synthesis.optimizedWeights);
      addAgentLog({
        id: `retro_epigenome_${Date.now()}`,
        timestamp: new Date(),
        action: `Rétro-propagation génomique consolidée (${drawName}) sur ${scopedReports.length} rapport(s) · ${synthesis.sequenceMetrics.sequenceSignature}`,
        type: "AUTOTUNE",
        impact: `Cohérence épistasique ${synthesis.sequenceMetrics.epistaticCoherenceScore}% · Δmax ${(synthesis.sequenceMetrics.maxWeightDelta * 100).toFixed(2)}%`,
      });

      showToast(
        `Rétro-propagation consolidée (${scopedReports.length} rapports · ${synthesis.sequenceMetrics.sequenceSignature}) effectuée avec succès !`,
        "success"
      );
      audioEngine.play("success");
    } catch (e) {
      console.error("Batch retro-propagation error:", e);
      showToast("Erreur lors de la rétro-propagation", "error");
    } finally {
      setIsBatchApplying(false);
    }
  }, [reports, drawName, history, globalWeights, getReportHits, setGlobalWeights, addAgentLog, showToast]);

  const handleExportReports = useCallback(() => {
    if (reports.length === 0) return;
    audioEngine.play("click");
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    const mathMeta = extractMathProofMetadata({
      history: cleanHistory,
      weights: globalWeights,
    });

    const successRate =
      stats.totalAudits > 0
        ? (((stats.totalAudits - stats.driftCount) / stats.totalAudits) * 100).toFixed(1)
        : "0.0";

    const scenario = buildUnifiedForensicScenario({
      scenarioType: "FORENSIC_HUB",
      drawName,
      appliedWeights: globalWeights,
      mathMetadata: mathMeta,
      summary: {
        hitRate: stats.avgHits * 20,
        accuracyScore: stats.avgHits * 20,
        sampleCount: stats.totalAudits,
        regime: "FORENSIC_HUB",
        causalAuditTrail: [
          `Forensic Hub Export for ${drawName}`,
          `Total autopsies : ${stats.totalAudits}`,
          `Moyenne Concordance : ${stats.avgHits.toFixed(2)}/5`,
          `Médiane Concordance : ${stats.medianHits.toFixed(2)}/5`,
          `Écart-Type (σ) : ${stats.stdDevHits.toFixed(3)}`,
          `Taux de Rentrée : ${successRate}%`,
          `Tendance : ${stats.trend > 0 ? "Ascendante" : stats.trend < 0 ? "Descendante" : "Stable"}`,
        ],
      },
      payload: { reports, stats },
    });

    exportUnifiedScenarioToJSON(scenario);
    showToast("Scénario Forensique Universel exporté en JSON", "success");
  }, [reports, drawName, history, globalWeights, stats, showToast]);

  const handleImportUniversalScenario = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        audioEngine.play("scan");
        const scenario = await importUnifiedScenarioFromJSON(file);
        const cleanHistory = purifyHistoryForDraw(drawName, history);
        const res = await reinjectScenarioIntoState(scenario, cleanHistory);
        showToast(res.message, "success");
        audioEngine.play("success");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Échec de l'importation du scénario";
        showToast(msg, "error");
        audioEngine.play("error");
      } finally {
        e.target.value = "";
      }
    },
    [drawName, history, showToast]
  );

  return (
    <div className="w-full space-y-8 animate-fade-in pb-16 font-sans">
      {/* CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* HEADER BAR (Memoized) */}
      <ForensicHubHeader
        drawName={drawName}
        isGeneratingAudit={isGeneratingAudit}
        isBatchApplying={isBatchApplying}
        reportsCount={reports.length}
        isExportingPDF={isExportingPDF}
        syncing={syncing}
        onFlashAutopsy={handleFlashAutopsy}
        onRetroPropagation={handleGlobalRetroPropagation}
        onExportJSON={handleExportReports}
        onExportPDF={handleExportPDF}
        onImportScenario={handleImportUniversalScenario}
        onOpenStorageModal={() => {
          audioEngine.play("click");
          setIsStorageModalOpen(true);
        }}
        onSync={handleSync}
        onRefresh={handleRefresh}
      />

      {/* KPI METRIC BANNER (Memoized) */}
      <ForensicKpiBanner stats={stats} pendingCount={pendingPredictions.length} />

      {/* SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
        {[
          { id: "audits", label: "Autopsies & Rapports", icon: BookOpen, count: reports.length },
          { id: "closedloop", label: "Boucle Fermée & Optimisation", icon: Zap },
          { id: "dna_drift", label: "ADN Algorithmique & Fusion", icon: Dna },
          { id: "matrices_entropy", label: "Matrices, Entropie & SHAP", icon: Compass },
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
                  : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: AUTOPSIES & RAPPORTS TABLE */}
      {activeTab === "audits" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setAuditSubView("table");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  auditSubView === "table"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <BookOpen size={13} />
                Tableau des Autopsies
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setAuditSubView("logs");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  auditSubView === "logs"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FileText size={13} />
                Journal d'Audit Forensic
              </button>
            </div>
          </div>

          {auditSubView === "logs" ? (
            <ForensicAuditLogsView drawName={drawName} />
          ) : (
            <ForensicAutopsyTable
              reports={reports}
              driftCount={stats.driftCount}
              isDeletingBatch={isDeletingBatch}
              selectedReportIds={selectedReportIds}
              onToggleSelectReport={handleToggleSelectReport}
              onSelectAllFiltered={handleSelectAllFiltered}
              onDeselectAll={handleDeselectAll}
              onDeleteSelected={handleDeleteSelected}
              onDeleteDriftReports={handleDeleteDriftReports}
              onDeleteReport={handleDeleteReport}
              onOpenReport={handleOpenReport}
              onFlashAutopsy={handleFlashAutopsy}
            />
          )}
        </div>
      )}

      {/* TAB 2: CLOSED LOOP AUTOPSY & OPTIMISATION NEURALE */}
      {activeTab === "closedloop" && (
        <div className="space-y-6">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
            <button
              onClick={() => {
                audioEngine.play("click");
                setClosedLoopSubView("autopsy");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                closedLoopSubView === "autopsy"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap size={13} />
              Boucle Fermée d'Autopsie
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setClosedLoopSubView("neural_opt");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                closedLoopSubView === "neural_opt"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <BrainCircuit size={13} />
              Auto-Optimisation Neurale
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setClosedLoopSubView("expert_bias");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                closedLoopSubView === "expert_bias"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sliders size={13} />
              Biais Expert Manuel
            </button>
          </div>

          {closedLoopSubView === "autopsy" && <ClosedLoopAutopsyPanel drawName={drawName} />}
          {closedLoopSubView === "neural_opt" && <NeuralSelfOptimizationPanel drawName={drawName} />}
          {closedLoopSubView === "expert_bias" && <ExpertBiasAdjuster drawName={drawName} />}
        </div>
      )}

      {/* TAB 3: AUDIT ADN & FUSION ALGORITHMIQUE */}
      {activeTab === "dna_drift" && (
        <div className="space-y-6">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
            <button
              onClick={() => {
                audioEngine.play("click");
                setDnaSubView("reference");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dnaSubView === "reference"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ShieldCheck size={13} />
              Audit ADN &amp; Synchronisation
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setDnaSubView("gene_sequencer");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dnaSubView === "gene_sequencer"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Dna size={13} />
              Séquenceur Gènes ADN
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setDnaSubView("drift_heatmap");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dnaSubView === "drift_heatmap"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Flame size={13} />
              Heatmap Dérive Sous-Algos
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setDnaSubView("sieve_radar");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dnaSubView === "sieve_radar"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Radar size={13} />
              Radar Crible ADN
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setDnaSubView("history_dna");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dnaSubView === "history_dna"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Dna size={13} />
              ADN Gagnants par Tirage
            </button>
          </div>

          {dnaSubView === "reference" && <DnaReferenceAuditor drawName={drawName} />}
          {dnaSubView === "gene_sequencer" && <DnaGeneSequencerPanel drawName={drawName} />}
          {dnaSubView === "drift_heatmap" && <SubAlgorithmDriftHeatmap drawName={drawName} />}
          {dnaSubView === "sieve_radar" && <UnifiedDnaSieveRadar drawName={drawName} />}
          {dnaSubView === "history_dna" && (
            <DrawDnaHistoryViewer drawName={drawName} history={history} />
          )}
        </div>
      )}

      {/* TAB 4: MATRICES, ENTROPIE & SHAP */}
      {activeTab === "matrices_entropy" && (
        <div className="space-y-6">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
            <button
              onClick={() => {
                audioEngine.play("click");
                setMatrixSubView("confusion");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                matrixSubView === "confusion"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Compass size={13} />
              Matrice de Confusion
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMatrixSubView("entropy");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                matrixSubView === "entropy"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity size={13} />
              Entropie Stochastique
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMatrixSubView("radar");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                matrixSubView === "radar"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Radar size={13} />
              Radar Macro/Micro &amp; SHAP
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMatrixSubView("timeline");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                matrixSubView === "timeline"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock size={13} />
              Frise Chronologique
            </button>
          </div>

          {matrixSubView === "confusion" && (
            <MultiLevelConfusionMatrix
              reports={reports}
              drawName={drawName}
              onSelectReport={(rep) => setSelectedReport(rep)}
            />
          )}
          {matrixSubView === "entropy" && (
            <StochasticEntropyPanel drawName={drawName} reports={reports} />
          )}
          {matrixSubView === "radar" && (
            <UnifiedForensicRadarPanel
              report={selectedReport || reports[0] || null}
              drawName={drawName}
            />
          )}
          {matrixSubView === "timeline" && (
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
        </div>
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
});

ForensicHub.displayName = "ForensicHub";
