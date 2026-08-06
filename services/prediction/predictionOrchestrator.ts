import { packHistory } from '../workers/zeroCopy';
import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { getAlgoWeights, normalizeWeights } from "./weightsManager";
import { extractFeatures, ExtractedFeatures } from "./featureExtractor";
import { calculateScores, applyPCADenoising, ScoredNumber } from "./scoringEngine";
import { generateCombination } from "./combinationGenerator";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { PredictiveHyperparameters } from "./hyperParameterTuner";
import { logger } from "../../utils/logger";
import PredictionWorker from "../workers/prediction.worker?worker";
import { EnhancedMetrics } from "./metrics.types";
import { initializeLcgForDraw } from "../../utils/mathUtils";
import { detectGameRegime, calculateShannonEntropy, calculateStatisticalBounds } from "../mathService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { globalCache, CACHE_TTL } from "../cache/CacheService";

// Split module imports
import { TUNING, applyDeterministicMicroSgd, hashHistoryContent, getMedian, getStdDev } from "./microSgd";
import { resolveForensicAdjustments } from "./forensicAdjustments";
import { getStoreStateSafely, handleScenarioADegradedPrediction, tryCloudPrediction } from "./predictionScenarios";
import { finalizePredictionPayload } from "./predictionFinalize";
import { calculatePoissonScores, calculateBayesianScore, calculateTemporalScores, calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores, calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance, calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores, calculateHawkesExcitation, calculateTopologicalLyapunov } from '../advancedMathService';
import { calculateSpatioTemporalHawkes } from '../../utils/engine/hawkesEngine';

const TICKET_SIZE = 5;

/**
 * Interface unifiée de contexte d'exécution pour le moteur de prédiction
 */
export interface PredictionRuntimeContext {
  drawName: string;
  rawHistory: DrawResult[];
  history: DrawResult[];
  temporalDepth: number;
  validTemporalDepth: number;
  weightsToUse?: AlgoWeights;
  metrics?: EnhancedMetrics;
  symbioticContext?: SymbioticContext;
  skipTraining: boolean;
  adversarialMode: boolean;
  forcedOutsiderCount?: number;
  isForensicOptimized: boolean;
  useSpatioTemporalHawkes: boolean;
  useCloudEngine?: boolean;
  onProgress?: (progress: number, message: string) => void;
  preloadedForensicReports?: ForensicReport[];
  contentHash: string;
}

/**
 * Construit le contexte d'exécution d'une prédiction
 */
export const buildPredictionRequestContext = (
  drawName: string,
  rawHistory: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
  useSpatioTemporalHawkesOverride?: boolean,
  useCloudEngineOverride?: boolean,
): PredictionRuntimeContext => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const contentHash = hashHistoryContent(history);
  const validTemporalDepth = Math.max(5, Math.min(temporalDepth, history.length));
  
  const storeDefaults = getStoreStateSafely();
  const useSpatioTemporalHawkes = useSpatioTemporalHawkesOverride ?? storeDefaults.useSpatioTemporalHawkes;
  const useCloudEngine = useCloudEngineOverride ?? storeDefaults.useCloudEngine;

  return {
    drawName,
    rawHistory,
    history,
    temporalDepth,
    validTemporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    useCloudEngine,
    onProgress,
    preloadedForensicReports,
    contentHash,
  };
};

/**
 * Yielding function to keep the main thread fluid
 */
export const yieldToUi = async () => {
  if (typeof window !== 'undefined') {
    await new Promise(r => setTimeout(r, 0));
  }
};

/**
 * Calcul parallèle des métriques avancées
 */
