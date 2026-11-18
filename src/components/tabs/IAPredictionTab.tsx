import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  BrainCircuit,
  Sparkles,
  Activity,
  ShieldCheck,
  Scale,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import {
  savePredictionToHistory,
  getPredictionHistoryAsync,
  deletePrediction,
  getPredictionResolutionStatus,
  isAutoPurgeEnabled,
  setAutoPurgeEnabled,
  purgeOldPredictionLogs,
  STORAGE_RETENTION_CONSTANTS,
} from "../../services/predictionHistoryService";
import { DRAW_EXCEPTIONS_UPDATED_EVENT } from "../../services/drawScheduleExceptionService";
import type { Prediction, PredictionHistoryItem, AlgoWeights } from "../../types";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../../shared/prediction.types";
import { getAlgoWeights, adjustWeightsForRegime, normalizeWeights } from "../../services/prediction/weightsManager";
import { ExportService } from "../../services/exportService";
import type { NeuralPredictionPdfPayload } from "../../services/export/pdf";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { drawHasMachineNumbers } from "../../constants";
import { StrictDrawValidationModal } from "../StrictDrawValidationModal";
import { ConfirmModal } from "../ui/ConfirmModal";
import { IAPredictionInferencePanel } from "./iaPrediction/IAPredictionInferencePanel";
import { IAPredictionBacktestPanel } from "./iaPrediction/IAPredictionBacktestPanel";
import { IAPredictionForensicLogPanel } from "./iaPrediction/IAPredictionForensicLogPanel";
import type {
  BacktestChartPoint,
  BacktestResult,
  BacktestStats,
  EngineComparisonStats,
  ForensicDateFilter,
  ForensicEngineFilter,
  ForensicEntry,
  ForensicFilter,
  ForensicSort,
  InferencePrediction,
} from "./iaPrediction/types";

