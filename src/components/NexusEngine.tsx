import React, { useEffect, useMemo, useRef } from "react";
import { useNexusStore } from "../store/useNexusStore";
import { useDrawHistory, useNexusAnalytics } from "../hooks/useLottery";
import {
  getAlgoWeights,
  generateMasterPrediction,
  hashWeights,
} from "../services/prediction/predictionFacade";
import { generateEmpiricalCalibration } from "../services/prediction/ticketAnalysisService";
import { generateSmartInsights } from "../services/insightService";
import {
  getPredictionHistoryAsync,
  calculateExtendedHistoricalPerformance,
  linkPredictionToResult,
  findMatchingResultForPrediction,
} from "../services/predictionHistoryService";
import {
  performForensicAnalysis,
  saveForensicReport,
  syncForensicReportsWithCloud,
  getLocalForensicReports,
} from "../services/postPredictionAnalysisService";
import { reconcileDnaLogsWithDrawResult } from "../services/prediction/dnaAuditLogService";
import {
  DRAW_DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  UNIFORM_BRIER_REFERENCE,
  UNIFORM_SINGLE_NUMBER_PROBABILITY,
} from "../shared/drawTheory";
import type { CalibrationData } from "../types";
import { AppError, logError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { useAutonomousAgent } from "../hooks/useAutonomousAgent";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

export const NexusEngine: React.FC = () => {
  useAutonomousAgent(); // Initialize the autonomous agent daemon
  const drawName = useNexusStore((s) => s.drawName);
  const temporalDepth = useNexusStore((s) => s.temporalDepth);
  const globalWeights = useNexusStore((s) => s.globalWeights);
  const isForensicOptimized = useNexusStore((s) => s.isForensicOptimized);
  const useSpatioTemporalHawkes = useNexusStore(
    (s) => s.useSpatioTemporalHawkes,
  );
  const useCloudEngine = useNexusStore((s) => s.useCloudEngine);
  const setHistoryData = useNexusStore((s) => s.setHistoryData);
  const setAnalyticsData = useNexusStore((s) => s.setAnalyticsData);
  const setLoading = useNexusStore((s) => s.setLoading);
  const setLastPrediction = useNexusStore((s) => s.setLastPrediction);
  const setSmartInsights = useNexusStore((s) => s.setSmartInsights);
  const setCalibration = useNexusStore((s) => s.setCalibration);
  const setEmpiricalCalibration = useNexusStore(
    (s) => s.setEmpiricalCalibration,
  );

  // Direct length store selectors are replaced with content-aware logic below to prevent stale state on identical draw sizes

  // --- DATA FETCHING VIA REACT QUERY ---
  const {
    data: rawHistory,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useDrawHistory(drawName);

  // Assurer l'isolation hermétique et la convergence (TIRAGE ISOLATION RULE)
  const history = useMemo(() => {
    return purifyHistoryForDraw(drawName, rawHistory || []);
  }, [drawName, rawHistory]);

  const { data: analytics, isLoading: analyticsLoading } = useNexusAnalytics(
    drawName,
    history,
  );

  const loading = historyLoading || analyticsLoading;
  const lastComputedDrawKeyRef = useRef<string>("");

  // Sync loading state
  useEffect(() => {
    setLoading(loading);
  }, [loading, setLoading]);

  // Force refetch on store rehydration
  useEffect(() => {
    const handleRehydrated = () => {
      logger.debug(
        "[NexusEngine] Store rehydration detected, forcing full state synchronization...",
      );
      refetchHistory();
    };
    window.addEventListener("NEXUS_STORE_REHYDRATED", handleRehydrated);
    return () =>
      window.removeEventListener("NEXUS_STORE_REHYDRATED", handleRehydrated);
  }, [refetchHistory]);

  // 1. Initialisation Configuration (Hydratation sans ré-écriture superflue)
  useEffect(() => {
    let mounted = true;
    const initConfig = async () => {
      const weights = await getAlgoWeights(drawName);
      if (mounted && useNexusStore.getState().drawName === drawName) {
        const current = useNexusStore.getState().globalWeights;
        if (JSON.stringify(current) !== JSON.stringify(weights)) {
          useNexusStore.setState({ globalWeights: weights });
        }
      }
    };
    initConfig();
    return () => {
      mounted = false;
    };
  }, [drawName]);

  // 2. Calcul des Stats basiques (Rapide, synchrone)
  useEffect(() => {
    if (!history || history.length === 0) {
      const currentStoreHistory = useNexusStore.getState().history;
      if (currentStoreHistory.length > 0) {
        setHistoryData([], [], []);
      }
      return;
    }

    const storeHistory = useNexusStore.getState().history;
    const hasDrawNameMismatch =
      history.length > 0 &&
      storeHistory.length > 0 &&
      (history[0].drawName !== storeHistory[0].drawName ||
        history[0].draw_name !== storeHistory[0].draw_name);

    if (
      storeHistory.length !== history.length ||
      hasDrawNameMismatch ||
      storeHistory.length === 0
    ) {
      const counts: Record<number, number> = {};
      const safeHist = Array.isArray(history) ? history : [];
      safeHist.forEach((d) => {
        if (d && Array.isArray(d.gagnants)) {
          d.gagnants.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
        }
      });
      const computedStats = Object.entries(counts)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count);

      const computedGaps: { number: number; gap: number }[] = [];
      for (let i = 1; i <= 90; i++) {
        let gap = 0;
        for (const draw of safeHist) {
          if (draw?.gagnants && Array.isArray(draw.gagnants) && draw.gagnants.includes(i)) break;
          gap++;
        }
        computedGaps.push({ number: i, gap });
      }

      const empCal = generateEmpiricalCalibration(history);
      setEmpiricalCalibration(empCal);

      setHistoryData(history, computedStats, computedGaps);
    }
  }, [history, setHistoryData, setEmpiricalCalibration]);

  // Sync Analytics
  useEffect(() => {
    if (analytics) {
      setAnalyticsData(analytics);
    }
  }, [analytics, setAnalyticsData]);

  // 3. Génération Prédiction & Insights (Dépendant des Analytics et Weights)
  useEffect(() => {
    if (!analytics || !history || history.length < 10) return;

    let mounted = true;
    const runEngine = async () => {
      try {
        // Insights
        const insights = await generateSmartInsights(
          drawName,
          history,
          analytics.spectral,
          analytics.regularity.map((r) => ({
            number: r.number,
            gap: r.currentGap,
          })),
          analytics.regularity,
        );
        if (mounted) setSmartInsights(insights);

        // Clé de version complète (tirage + historique + poids + profondeur + options moteur)
        const currentDataKey = `${drawName}_${history.length}_${history[0]?.date || ""}_${hashWeights(globalWeights)}_${temporalDepth}_${isForensicOptimized ? 1 : 0}_${useSpatioTemporalHawkes ? 1 : 0}_${useCloudEngine ? 1 : 0}`;
        const currentPred = useNexusStore.getState().lastPrediction;

        // Génération automatique si aucune prédiction active ou si la configuration/données ont évolué
        if (!currentPred || currentPred.drawName !== drawName || lastComputedDrawKeyRef.current !== currentDataKey) {
          lastComputedDrawKeyRef.current = currentDataKey;
          const prediction = await generateMasterPrediction(
            drawName,
            history,
            temporalDepth,
            globalWeights,
            {
              spectral: analytics.spectral,
              correlationMatrix: analytics.correlationMatrix,
              regularity: analytics.regularity,
            },
            analytics.symbioticContext || undefined,
            false,
            false,
            undefined,
            isForensicOptimized,
            undefined,
            undefined,
            useSpatioTemporalHawkes,
            useCloudEngine,
          );
          if (mounted) setLastPrediction(prediction);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logError(
          new AppError(msg || "Engine Error", "NEXUS_ENGINE_ERROR", "high", {
            error: e,
          }),
          { source: "NexusEngine" },
        );
      }
    };

    const t = setTimeout(() => {
      runEngine();
    }, 250);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [
    drawName,
    history,
    analytics,
    globalWeights,
    temporalDepth,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    useCloudEngine,
    setLastPrediction,
    setSmartInsights,
  ]);

  // 4. Calibration & Forensic Automator (Dépendant de l'historique uniquement)
  useEffect(() => {
    if (!history || history.length < 10) return;

    let mounted = true;
    const runCalibration = async () => {
      try {
        // Calibration (Backtesting historique des prédictions)
        const preds = await getPredictionHistoryAsync(drawName);
        if (preds.length > 0 && mounted) {
          // Preload all local forensic reports to prevent O(N * M) IndexedDB lookups/parsing inside the loop
          const allLocalReports = await getLocalForensicReports();

          // --- AUTO-LINKER, DNA RECONCILER & FORENSIC AUTOMATOR ---
          let historyChanged = false;
          let forensicGenerated = false;
          const reconciledResultIds = new Set<string>();

          // Seules les 10 dernières prédictions (les plus récentes) ont besoin d'être vérifiées et analysées en arrière-plan.
          // Cela évite de recalculer l'analyse forensique pour des centaines de vieux tirages à chaque changement de jeu.
          const relevantPreds = preds.slice(0, 10);

          // Chunk the processing to avoid blocking main thread
          for (let i = 0; i < relevantPreds.length; i++) {
            if (!mounted) break;
            const item = relevantPreds[i];
            let match = item.drawResultId
              ? history.find((r) => r.id === item.drawResultId)
              : null;

            if (!item.drawResultId) {
              match = findMatchingResultForPrediction(item, history);
              if (match) {
                await linkPredictionToResult(item.id, match.id);
                historyChanged = true;
              }
            }

            // Automate Forensic Analysis & DNA reconciliation if matched
            if (match) {
              if (!reconciledResultIds.has(match.id)) {
                reconciledResultIds.add(match.id);
                try {
                  await reconcileDnaLogsWithDrawResult(drawName, match, history);
                } catch (e) {
                  console.warn("Auto-DNA reconciliation failed for", match.id, e);
                }
              }

              const existingReport = allLocalReports.find(
                (r) => r.predictionId === item.id,
              );
              if (!existingReport) {
                try {
                  const report = await performForensicAnalysis(
                    drawName,
                    match.date,
                    item.prediction.suggestedNumbers,
                    match.gagnants,
                    item.prediction.breakdown,
                    item.id,
                    match.id,
                    true, // skipLLM for automated background analysis
                    history,
                  );
                  await saveForensicReport(report);
                  forensicGenerated = true;
                } catch (e) {
                  console.warn("Auto-Forensic failed for", item.id, e);
                }
              }
            }

            // Yield to event loop every 5 items to keep UI responsive
            if (i % 5 === 0) {
              await new Promise((r) => setTimeout(r, 5));
            }
          }

          if (forensicGenerated && mounted) {
            syncForensicReportsWithCloud().catch((e) =>
              console.error("Auto-sync forensic failed", e),
            );
          }

          // Recalculate empirical calibration strictly from matched draws & 5/90 H0 baseline (zero magic numbers)
          const updatedPreds = historyChanged
            ? await getPredictionHistoryAsync(drawName)
            : preds;
          const perf = calculateExtendedHistoricalPerformance(updatedPreds, history);

          const matchedPairs = updatedPreds
            .map((pred) => {
              const res =
                (pred.drawResultId
                  ? history.find((r) => r.id === pred.drawResultId)
                  : null) || findMatchingResultForPrediction(pred, history);
              if (!res || !Array.isArray(res.gagnants)) return null;
              const suggested = pred.prediction?.suggestedNumbers || [];
              const hits = suggested.filter((n) => res.gagnants.includes(n)).length;
              const observedRate = suggested.length > 0 ? hits / suggested.length : 0;
              const rawConf = pred.prediction?.confidence;
              const predictedProb =
                typeof rawConf === "number" && Number.isFinite(rawConf)
                  ? Math.min(1, Math.max(0, rawConf / 100))
                  : UNIFORM_SINGLE_NUMBER_PROBABILITY;
              return { timestamp: pred.timestamp, observedRate, predictedProb };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

          const sampleCount = matchedPairs.length;
          const baseline = UNIFORM_BRIER_REFERENCE;
          const overallScore =
            sampleCount > 0 ? perf.meanBrierScore : Number(baseline.toFixed(4));
          const meanObservedRate =
            sampleCount > 0
              ? matchedPairs.reduce((acc, p) => acc + p.observedRate, 0) / sampleCount
              : UNIFORM_SINGLE_NUMBER_PROBABILITY;
          const variance =
            sampleCount > 1
              ? matchedPairs.reduce(
                  (acc, p) => acc + Math.pow(p.observedRate - meanObservedRate, 2),
                  0,
                ) /
                (sampleCount - 1)
              : UNIFORM_BRIER_REFERENCE / DRAW_PICK_SIZE;
          const meanPredictedProb =
            sampleCount > 0
              ? matchedPairs.reduce((acc, p) => acc + p.predictedProb, 0) / sampleCount
              : UNIFORM_SINGLE_NUMBER_PROBABILITY;
          const h0Std = Math.sqrt(UNIFORM_BRIER_REFERENCE / DRAW_PICK_SIZE);
          const biasDelta = meanPredictedProb - meanObservedRate;
          const bias: CalibrationData["bias"] =
            sampleCount === 0 || Math.abs(biasDelta) <= h0Std
              ? "NEUTRAL"
              : biasDelta > 0
                ? "OPTIMIST"
                : "PESSIMIST";

          let trend = 0;
          if (sampleCount >= 2) {
            const meanIdx = (sampleCount - 1) / 2;
            let num = 0;
            let den = 0;
            for (let idx = 0; idx < sampleCount; idx++) {
              const dx = idx - meanIdx;
              num += dx * (matchedPairs[idx].observedRate - meanObservedRate);
              den += dx * dx;
            }
            trend = den > 0 ? Number((num / den).toFixed(4)) : 0;
          }

          const cycleReference = DRAW_DOMAIN_SIZE / DRAW_PICK_SIZE;
          const confidence = Number(
            (sampleCount / (sampleCount + cycleReference)).toFixed(4),
          );
          const brierSkillVsUniform =
            baseline > 0 ? 1 - overallScore / baseline : 0;
          const reliability =
            sampleCount > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round((0.5 + 0.5 * Math.tanh(brierSkillVsUniform)) * 100),
                  ),
                )
              : 0;

          if (mounted) {
            setCalibration({
              overallScore,
              reliability,
              bias,
              sampleSize: sampleCount,
              baseline: Number(baseline.toFixed(4)),
              variance: Number(variance.toFixed(5)),
              trend,
              confidence,
            });
          }
        }
      } catch (e: unknown) {
        console.error("Calibration Error", e);
      }
    };

    const t = setTimeout(() => {
      runCalibration();
    }, 2000); // give the UI time to render first
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [drawName, history, setCalibration]);

  // Override refresh in store to use React Query refetch
  useEffect(() => {
    useNexusStore.setState({
      refresh: async () => {
        await refetchHistory();
      },
      refreshData: async (name: string, force?: boolean) => {
        useNexusStore.getState().setDrawName(name);
        if (force) {
          await refetchHistory();
        }
      },
    });
  }, [refetchHistory]);

  return null; // Headless component
};