export const computeAdvancedMetrics = async (
  localHistoryContext: DrawResult[],
  drawName: string,
  hyperparameters: Partial<PredictiveHyperparameters>,
  useSpatioTemporalHawkes: boolean,
  metrics: EnhancedMetrics | undefined,
): Promise<EnhancedMetrics> => {
  const contentHash = hashHistoryContent(localHistoryContext);
  const cacheKey = globalCache.generateKey(
    'adv_metrics',
    drawName,
    `${localHistoryContext.length}_${contentHash}_${useSpatioTemporalHawkes ? 1 : 0}_${hyperparameters.bayesWindowRatio || 'def'}`
  );

  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      const poissonScores = calculatePoissonScores(localHistoryContext);
      await yieldToUi();
      const bayesScores = calculateBayesianScore(localHistoryContext, hyperparameters.bayesWindowRatio);
      await yieldToUi();
      const temporalScores = calculateTemporalScores(localHistoryContext);
      await yieldToUi();
      const digitalRootScores = calculateDigitalRootAnalysis(localHistoryContext);
      await yieldToUi();
      const resistanceScores = calculateResistanceScores(localHistoryContext);
      await yieldToUi();
      const gapVelocityScores = calculateGapVelocityScores(localHistoryContext);
      await yieldToUi();
      const leaderSuccessionScores = calculateLeaderSuccession(localHistoryContext);
      await yieldToUi();
      const aiIntuitionScores = calculateAiIntuition(localHistoryContext, (metrics || {}) as Record<string, unknown>);
      await yieldToUi();
      const fractalResonanceScores = calculateFractalResonance(localHistoryContext);
      await yieldToUi();
      const spatialHotSpots = calculateSpatialHotSpots(localHistoryContext, 0.5, hyperparameters.spatialSigma);
      await yieldToUi();
      const symbioticClusterScores = calculateCoOccurrenceScores(localHistoryContext);
      await yieldToUi();
      const anomalyScores = calculateAnomalyScores(localHistoryContext);
      await yieldToUi();
      const hawkesExcitationScores = useSpatioTemporalHawkes
        ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
        : calculateHawkesExcitation(localHistoryContext);
      await yieldToUi();
      const topologicalLyapunovScores = calculateTopologicalLyapunov(localHistoryContext, hyperparameters.lyapunovHorizon);
      await yieldToUi();

      for (const k in gapVelocityScores) {
        gapVelocityScores[k] *= (hyperparameters.gapVelocityWeight || 1.0);
      }
      for (const k in hawkesExcitationScores) {
        hawkesExcitationScores[k] *= ((hyperparameters.hawkesDecay || TUNING.DEFAULT_HAWKES_DECAY) / TUNING.DEFAULT_HAWKES_DECAY);
      }

      return {
        ...metrics,
        poisson: poissonScores,
        bayes: bayesScores,
        temporal: temporalScores,
        digitalRoot: digitalRootScores,
        resistance: resistanceScores,
        gapVelocity: gapVelocityScores,
        leaderSuccession: leaderSuccessionScores,
        aiIntuition: aiIntuitionScores,
        fractalResonance: fractalResonanceScores,
        spatial: spatialHotSpots,
        symbioticClusters: symbioticClusterScores,
        anomaly: anomalyScores,
        hawkesExcitation: hawkesExcitationScores,
        topologicalLyapunov: topologicalLyapunovScores
      };
    },
    CACHE_TTL.LONG
  );
};

/**
 * Pipeline local modulaire de prédiction
 */
export const runLocalPredictionPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(5, "Initialisation de l'ADN algorithmique...");
  initializeLcgForDraw(context.drawName);
  await yieldToUi();

  context.onProgress?.(10, "Optimisation des hyperparamètres...");
  const weights = await resolvePredictionWeights(context);
  await yieldToUi();

  context.onProgress?.(30, "Calcul des métriques avancées...");
  const advancedMetrics = await computeAdvancedMetricsBundle(context);
  await yieldToUi();

  context.onProgress?.(50, "Extraction des descripteurs de caractéristiques...");
  const features = await extractPredictionFeatures(context);
  await yieldToUi();

  context.onProgress?.(70, "Évaluation et scoring des numéros...");
  const baseScores = scorePredictionNumbers(context, features, weights, advancedMetrics);
  await yieldToUi();

  context.onProgress?.(80, "Résolution des ajustements forensiques...");
  const forensicAdjustments = await resolveForensicAdjustments(context, baseScores);
  await yieldToUi();

  context.onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
  const { rescored, enhancedMetrics } = rescoreWithAdjustments(context, features, weights, advancedMetrics, forensicAdjustments);
  await yieldToUi();

  context.onProgress?.(90, "Désensibilisation au bruit (PCA)...");
  const denoised = await applyPredictionDenoising(context, rescored, weights, enhancedMetrics);
  await yieldToUi();

  context.onProgress?.(95, "Formulation finale et sélection des combinaisons...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = await selectPredictionNumbers(context, denoised, features);
  await yieldToUi();

  context.onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");
  return await finalizePredictionPayload(context, denoised, selection, candidates, weights, enhancedMetrics, features, shrinkageApplied, shrinkageFactor);
};

/**
 * Pipeline local simplifié (Scénario de secours extrême)
 */