export const IAPredictionTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalRegime = useNexusStore((state) => state.regime);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const temporalDepth = useNexusStore((state) => state.temporalDepth);
  const isForensicOptimized = useNexusStore((state) => state.isForensicOptimized);
  const useSpatioTemporalHawkes = useNexusStore((state) => state.useSpatioTemporalHawkes);
  const forcedOutsiderCount = useNexusStore((state) => state.forcedOutsiderCount);
  const setForcedOutsiderCount = useNexusStore((state) => state.setForcedOutsiderCount);

  const [activeMode, setActiveMode] = useState<
    "inference" | "backtest" | "audit_log"
  >("inference");

  const [localHistory, setLocalHistory] = useState<PredictionHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isCopiedInference, setIsCopiedInference] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [forensicFilter, setForensicFilter] = useState<ForensicFilter>("all");
  const [forensicEngineFilter, setForensicEngineFilter] = useState<ForensicEngineFilter>("all");
  const [forensicDateFilter, setForensicDateFilter] = useState<ForensicDateFilter>("all");
  const [forensicCustomDate, setForensicCustomDate] = useState<string>("");
  const [forensicSort, setForensicSort] = useState<ForensicSort>("recent");
  const [showEngineComparison, setShowEngineComparison] = useState<boolean>(true);
  const [autoPurgeEnabled, setAutoPurgeState] = useState<boolean>(() => isAutoPurgeEnabled());
  const [isPurgingOldLogs, setIsPurgingOldLogs] = useState<boolean>(false);
  const [isStrictModalOpen, setIsStrictModalOpen] = useState<boolean>(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const loadHistoryData = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const hist = await getPredictionHistoryAsync(drawName);
      setLocalHistory(hist);
    } catch (e) {
      console.error("Failed to load local history", e);
    } finally {
      setLoadingHistory(false);
    }
  }, [drawName]);

  const [exceptionsVersion, setExceptionsVersion] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleExceptionsChange = () => setExceptionsVersion((v) => v + 1);
    window.addEventListener(DRAW_EXCEPTIONS_UPDATED_EVENT, handleExceptionsChange);
    return () => window.removeEventListener(DRAW_EXCEPTIONS_UPDATED_EVENT, handleExceptionsChange);
  }, []);

  useEffect(() => {
    loadHistoryData();
  }, [loadHistoryData]);

  const oldLogsStats = useMemo(() => {
    const cutoff = Date.now() - STORAGE_RETENTION_CONSTANTS.RETENTION_PERIOD_MS;
    const oldItems = localHistory.filter((item) => item.timestamp < cutoff);
    return {
      count: oldItems.length,
      cutoff,
      retentionDays: STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT,
    };
  }, [localHistory]);

  const handleToggleAutoPurge = async () => {
    audioEngine.play("click");
    const nextVal = !autoPurgeEnabled;
    setAutoPurgeState(nextVal);
    setAutoPurgeEnabled(nextVal);
    if (nextVal) {
      showToast("Purge automatique activée : les logs > 90 jours sont automatiquement nettoyés.", "success");
      try {
        setIsPurgingOldLogs(true);
        const { purgedCount } = await purgeOldPredictionLogs(drawName, STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT);
        if (purgedCount > 0) {
          await loadHistoryData();
          showToast(`${purgedCount} ancien(s) log(s) de plus de 90 jours nettoyé(s).`, "info");
        }
      } catch (err) {
        console.warn("Auto-purge immediate run warning:", err);
      } finally {
        setIsPurgingOldLogs(false);
      }
    } else {
      showToast("Purge automatique désactivée : conservation illimitée des logs.", "info");
    }
  };

  const handleManualPurgeOldLogs = () => {
    audioEngine.play("click");
    if (oldLogsStats.count === 0) {
      showToast("Aucun log ayant plus de 90 jours n'a été détecté dans le registre local.", "info");
      return;
    }

    setConfirmState({
      title: "Purger les anciens logs",
      message: `Confirmer la purge de ${oldLogsStats.count} log(s) de prédictions ayant plus de 90 jours pour le tirage "${drawName}" ?`,
      confirmLabel: "Purger",
      onConfirm: async () => {
        try {
          setIsPurgingOldLogs(true);
          const { purgedCount } = await purgeOldPredictionLogs(drawName, STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT);
          await loadHistoryData();
          audioEngine.play("success");
          showToast(`${purgedCount} log(s) de prédictions (> 90 jours) purgé(s) avec succès.`, "success");
        } catch (err) {
          console.error("Erreur purge manuelle:", err);
          showToast("Erreur lors de la purge des anciens logs.", "error");
        } finally {
          setIsPurgingOldLogs(false);
        }
      },
    });
  };

  const handleCopyInferenceTicket = (numbers: number[]) => {
    audioEngine.play("click");
    const text = numbers.join(" - ");
    navigator.clipboard.writeText(text);
    setIsCopiedInference(true);
    showToast(`Sélection IA copiée : ${text}`, "success");
    setTimeout(() => setIsCopiedInference(false), 2000);
  };

  const handleExportInferenceJSON = (predData: InferencePrediction) => {
    audioEngine.play("click");
    const blob = new Blob([JSON.stringify({ drawName, timestamp: new Date().toISOString(), ...predData }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ia_prediction_${drawName.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Fiche IA exportée en JSON.", "success");
  };

  const handleExportNeuralPredictionPDF = async (pred: NeuralPredictionPdfPayload) => {
    if (!pred || !pred.suggestedNumbers) return;
    try {
      audioEngine.play("click");
      setIsExportingPDF(true);
      await ExportService.generateNeuralPredictionPDF({
        ...pred,
        drawName: pred.drawName || drawName,
        timestamp: pred.timestamp ?? Date.now(),
      });
      showToast("Rapport d'Inférence IA Neural exporté en PDF.", "success");
      audioEngine.play("success");
    } catch (err) {
      console.error("PDF Export error:", err);
      showToast("Erreur lors de la génération du PDF.", "error");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const forensicEntries = useMemo<ForensicEntry[]>(() => {
    return localHistory.map((item) => {
      const resolution = getPredictionResolutionStatus(item, history);
      const res = resolution.result;
      const hits = res
        ? item.prediction.suggestedNumbers.filter((n) =>
            res.gagnants.includes(n),
          )
        : [];
      const nearMisses = res
        ? item.prediction.suggestedNumbers.filter(
            (n) =>
              !res.gagnants.includes(n) &&
              res.gagnants.some((gn) => Math.abs(gn - n) === 1),
          )
        : [];
      const precisionPct = res && item.prediction.suggestedNumbers.length > 0
        ? Math.round((hits.length / item.prediction.suggestedNumbers.length) * 100)
        : 0;

      const engineType: "local" | "cloud" =
        item.engineType === "cloud" || item.prediction?.engineType === "cloud"
          ? "cloud"
          : "local";

      return {
        item,
        res,
        hits,
        nearMisses,
        precisionPct,
        engineType,
        scheduleException: resolution.exception,
      };
    });
  }, [localHistory, history, exceptionsVersion]);

  const filteredForensicEntries = useMemo(() => {
    let list = [...forensicEntries];

    if (forensicEngineFilter !== "all") {
      list = list.filter((e) => e.engineType === forensicEngineFilter);
    }

    if (forensicDateFilter !== "all") {
      const now = Date.now();
      list = list.filter((e) => {
        const itemDate = new Date(e.item.timestamp);
        if (forensicDateFilter === "today") {
          const today = new Date();
          return (
            itemDate.getDate() === today.getDate() &&
            itemDate.getMonth() === today.getMonth() &&
            itemDate.getFullYear() === today.getFullYear()
          );
        }
        if (forensicDateFilter === "7d") {
          return now - e.item.timestamp <= 7 * 24 * 60 * 60 * 1000;
        }
        if (forensicDateFilter === "30d") {
          return now - e.item.timestamp <= 30 * 24 * 60 * 60 * 1000;
        }
        if (forensicDateFilter === "custom" && forensicCustomDate) {
          const [year, month, day] = forensicCustomDate.split("-").map(Number);
          return (
            itemDate.getFullYear() === year &&
            itemDate.getMonth() === month - 1 &&
            itemDate.getDate() === day
          );
        }
        return true;
      });
    }

    if (forensicFilter === "verified") {
      list = list.filter((e) => e.res !== null && e.res !== undefined);
    } else if (forensicFilter === "pending") {
      list = list.filter((e) => !e.res);
    } else if (forensicFilter === "hits") {
      list = list.filter((e) => e.hits.length >= 1);
    } else if (forensicFilter === "high_precision") {
      list = list.filter((e) => e.hits.length >= 2);
    }

    if (forensicSort === "precision_desc") {
      list.sort((a, b) => b.precisionPct - a.precisionPct || b.hits.length - a.hits.length);
    } else if (forensicSort === "confidence_desc") {
      list.sort((a, b) => (b.item.prediction.confidence || 0) - (a.item.prediction.confidence || 0));
    } else {
      list.sort((a, b) => b.item.timestamp - a.item.timestamp);
    }
    return list;
  }, [forensicEntries, forensicEngineFilter, forensicDateFilter, forensicCustomDate, forensicFilter, forensicSort]);

  const engineComparisonStats = useMemo<EngineComparisonStats>(() => {
    const localEntries = forensicEntries.filter((e) => e.engineType === "local");
    const cloudEntries = forensicEntries.filter((e) => e.engineType === "cloud");

    const localVerified = localEntries.filter((e) => e.res);
    const cloudVerified = cloudEntries.filter((e) => e.res);

    const localAvgPrecision =
      localVerified.length > 0
        ? localVerified.reduce((acc, e) => acc + e.precisionPct, 0) / localVerified.length
        : 0;
    const cloudAvgPrecision =
      cloudVerified.length > 0
        ? cloudVerified.reduce((acc, e) => acc + e.precisionPct, 0) / cloudVerified.length
        : 0;

    const localHits = localEntries.reduce((acc, e) => acc + (e.res ? e.hits.length : 0), 0);
    const cloudHits = cloudEntries.reduce((acc, e) => acc + (e.res ? e.hits.length : 0), 0);

    const localNear = localEntries.reduce((acc, e) => acc + (e.res ? e.nearMisses.length : 0), 0);
    const cloudNear = cloudEntries.reduce((acc, e) => acc + (e.res ? e.nearMisses.length : 0), 0);

    const localAvgConf =
      localEntries.length > 0
        ? localEntries.reduce((acc, e) => acc + (e.item.prediction.confidence || 0), 0) / localEntries.length
        : 0;
    const cloudAvgConf =
      cloudEntries.length > 0
        ? cloudEntries.reduce((acc, e) => acc + (e.item.prediction.confidence || 0), 0) / cloudEntries.length
        : 0;

    return {
      local: {
        total: localEntries.length,
        verified: localVerified.length,
        avgPrecision: localAvgPrecision,
        hits: localHits,
        nearMisses: localNear,
        avgConfidence: localAvgConf,
      },
      cloud: {
        total: cloudEntries.length,
        verified: cloudVerified.length,
        avgPrecision: cloudAvgPrecision,
        hits: cloudHits,
        nearMisses: cloudNear,
        avgConfidence: cloudAvgConf,
      },
    };
  }, [forensicEntries]);

  const handleExportForensicLogPDF = async () => {
    if (forensicEntries.length === 0) {
      showToast("Aucune entrée d'audit à exporter.", "info");
      return;
    }
    try {
      audioEngine.play("click");
      setIsExportingPDF(true);
      await ExportService.generateForensicLogPDF({
        drawName,
        items: forensicEntries.map((e) => ({
          timestamp: e.item.timestamp,
          suggestedNumbers: e.item.prediction.suggestedNumbers,
          confidence: e.item.prediction.confidence,
          result: e.res,
          hits: e.hits,
          nearMisses: e.nearMisses,
          precisionPct: e.precisionPct,
          analysis: e.item.prediction.analysis,
        })),
      });
      showToast("Registre Forensic Log exporté en PDF.", "success");
      audioEngine.play("success");
    } catch (err) {
      console.error("Forensic log PDF export error:", err);
      showToast("Erreur lors de l'exportation du journal Forensic.", "error");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const [skipTraining, setSkipTraining] = useState<boolean>(false);
  const adversarialMode = false;

  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<InferencePrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [backtestDepth, setBacktestDepth] = useState(5);
  const [backtestResults, setBacktestResults] = useState<BacktestResult[] | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  useEffect(() => {
    setPrediction(null);
    setError(null);
    setBacktestResults(null);
    setBacktestError(null);
  }, [drawName]);

  // Continuous deterministic fallback weight generator (AGENTS.md compliant: continuous mapping, zero magic numbers)
  const generateSmartLocalWeightsFallback = (
    targetDrawName: string,
    regime: string,
    hurst: number,
    entropy: number,
    volatility: number,
    currentWeights?: AlgoWeights,
  ) => {
    const baseWeights: AlgoWeights = currentWeights && Object.keys(currentWeights).length > 0
      ? { ...currentWeights }
      : (globalWeights && Object.keys(globalWeights).length > 0 ? { ...globalWeights } : { ...DEFAULT_ALGO_WEIGHTS });

    const adjustedWeights = adjustWeightsForRegime(baseWeights, {
      regime,
      hurst,
      entropy,
      volatility,
    });

    const hDiff = hurst - 0.5;
    const eDiff = entropy - 3.0;

    // Pente continue tempérée (AGENTS.md : pas de bifurcation abrupte)
    const persistenceProb = 1.0 / (1.0 + Math.exp(-6.0 * hDiff));
    const antipersistenceProb = 1.0 - persistenceProb;
    const neutralityProb = Math.exp(-18.0 * Math.pow(hDiff, 2));

    let rationale = `[CONVERGENCE CYBERNÉTIQUE LOCALE] L'analyse du tirage ${targetDrawName} (Régime: ${regime}) montre un exposant de Hurst de ${hurst.toFixed(4)} et une entropie de ${entropy.toFixed(4)}. `;

    if (neutralityProb > 0.5) {
      rationale += `Le régime présente une dérive stochastique neutre (mélange équilibré de ${(persistenceProb * 100).toFixed(1)}% d'inertie et ${(antipersistenceProb * 100).toFixed(1)}% de transition). `;
    } else {
      rationale += `Le paysage d'inférence est dominé par une composante de ${(persistenceProb * 100).toFixed(1)}% de stabilité d'inertie persistante et ${(antipersistenceProb * 100).toFixed(1)}% de transition stochastique. `;
    }

    const chaosProb = 1.0 / (1.0 + Math.exp(-4.0 * eDiff));
    const orderProb = 1.0 - chaosProb;
    const eNeutralityProb = Math.exp(-10.0 * Math.pow(eDiff, 2));

    if (eNeutralityProb > 0.6) {
      rationale += `L'entropie se maintient à un équilibre thermodynamique stable. `;
    } else {
      rationale += `L'empreinte entropique indique un niveau de désordre structurel de ${(chaosProb * 100).toFixed(1)}% (chaos spectral) vs ${(orderProb * 100).toFixed(1)}% de motifs géométriques ordonnés. `;
    }

    const volProb = 1.0 / (1.0 + Math.exp(-0.2 * (volatility - 20.0)));
    rationale += `La volatilité mesurée contribue continûment à hauteur de ${(volProb * 100).toFixed(1)}% à l'amplification spectrale globale. `;

    const strategicAdvice = `Favoriser continûment un ratio d'exposition de ${(persistenceProb * 100).toFixed(0)}% de numéros chauds d'inertie (historique récent) et ${(antipersistenceProb * 100).toFixed(0)}% d'écarts longs parvenus à maturité (rupture de phase).`;

    return {
      weights: adjustedWeights as Record<string, number>,
      rationale,
      strategicAdvice,
    };
  };

  const runAIPrediction = async () => {
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    if (!cleanHistory || cleanHistory.length < 5) {
      showToast(
        `Dataset historique insuffisant pour ${drawName} (Minimum 5 tirages réels isolés requis).`,
        "error",
      );
      return;
    }

    audioEngine.play("scan");
    setLoading(true);
    setError(null);

    try {
      const resolveBaseWeights = async (): Promise<AlgoWeights> =>
        globalWeights && Object.keys(globalWeights).length > 0
          ? globalWeights
          : await getAlgoWeights(drawName);

      const hurstVal =
        globalRegime?.hurst !== undefined ? globalRegime.hurst : 0.5;
      const entropyVal =
        globalRegime?.entropy !== undefined ? globalRegime.entropy : 3.0;
      const volatilityVal =
        globalRegime?.volatility !== undefined ? globalRegime.volatility : 0.1;
      const regimeStr = globalRegime?.regime || "STABLE (Harmonisé)";

      const activeBaseWeights = await resolveBaseWeights();
      const { initializeLotoEngineWasm, computeHybridRegimeWeightsHpc } =
        await import("../../services/wasm/lotoEngineBridge");
      await initializeLotoEngineWasm();

      const weightKeys = Object.keys(activeBaseWeights) as AlgoKey[];
      const baseArr = new Float64Array(
        weightKeys.map((k) => Number(activeBaseWeights[k]) || 0),
      );
      const channelTypes = new Int32Array(
        weightKeys.map((k) => {
          const kl = k.toLowerCase();
          if (kl.includes("hurst") || kl.includes("markov") || kl.includes("momentum") || kl.includes("frequency")) return 0;
          if (kl.includes("gap") || kl.includes("equilibrium") || kl.includes("bayesian")) return 1;
          if (kl.includes("spectral") || kl.includes("lyapunov") || kl.includes("hawkes") || kl.includes("aco")) return 2;
          return 3;
        }),
      );

      const hpcRes = computeHybridRegimeWeightsHpc({
        baseWeights: baseArr,
        channelTypes,
        hurst: hurstVal,
        entropyNorm: entropyVal / Math.log2(90),
        volatilityNorm: volatilityVal / 100.0,
        historyDepth: cleanHistory.length,
      });

      const hpcWeights: AlgoWeights = { ...activeBaseWeights };
      weightKeys.forEach((k, idx) => {
        hpcWeights[k] = hpcRes.optimizedWeights[idx] ?? activeBaseWeights[k];
      });

      const localFb = generateSmartLocalWeightsFallback(
        drawName,
        regimeStr,
        hurstVal,
        entropyVal,
        volatilityVal,
        hpcWeights,
      );
      const aiWeights: Record<string, number> = { ...hpcWeights };
      const aiRationale = localFb.rationale;
      const aiStrategicAdvice = localFb.strategicAdvice;

      const { generateMasterPrediction } =
        await import("../../services/prediction/predictionFacade");

      const predictionData = await generateMasterPrediction(
        drawName,
        cleanHistory,
        temporalDepth,
        hpcWeights,
        undefined,
        undefined,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        undefined,
        undefined,
        useSpatioTemporalHawkes,
        false,
      );

      setPrediction({
        suggestedNumbers: predictionData.suggestedNumbers,
        candidates: predictionData.candidates,
        confidence: predictionData.confidence,
        analysis:
          predictionData.analysis ||
          "Inférence hybride locale complétée à partir de la matrice d'alignement.",
        mathModelSummary:
          "Inférence Locale Neuro-Vectorielle HPC (Rust / WASM)",
        xapExp: predictionData.xapExp,
        realityAlignment: predictionData.realityAlignment,
        adversarialApplied: predictionData.adversarialApplied,
        challengedNumbers: predictionData.challengedNumbers,
        stabilityScore: predictionData.stabilityScore,
        diversityScore: predictionData.diversityMetrics?.diversityScore,
        adversarialSurvivalScore: predictionData.adversarialSurvivalScore,
        adversarialRisks: predictionData.adversarialRisks,
        hyperparameters: predictionData.hyperparameters,
        hyperTuningLog: predictionData.hyperTuningLog,
        hyperAccuracyGain: predictionData.hyperAccuracyGain,
        aiWeights,
        aiRationale,
        aiStrategicAdvice,
        isLocalFallback: true,
        engineType: "local",
      });
      audioEngine.play("success");
      showToast("Inférence Neuro-Vectorielle HPC complétée.", "success");
    } catch (e: unknown) {
      console.error("Failed to compute IA prediction hybridly:", e);
      const message = e instanceof Error ? e.message : "Erreur de quantification mathématique hybride.";
      setError(message);
      showToast("Échec de l'inférence.", "error");
      audioEngine.play("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToForensicLog = async (pred: InferencePrediction) => {
    audioEngine.play("click");

    const breakdown: Record<number, Record<string, number>> = {};
    (pred.suggestedNumbers || []).forEach((num) => {
      const xapItem = pred.xapExp?.find((x) => x.number === num);
      breakdown[num] = {
        ...(xapItem ? { xap: xapItem.contributionPercentage } : {}),
        ...(typeof pred.confidence === "number" ? { confidence: pred.confidence } : {}),
        ...(typeof pred.stabilityScore === "number" ? { stability: pred.stabilityScore } : {}),
      };
    });

    const predictionObj: Prediction = {
      suggestedNumbers: pred.suggestedNumbers,
      candidates: pred.candidates,
      confidence: pred.confidence,
      analysis: pred.analysis || "Inférence Moteur Neural IA XAP",
      breakdown,
      timestamp: Date.now(),
      stabilityScore: pred.stabilityScore,
      realityAlignment: pred.realityAlignment,
      diversityMetrics:
        pred.diversityScore !== undefined
          ? {
              meanSimilarity: 0,
              diversityScore: pred.diversityScore,
              penalty: 0,
              isMonoculture: false,
              pairwiseSimilarities: [],
              dominantAlgo: null,
            }
          : undefined,
      adversarialSurvivalScore: pred.adversarialSurvivalScore,
      adversarialRisks: pred.adversarialRisks,
      engineType: "local",
      mathModelSummary: pred.mathModelSummary,
      isLocalFallback: true,
      aiWeights: pred.aiWeights,
      aiRationale: pred.aiRationale,
      aiStrategicAdvice: pred.aiStrategicAdvice,
      xapExp: pred.xapExp,
    };

    await savePredictionToHistory(drawName, predictionObj);
    loadHistoryData();
    showToast(
      "Prédiction enregistrée dans le Journal d'Audit / Forensic Log.",
      "success",
    );
    audioEngine.play("success");
  };

  const runBacktesting = async () => {
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    if (!cleanHistory || cleanHistory.length < 11) {
      showToast(
        "Historique insuffisant pour lancer le backtesting (minimum 11 tirages requis).",
        "error",
      );
      return;
    }

    setBacktestRunning(true);
    setBacktestError(null);
    setBacktestProgress(0);
    setBacktestResults(null);
    audioEngine.play("scan");

    const K = Math.min(backtestDepth, cleanHistory.length - 11);
    if (K <= 0) {
      setBacktestError(
        "La profondeur de l'historique restante n'est pas suffisante pour effectuer un découpage récursif correct.",
      );
      setBacktestRunning(false);
      audioEngine.play("error");
      return;
    }

    const results: BacktestResult[] = [];

    try {
      const { generateMasterPrediction } =
        await import("../../services/prediction/predictionFacade");

      const baseWeights: AlgoWeights = globalWeights && Object.keys(globalWeights).length > 0
        ? { ...globalWeights }
        : await getAlgoWeights(drawName);

      const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);
      if (!hasMachine) {
        baseWeights[AlgoKey.MACHINE_TRANSFER] = 0.0;
      }
      const activeWeights = normalizeWeights(baseWeights);

      for (let i = 0; i < K; i++) {
        const histSlice = cleanHistory.slice(i + 1);
        const targetDraw = cleanHistory[i];

        const pred = await generateMasterPrediction(
          drawName,
          histSlice,
          temporalDepth,
          activeWeights,
          undefined,
          undefined,
          skipTraining,
          adversarialMode,
          forcedOutsiderCount,
          isForensicOptimized,
          undefined,
          undefined,
          useSpatioTemporalHawkes,
        );

        const actual = targetDraw.gagnants;
        const sugg = pred.suggestedNumbers;
        const cand = pred.candidates;

        const suggestedHits = sugg.filter((n) => actual.includes(n));
        const candidatesHits = cand.filter((n) => actual.includes(n));

        const nearMisses: BacktestResult["nearMisses"] = [];
        const checkedNums = Array.from(new Set([...sugg, ...cand]));

        for (const p of checkedNums) {
          if (actual.includes(p)) continue;

          for (const g of actual) {
            if (Math.abs(p - g) === 1) {
              nearMisses.push({ num: p, type: "voisin", match: g });
              break;
            }
            const rx = parseInt(String(p).split("").reverse().join(""), 10);
            if (rx !== p && rx === g) {
              nearMisses.push({ num: p, type: "miroir", match: g });
              break;
            }
          }
        }

        results.push({
          drawId: targetDraw.id,
          date: targetDraw.date,
          actualGagnants: actual,
          suggestedPredicted: sugg,
          candidatesPredicted: cand,
          suggestedHits,
          candidatesHits,
          nearMisses,
          confidence: pred.confidence,
        });

        setBacktestProgress(Math.round(((i + 1) / K) * 100));
      }

      setBacktestResults(results);
      audioEngine.play("success");
      showToast(`Backtesting validé sur ${K} tirages successifs.`, "success");
    } catch (err: unknown) {
      console.error("Backtesting failed:", err);
      const message = err instanceof Error ? err.message : "Échec de l'évaluation récursive.";
      setBacktestError(message);
      showToast("Erreur d'exécution du backtesting.", "error");
      audioEngine.play("error");
    } finally {
      setBacktestRunning(false);
    }
  };

  const maxCapableDepth = Math.max(0, (history?.length || 0) - 11);
  const isEligibleForBacktest = maxCapableDepth >= 3;

  const stats = useMemo<BacktestStats | null>(() => {
    const safeBacktest = Array.isArray(backtestResults) ? backtestResults : [];
    if (safeBacktest.length === 0) return null;

    const totalDraws = safeBacktest.length;
    let totalSuggestedHits = 0;
    let totalCandidatesHits = 0;
    let drawsWithAtLeastOneHit = 0;
    let drawsWithNearMiss = 0;

    safeBacktest.forEach((r) => {
      if (!r) return;
      const sugHits = Array.isArray(r.suggestedHits) ? r.suggestedHits : [];
      const candHits = Array.isArray(r.candidatesHits) ? r.candidatesHits : [];
      const nearM = Array.isArray(r.nearMisses) ? r.nearMisses : [];

      totalSuggestedHits += sugHits.length;
      totalCandidatesHits += candHits.length;
      if (sugHits.length > 0) {
        drawsWithAtLeastOneHit++;
      }
      if (nearM.length > 0) {
        drawsWithNearMiss++;
      }
    });

    const avgDirectHits = totalSuggestedHits / totalDraws;
    const resonanceRate = (drawsWithAtLeastOneHit / totalDraws) * 100;
    const nearMissRate = (drawsWithNearMiss / totalDraws) * 100;

    const expectedLambda = 0.2778;
    const muTotal = totalDraws * expectedLambda;
    const varTotal = totalDraws * 0.2623;
    const stdTotal = Math.sqrt(varTotal);
    const zScore = stdTotal > 0 ? (totalSuggestedHits - muTotal) / stdTotal : 0;
    const alphaGain = avgDirectHits / expectedLambda;

    return {
      totalDraws,
      totalSuggestedHits,
      totalCandidatesHits,
      avgDirectHits,
      resonanceRate,
      nearMissRate,
      zScore,
      alphaGain,
    };
  }, [backtestResults]);

  const chartData = useMemo<BacktestChartPoint[]>(() => {
    if (!backtestResults) return [];
    return [...backtestResults].reverse().map((r, idx) => ({
      index: idx + 1,
      date: r.date,
      tirage: `T-${r.drawId.split("-")[0].slice(0, 4)}`,
      "Hits Directs": r.suggestedHits.length,
      "Hits Candidats": r.candidatesHits.length,
      "Near Misses": r.nearMisses.length,
      "Confiance %": r.confidence,
    }));
  }, [backtestResults]);

  const handleRequestClearAll = () => {
    setConfirmState({
      title: "Réinitialiser le Forensic Log",
      message: `Voulez-vous réinitialiser l'intégralité du registre Forensic Log pour le tirage "${drawName}" ?`,
      confirmLabel: "Réinitialiser",
      onConfirm: async () => {
        const { clearPredictionHistory } =
          await import("../../services/predictionHistoryService");
        await clearPredictionHistory(drawName);
        loadHistoryData();
        showToast("Registre Forensic Log réinitialisé.", "info");
      },
    });
  };

  const handleRequestDeleteEntry = (entryId: string) => {
    setConfirmState({
      title: "Supprimer cette entrée",
      message: "Supprimer cette entrée du registre Forensic ?",
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        await deletePrediction(entryId);
        loadHistoryData();
        showToast("Entrée supprimée du Forensic Log.", "info");
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header info card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-6 rounded-[2rem] border border-slate-800/80 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-fuchsia-500/10 transition-all duration-700" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-fuchsia-500/10 text-fuchsia-400 rounded-xl border border-fuchsia-500/20">
                <BrainCircuit size={20} className="animate-pulse" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400 bg-fuchsia-500/5 px-2.5 py-1 rounded-md border border-fuchsia-500/10">
                Filtre Mathématique Bayesian
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              Moteur Inférentiel d'Écarts
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Ce module interroge le modèle de transition de Poisson pour
              analyser la dynamique spectrale globale, le comportement des
              régimes continus, et estimer le moment de rupture pour la base{" "}
              <span className="text-white font-bold">{drawName}</span>.
            </p>
          </div>

          <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 shadow-inner w-full lg:w-auto self-stretch lg:self-auto gap-1">
            <button
              onClick={() => {
                audioEngine.play("click");
                setActiveMode("inference");
              }}
              className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2
                ${
                  activeMode === "inference"
                    ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-200"
                }
              `}
            >
              <Sparkles size={14} />
              <span>Inférence Hybride</span>
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setActiveMode("backtest");
              }}
              className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2
                ${
                  activeMode === "backtest"
                    ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-200"
                }
              `}
            >
              <Activity
                size={14}
                className={activeMode === "backtest" ? "animate-pulse" : ""}
              />
              <span>Backtesting</span>
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setActiveMode("audit_log");
              }}
              className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2
                ${
                  activeMode === "audit_log"
                    ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-200"
                }
              `}
            >
              <ShieldCheck size={14} />
              <span>Forensic Log</span>
              {localHistory.length > 0 && (
                <span className="bg-white/20 text-white px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold">
                  {localHistory.length}
                </span>
              )}
            </button>
            <button
              id="strict-draw-validation-btn"
              onClick={() => {
                audioEngine.play("click");
                setIsStrictModalOpen(true);
              }}
              className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/40 hover:to-blue-600/40 text-cyan-300 border border-cyan-500/40 shadow-sm cursor-pointer"
            >
              <Scale size={14} className="text-cyan-400" />
              <span>Validation Stricte</span>
            </button>
          </div>
        </div>
      </div>

      {activeMode === "inference" && (
        <IAPredictionInferencePanel
          skipTraining={skipTraining}
          onToggleSkipTraining={setSkipTraining}
          forcedOutsiderCount={forcedOutsiderCount}
          onChangeForcedOutsiderCount={setForcedOutsiderCount}
          loading={loading}
          error={error}
          prediction={prediction}
          globalRegimeLabel={globalRegime?.regime}
          hasGlobalRegime={Boolean(globalRegime)}
          isCopiedInference={isCopiedInference}
          isExportingPDF={isExportingPDF}
          onRunAIPrediction={runAIPrediction}
          onCopyTicket={handleCopyInferenceTicket}
          onExportJSON={handleExportInferenceJSON}
          onExportPDF={(pred) => {
            void handleExportNeuralPredictionPDF({
              drawName,
              suggestedNumbers: pred.suggestedNumbers,
              candidates: pred.candidates,
              confidence: pred.confidence,
              analysis: pred.analysis,
              mathModelSummary: pred.mathModelSummary,
              stabilityScore: pred.stabilityScore,
              diversityScore: pred.diversityScore,
              realityAlignment: pred.realityAlignment,
              adversarialSurvivalScore: pred.adversarialSurvivalScore,
              adversarialRisks: pred.adversarialRisks,
              challengedNumbers: pred.challengedNumbers,
              aiRationale: pred.aiRationale,
              aiStrategicAdvice: pred.aiStrategicAdvice,
              xapExp: pred.xapExp,
              aiWeights: pred.aiWeights,
              hyperparameters: pred.hyperparameters ? { ...pred.hyperparameters } : undefined,
              isLocalFallback: pred.isLocalFallback,
              timestamp: Date.now(),
            });
          }}
          onSaveToForensicLog={handleSaveToForensicLog}
        />
      )}

      {activeMode === "backtest" && (
        <IAPredictionBacktestPanel
          drawName={drawName}
          historyLength={history?.length || 0}
          backtestDepth={backtestDepth}
          maxCapableDepth={maxCapableDepth}
          isEligibleForBacktest={isEligibleForBacktest}
          backtestRunning={backtestRunning}
          backtestProgress={backtestProgress}
          backtestError={backtestError}
          backtestResults={backtestResults}
          stats={stats}
          chartData={chartData}
          onChangeBacktestDepth={setBacktestDepth}
          onRunBacktesting={runBacktesting}
        />
      )}

      {activeMode === "audit_log" && (
        <IAPredictionForensicLogPanel
          drawName={drawName}
          localHistoryCount={localHistory.length}
          loadingHistory={loadingHistory}
          forensicEntries={forensicEntries}
          filteredForensicEntries={filteredForensicEntries}
          engineComparisonStats={engineComparisonStats}
          oldLogsStats={oldLogsStats}
          autoPurgeEnabled={autoPurgeEnabled}
          isPurgingOldLogs={isPurgingOldLogs}
          showEngineComparison={showEngineComparison}
          isExportingPDF={isExportingPDF}
          expandedItem={expandedItem}
          forensicEngineFilter={forensicEngineFilter}
          forensicDateFilter={forensicDateFilter}
          forensicCustomDate={forensicCustomDate}
          forensicFilter={forensicFilter}
          forensicSort={forensicSort}
          onToggleAutoPurge={handleToggleAutoPurge}
          onManualPurgeOldLogs={handleManualPurgeOldLogs}
          onToggleEngineComparison={() => setShowEngineComparison(!showEngineComparison)}
          onExportForensicLogPDF={handleExportForensicLogPDF}
          onRequestClearAll={handleRequestClearAll}
          onRequestDeleteEntry={handleRequestDeleteEntry}
          onExportEntryPDF={handleExportNeuralPredictionPDF}
          onSetExpandedItem={setExpandedItem}
          onSetForensicEngineFilter={setForensicEngineFilter}
          onSetForensicDateFilter={setForensicDateFilter}
          onSetForensicCustomDate={setForensicCustomDate}
          onSetForensicFilter={setForensicFilter}
          onSetForensicSort={setForensicSort}
        />
      )}

      <StrictDrawValidationModal
        isOpen={isStrictModalOpen}
        onClose={() => setIsStrictModalOpen(false)}
        drawName={drawName}
      />

      <ConfirmModal
        isOpen={confirmState !== null}
        variant="danger"
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel={confirmState?.confirmLabel || "Confirmer"}
        onConfirm={() => {
          const fn = confirmState?.onConfirm;
          setConfirmState(null);
          fn?.();
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};