export const runLocalSimplifiedPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(10, "Lancement du pipeline Local Simplifié...");
  initializeLcgForDraw(context.drawName);

  const weights = normalizeWeights(context.weightsToUse || (await getAlgoWeights(context.drawName)));

  context.onProgress?.(30, "Calcul des métriques essentielles...");
  const subHistory = context.history.slice(0, context.validTemporalDepth);
  const statisticalBounds = calculateStatisticalBounds(subHistory);
  
  const advancedMetrics: EnhancedMetrics = {
    statisticalBounds,
    frequencies: subHistory.reduce((acc, draw) => {
      draw.gagnants.forEach(num => {
        acc[num] = (acc[num] || 0) + 1;
      });
      return acc;
    }, {} as Record<number, number>)
  };

  context.onProgress?.(55, "Extraction des descripteurs de caractéristiques essentiels...");
  const features = await extractPredictionFeatures(context);

  context.onProgress?.(75, "Évaluation essentielle des numéros...");
  const baseScores = calculateScores(
    features,
    weights,
    advancedMetrics,
    subHistory
  );

  context.onProgress?.(90, "Formulation finale et sélection (Mode Secours)...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = await selectPredictionNumbers(context, baseScores, features);

  context.onProgress?.(100, "Calcul de secours achevé avec succès !");
  return await finalizePredictionPayload(
    context,
    baseScores,
    selection,
    candidates,
    weights,
    advancedMetrics,
    features,
    shrinkageApplied,
    shrinkageFactor
  );
};

export const resolvePredictionWeights = async (context: PredictionRuntimeContext): Promise<AlgoWeights> => {
  let weights = normalizeWeights(context.weightsToUse || (await getAlgoWeights(context.drawName)));
  
  if (!context.skipTraining) {
    // 1. Appliquer le meta-learning de Kalman à partir des rapports forensiques locaux (autopsies post-mortem précédentes)
    try {
      const { applyMetaLearning } = await import("./weightsManager");
      weights = await applyMetaLearning(weights, context.history, context.drawName);
    } catch (err) {
      logger.warn({ err }, "Échec de l'intégration du calibrage de Kalman post-mortem.");
    }
  }
  
  if (!context.skipTraining && context.history.length >= 10) {
    const currentEntropyResult = calculateShannonEntropy(context.history);
    const currentEntropy = currentEntropyResult.normalized;
    weights = await applyDeterministicMicroSgd(
      context.drawName,
      weights,
      context.history,
      currentEntropy,
      undefined,
      context.useSpatioTemporalHawkes
    );
  }
  return weights;
};

export const computeAdvancedMetricsBundle = async (context: PredictionRuntimeContext): Promise<EnhancedMetrics> => {
  return await computeAdvancedMetrics(
    context.history.slice(0, context.validTemporalDepth),
    context.drawName,
    { hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY, gapVelocityWeight: 1.0 },
    context.useSpatioTemporalHawkes,
    context.metrics
  );
};

export const extractPredictionFeatures = async (context: PredictionRuntimeContext) => {
  return await extractFeatures(
    context.drawName,
    context.history.slice(0, context.validTemporalDepth),
    context.validTemporalDepth
  );
};

export const scorePredictionNumbers = (
  context: PredictionRuntimeContext,
  features: ExtractedFeatures,
  weights: AlgoWeights,
  advancedMetrics: EnhancedMetrics
) => {
  return calculateScores(
    features,
    weights,
    advancedMetrics,
    context.history.slice(0, context.validTemporalDepth)
  );
};

export const rescoreWithAdjustments = (
  context: PredictionRuntimeContext,
  features: ExtractedFeatures,
  weights: AlgoWeights,
  advancedMetrics: EnhancedMetrics,
  forensicAdjustments: {
    recentReports: ForensicReport[];
    proximityScores: Record<number, number>;
    missedScores: Record<number, number>;
    driftScores: Record<number, number>;
    dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
    oracleDriftMap: Record<string, number>;
  }
): { rescored: ScoredNumber[]; enhancedMetrics: EnhancedMetrics } => {
  const enhancedMetrics: EnhancedMetrics = {
    ...advancedMetrics,
    proximityDiagnostic: forensicAdjustments.proximityScores,
    missedModulator: forensicAdjustments.missedScores,
    driftCorrection: forensicAdjustments.driftScores,
    symbioticClusters: {},
    entropyRegime: {},
    anomalyDetection: (advancedMetrics.anomaly as Record<number, number> | undefined) || {},
    symbioticContext: context.symbioticContext,
    dynamicWeightModifiers: forensicAdjustments.dynamicWeightModifiers,
  };

  const rescored = calculateScores(
    features,
    weights,
    enhancedMetrics,
    context.history.slice(0, context.validTemporalDepth)
  );

  return { rescored, enhancedMetrics };
};

export const applyPredictionDenoising = async (
  _context: PredictionRuntimeContext,
  rescored: ScoredNumber[],
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics
): Promise<ScoredNumber[]> => {
  return await applyPCADenoising(rescored, weights, enhancedMetrics);
};

export const selectPredictionNumbers = async (
  context: PredictionRuntimeContext,
  denoisedScores: ScoredNumber[],
  features: ExtractedFeatures
): Promise<{
  selection: number[];
  candidates: number[];
  shrinkageApplied: boolean;
  shrinkageFactor: number;
}> => {
  const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
  
  const top10Scores = sortedScores.slice(0, 10).map(s => s.score);
  const gap = top10Scores[0] - top10Scores[9];
  
  let shrinkageApplied = false;
  let shrinkageFactor = 1.0;
  
  if (gap < 8.0) {
    shrinkageApplied = true;
    shrinkageFactor = Math.max(0.7, 0.7 + 0.3 * (gap / 8.0));
    logger.info(
      { gap, shrinkageFactor },
      "[predictionOrchestrator] Scenario E : Instabilité des scores détectée. Application d'un shrinkage continu."
    );
    sortedScores.forEach(s => {
      s.score = s.score * shrinkageFactor;
    });
  }

  const outsiderCount = context.forcedOutsiderCount !== undefined ? context.forcedOutsiderCount : 2;
  const empiricalCalibration = generateEmpiricalCalibration(context.history);
  const gameRegimeInfo = detectGameRegime(context.history);
  const regimeStateNormalized = Math.max(0, Math.min(1,
    (gameRegimeInfo.volatility / 100.0 + gameRegimeInfo.entropy) / 2.0
  ));

  const selection = await generateCombination(
    sortedScores,
    features.affinityMap,
    empiricalCalibration,
    outsiderCount,
    context.history[0]?.gagnants,
    regimeStateNormalized
  );

  const maxCandidates = (shrinkageApplied || context.adversarialMode) ? 15 : 10;
  const candidates = sortedScores
    .slice(5, 5 + maxCandidates)
    .map(s => s.num)
    .filter(n => !selection.includes(n))
    .slice(0, 10);

  return {
    selection,
    candidates,
    shrinkageApplied,
    shrinkageFactor,
  };
};

/**
 * Generates a short, fast FNV-1a hash of weights to avoid long JSON.stringify keys
 */
export const hashWeights = (weights?: AlgoWeights): string => {
  if (!weights) return "def";
  const keys = Object.keys(weights).sort();
  let h = 0x811c9dc5;
  for (const k of keys) {
    const val = (weights as Record<string, number>)[k];
    if (val !== undefined && val !== 0) {
      const s = `${k}:${Math.round(val * 10000)}`;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    }
  }
  return (h >>> 0).toString(16);
};

interface PendingWorkerTask {
  resolve: (result: Prediction) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  onProgress?: (progress: number, message: string) => void;
}

let activePredictionWorker: InstanceType<typeof PredictionWorker> | null = null;
const pendingWorkerTasks = new Map<string, PendingWorkerTask>();

const getOrCreatePredictionWorker = (): InstanceType<typeof PredictionWorker> => {
  if (!activePredictionWorker) {
    activePredictionWorker = new PredictionWorker();

    activePredictionWorker.onmessage = (e: MessageEvent) => {
      const { taskId, success, result, error, isProgress, progress, message } = e.data;
      const pending = pendingWorkerTasks.get(taskId);
      if (!pending) return;

      if (isProgress) {
        pending.onProgress?.(progress, message);
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingWorkerTasks.delete(taskId);

      if (success) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || "Erreur inconnue du worker de prédiction"));
      }
    };

    activePredictionWorker.onerror = (err) => {
      logger.error({ err }, "[predictionOrchestrator] Web Worker error, réinitialisation de l'instance de worker");
      for (const [, pending] of pendingWorkerTasks.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Web Worker de prédiction a rencontré une erreur fatale"));
      }
      pendingWorkerTasks.clear();
      if (activePredictionWorker) {
        activePredictionWorker.terminate();
        activePredictionWorker = null;
      }
    };
  }
  return activePredictionWorker;
};

const runLocalPredictionViaWorker = async (
  context: PredictionRuntimeContext
): Promise<Prediction> => {
  if (typeof Worker !== "undefined") {
    return new Promise<Prediction>((resolve, reject) => {
      try {
        const worker = getOrCreatePredictionWorker();
        const taskId = `MASTER_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const timeoutId = setTimeout(() => {
          pendingWorkerTasks.delete(taskId);
          if (activePredictionWorker) {
            activePredictionWorker.terminate();
            activePredictionWorker = null;
          }
          reject(new Error("Timeout du Web Worker de prédiction locale"));
        }, 60000);

        pendingWorkerTasks.set(taskId, {
          resolve,
          reject,
          timeoutId,
          onProgress: context.onProgress,
        });

        const packed = packHistory(context.history as any);
        worker.postMessage({
          taskId,
          type: "master",
          drawName: context.drawName,
          historyBuffer: packed.historyBuffer,
          drawCount: packed.drawCount,
          winningCount: packed.winningCount,
          totalCols: packed.totalCols,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        }, [packed.historyBuffer]);
      } catch (workerError) {
        reject(workerError);
      }
    });
  } else {
    throw new Error("Web Worker non supporté dans cet environnement");
  }
};

export const generateMasterPrediction = async (
  drawName: string,
  rawHistory: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): Promise<Prediction> => {
  const context = buildPredictionRequestContext(
    drawName,
    rawHistory,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    onProgress,
    preloadedForensicReports
  );

  // SCÉNARIO A — Dataset insuffisant (Moins de 12 tirages)
  if (context.history.length < 12) {
    return handleScenarioADegradedPrediction(context);
  }

  const weightsHash = hashWeights(context.weightsToUse);
  const keyParams = `${context.history.length}_${context.contentHash}_w_${weightsHash}_adv_${context.adversarialMode}_outsider_${context.forcedOutsiderCount ?? "none"}_depth_${context.temporalDepth}_forensic_${context.isForensicOptimized}`;
  const cacheKey = globalCache.generateKey('prediction', context.drawName, keyParams);

  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      // PHASE 1 — Cloud Complet
      try {
        const cloudResult = await tryCloudPrediction(context);
        if (cloudResult) {
          return cloudResult;
        }
      } catch (e) {
        logger.warn(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionOrchestrator] Échec technique ou transport du Cloud complet. Basculement sur le Local complet."
        );
      }

      // PHASE 2 — Local Complet
      try {
        context.onProgress?.(25, "Lancement du pipeline Local Complet...");
        if (typeof Worker !== "undefined") {
          try {
            return await runLocalPredictionViaWorker(context);
          } catch (workerErr) {
            logger.error(
              { drawName: context.drawName, error: workerErr instanceof Error ? workerErr.message : String(workerErr) },
              "[predictionOrchestrator] Échec du Web Worker de prédiction locale. AUCUN basculement sur le thread principal pour éviter les freezes."
            );
            throw workerErr;
          }
        } else {
            logger.warn("[predictionOrchestrator] Web Workers non supportés, passage direct au Local Simplifié.");
            throw new Error("Web Workers non supportés");
        }
      } catch (e) {
        const isWorkerUnsupported = e instanceof Error && e.message === "Web Workers non supportés";
        if (isWorkerUnsupported) {
          logger.info(
            { drawName: context.drawName },
            "[predictionOrchestrator] Web Workers non supportés. Redirection automatique vers Local Simplifié."
          );
        } else {
          logger.error(
            { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
            "[predictionOrchestrator] Échec analytique du Local Complet. Tentative de secours via Local Simplifié."
          );
        }
      }

      // PHASE 3 — Local Simplifié
      try {
        context.onProgress?.(60, "Exécution du pipeline Local Simplifié (Mode Secours)...");
        return await runLocalSimplifiedPipeline(context);
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionOrchestrator] Échec critique du Local Simplifié. Repli final sur la Réponse Prudente Dégradée."
        );
      }

      // PHASE 4 — Réponse Prudente Dégradée
      return handleScenarioADegradedPrediction(context);
    },
    CACHE_TTL.MEDIUM,
    context.drawName
  );
};

/**
 * Version rétro-compatible de l'orchestration locale pure (exécutée par les Web Workers)
 */
export const generateMasterPredictionCore = async (
  drawName: string,
  history: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  useSpatioTemporalHawkes: boolean = true,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): Promise<Prediction> => {
  const context = buildPredictionRequestContext(
    drawName,
    history,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    onProgress,
    preloadedForensicReports
  );
  context.useSpatioTemporalHawkes = useSpatioTemporalHawkes;

  if (context.history.length < 12) {
    return handleScenarioADegradedPrediction(context);
  }

  return await runLocalPredictionPipeline(context);
};
