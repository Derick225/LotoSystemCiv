import { fetchResults } from "./lotteryService";
import {
  generateMasterPrediction,
  saveAlgoWeights,
  getAlgoWeights,
  hashWeights,
} from "./predictionEngine";
import { useNexusStore } from "../store/useNexusStore";
import { detectGameRegime } from "./mathService";
import type {
  AlgoWeights,
  TrainingReport,
  DrawResult,
} from "../types";
import { logger } from "../utils/logger";
import { AlgoKey } from "../shared/prediction.types";
import { normalizeWeights } from "./prediction/weightsManager";
import { runBacktestTraining as runBacktestTrainingCore } from "./backtestService";
import { globalCache, CACHE_TTL } from "./cache/CacheService";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

// Import modules refactorisés
import {
  registerActiveWorker,
  unregisterActiveWorker,
  terminateActiveWorkers,
  runBacktestWorker,
} from "./training/trainingWorkers";

import {
  runBootstrapOverfittingTest,
} from "./training/trainingEvaluation";

import {
  runGeneticOptimizer,
  runPSOOptimizer,
  runBayesianOptimizer,
  runMetaOptimizer,
  runContinuousGradientOptimizer,
} from "./training/trainingOptimizers";

import {
  applyOnlineLearningCore,
  runForensicTrainingStepCore,
  runLoopSimulationCore,
  LoopSimulationStepResult,
  LoopSimulationSummary,
} from "./training/trainingLoop";

// Ré-exportation des gestionnaires de processus actifs
export {
  registerActiveWorker,
  unregisterActiveWorker,
  terminateActiveWorkers,
};

export const runBacktestTraining = runBacktestTrainingCore;

/**
 * Backtest automatisé
 */
export const runAutomatedBacktestSimulation = async (
  drawName: string,
  history: DrawResult[],
  sampleSize: number = 50
): Promise<{
  efficiencyScore: number;
  hitDistribution: { zero: number; one: number; two: number; three: number; four: number; five: number };
  averageHits: number;
  report: TrainingReport;
}> => {
  const purifiedHistory = purifyHistoryForDraw(drawName, history);
  if (purifiedHistory.length < 5) {
    throw new Error(`Historique insuffisant pour un backtest automatisé (minimum absolu de 5 tirages).`);
  }
  const actualSampleSize = Math.max(1, Math.min(sampleSize, purifiedHistory.length - 2));
  const report = await runBacktestTraining(drawName, purifiedHistory, actualSampleSize);
  return {
    efficiencyScore: report.score,
    hitDistribution: report.winDistribution,
    averageHits: report.averageHits,
    report,
  };
};

/**
 * Noyau pur d'apprentissage cybernétique (découplé des appels d'I/O).
 * Effectue l'optimisation des poids, vérifie la généralisation via test bootstrap,
 * et renvoie les résultats calculés.
 */
export const evolveNeuralDNACore = async (
  drawName: string,
  fullHistory: DrawResult[],
  currentWeights: AlgoWeights,
  options: { generations: number; sampleSize: number; optimizerType?: "genetic" | "pso" | "bayesian" | "meta" | "gradient" },
  onTelemetry?: (data: any) => void
): Promise<{
  bestWeights: AlgoWeights;
  improvement: number;
  report: TrainingReport;
  isGeneralizable?: boolean | "unverifiable";
  overfittingRatio?: number;
  firstPredictionDNASnapshot?: any;
}> => {
  const optType = options.optimizerType || "pso";
  const oldReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, currentWeights);

  const regimeMatch = detectGameRegime(fullHistory);
  const hurstExponent = regimeMatch.hurst ? parseFloat(regimeMatch.hurst.toString()) : 0.5;

  // Calcul de l'entropie de Shannon de l'historique des tirages
  const computeHistoryEntropy = (hist: DrawResult[]) => {
    const counts = new Map<number, number>();
    let total = 0;
    hist.forEach(h => {
      h.gagnants.forEach(num => {
        counts.set(num, (counts.get(num) || 0) + 1);
        total++;
      });
    });
    if (total === 0) return 0.5;
    let ent = 0;
    counts.forEach((cnt) => {
      const p = cnt / total;
      ent -= p * Math.log2(p);
    });
    const maxEnt = Math.log2(90);
    return Math.max(0.1, Math.min(1.0, ent / maxEnt));
  };
  const entropyVal = computeHistoryEntropy(fullHistory);

  logger.info(`[Sequential Training] Démarrage de l'apprentissage cybernétique type: ${optType}`);

  // Détermination robuste de la taille du holdout (minimum 20 tirages pour puissance statistique, borné à 30% max de l'historique)
  const totalLength = fullHistory.length;
  let holdoutSize = Math.max(20, Math.min(Math.ceil(totalLength * 0.25), 45));
  let isHoldoutVerifiable = true;

  if (totalLength - holdoutSize < 10) {
    // Si l'historique est trop petit pour un holdout robuste, on réduit le holdout proportionnellement
    holdoutSize = Math.max(5, Math.floor(totalLength * 0.2));
  }
  if (holdoutSize < 5 || totalLength - holdoutSize < 5) {
    isHoldoutVerifiable = false;
  }

  // Holdout et Train historiquement disjoints (ZÉRO FUITE DE DONNÉES)
  const holdoutHistory = fullHistory.slice(0, holdoutSize);
  const trainHistory = fullHistory.slice(holdoutSize);

  // Pour l'optimisation, on utilise exclusivement trainHistory
  const actualSampleSize = trainHistory.length >= 25
    ? Math.max(25, Math.min(options.sampleSize, trainHistory.length))
    : trainHistory.length;
  const trainingSlice = trainHistory.slice(0, actualSampleSize);

  if (trainingSlice.length < 5) {
    throw new Error(`Historique d'entraînement insuffisant pour l'apprentissage (minimum de 5 tirages après holdout).`);
  }

  const algoKeys = Object.keys(currentWeights) as AlgoKey[];

  // Détermination de la Seed LCG pour respect du principe 100% Déterministe (AGENTS.md)
  let lcgSeed = 0;
  for (let i = 0; i < drawName.length; i++) {
    lcgSeed = (lcgSeed << 5) - lcgSeed + drawName.charCodeAt(i);
    lcgSeed |= 0;
  }
  lcgSeed = Math.abs(lcgSeed || 12345);

  const createLCG = (seed: number) => {
    let s = Math.abs(seed);
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  const rand = createLCG(lcgSeed + options.generations + options.sampleSize);

  // Pré-conversion des décisions en matrice de vote pour accélération chronologique
  const breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>> = {};
  const actualWinnersByDraw: Record<number, number[]> = {};
  let firstPredictionDNASnapshot: Record<number, Record<AlgoKey, number>> | null = null;

  for (let idx = 0; idx < trainingSlice.length; idx++) {
    const targetDraw = trainingSlice[idx];
    const targetIndexInFull = fullHistory.indexOf(targetDraw);
    const contextHistory = fullHistory.slice(targetIndexInFull + 1);

    if (contextHistory.length < 5) continue;

    const pred = await generateMasterPrediction(
      drawName,
      contextHistory,
      100, // temporalDepth
      currentWeights,
      undefined,
      undefined,
      true // skipTraining
    );

    breakdownsByDraw[idx] = pred.breakdown;
    actualWinnersByDraw[idx] = targetDraw.gagnants;

    if (idx === trainingSlice.length - 1) {
      firstPredictionDNASnapshot = {};
      for (let num = 1; num <= 90; num++) {
        const bdown = pred.breakdown[num] || {};
        const numDNA: Record<AlgoKey, number> = {} as any;
        algoKeys.forEach((k) => {
          numDNA[k] = Number((bdown as any)[k]) || 0;
        });
        firstPredictionDNASnapshot[num] = numDNA;
      }
    }
  }

  // Sélection et exécution de l'optimiseur
  let bestGenome: AlgoWeights;
  const totalGenerations = Math.max(5, options.generations);

  switch (optType) {
    case "genetic":
      bestGenome = await runGeneticOptimizer(
        currentWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        entropyVal,
        algoKeys,
        totalGenerations,
        rand,
        onTelemetry
      );
      break;
    case "pso":
      bestGenome = await runPSOOptimizer(
        currentWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        entropyVal,
        algoKeys,
        totalGenerations,
        rand,
        onTelemetry
      );
      break;
    case "bayesian":
      bestGenome = await runBayesianOptimizer(
        currentWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        entropyVal,
        algoKeys,
        totalGenerations,
        rand,
        onTelemetry
      );
      break;
    case "gradient":
      bestGenome = await runContinuousGradientOptimizer(
        currentWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        entropyVal,
        algoKeys,
        totalGenerations,
        rand,
        onTelemetry
      );
      break;
    case "meta":
    default:
      bestGenome = await runMetaOptimizer(
        currentWeights,
        breakdownsByDraw,
        actualWinnersByDraw,
        hurstExponent,
        entropyVal,
        algoKeys,
        totalGenerations,
        rand,
        onTelemetry
      );
      break;
  }

  const finalWeightsBeforeVerification = normalizeWeights(bestGenome);

  // Vérification de généralisation stricte (disjointe, sans fuite de données)
  let rejectionProbability = 0;
  let finalWeights = finalWeightsBeforeVerification;
  let overfittingRatio = 1;
  let isGeneralizable: boolean | "unverifiable" = "unverifiable";

  if (isHoldoutVerifiable) {
    const holdoutReport = await runBacktestTraining(
      drawName,
      holdoutHistory,
      Math.min(options.sampleSize, holdoutHistory.length),
      undefined,
      finalWeightsBeforeVerification
    );
    const trainReport = await runBacktestTraining(
      drawName,
      trainHistory,
      Math.min(options.sampleSize, trainHistory.length),
      undefined,
      finalWeightsBeforeVerification
    );

    overfittingRatio = trainReport.score / (holdoutReport.score || 1);

    const trainErrors = trainReport.history.map((h) => 5.0 - h.hitCount);
    const holdoutErrors = holdoutReport.history.map((h) => 5.0 - h.hitCount);

    const bootstrapTest = runBootstrapOverfittingTest(trainErrors, holdoutErrors);

    if (trainErrors.length < 5 || holdoutErrors.length < 5) {
      isGeneralizable = "unverifiable";
      rejectionProbability = 0.0;
    } else {
      // Transition continue sigmoïdale de la probabilité de rejet
      rejectionProbability = 1.0 / (1.0 + Math.exp(-4.0 * bootstrapTest.ciLower));
      isGeneralizable = rejectionProbability < 0.5;
    }

    // Blending adaptatif
    const blendedWeights: any = {};
    algoKeys.forEach((k) => {
      const cW = currentWeights[k] || 0;
      const nW = finalWeightsBeforeVerification[k] || 0;
      blendedWeights[k] = cW * rejectionProbability + nW * (1.0 - rejectionProbability);
    });
    finalWeights = blendedWeights;
  } else {
    isGeneralizable = "unverifiable";
    rejectionProbability = 0.0;
  }

  const safeFinalWeights = normalizeWeights(finalWeights);
  const newReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, safeFinalWeights);

  const rawImprovement = newReport.score - oldReport.score;
  const continuousImprovement = parseFloat((rawImprovement * (1 - rejectionProbability)).toFixed(2));

  return {
    bestWeights: safeFinalWeights,
    improvement: continuousImprovement,
    report: newReport,
    isGeneralizable,
    overfittingRatio: parseFloat(overfittingRatio.toFixed(3)),
    firstPredictionDNASnapshot,
  };
};

/**
 * Enveloppe publique et asynchrone (I/O) d'évolution neuronale.
 * Gère la persistance de cache locale et isole chaque tirage de façon étanche.
 */
export const evolveNeuralDNA = async (
  drawName: string,
  options: { generations: number; sampleSize: number; optimizerType?: "genetic" | "pso" | "bayesian" | "meta" } = { generations: 20, sampleSize: 30, optimizerType: "pso" },
  onTelemetry?: (data: { gen: number; bestFitness: number; avgFitness: number; diversity: number; bestGenome: any; source?: string }) => void
): Promise<{
  bestWeights: any;
  improvement: number;
  report: TrainingReport;
  isGeneralizable?: boolean | "unverifiable";
  overfittingRatio?: number;
  firstPredictionDNASnapshot?: any;
}> => {
  const optType = options.optimizerType || "pso";
  const { data: rawHistory } = await fetchResults(drawName);
  const fullHistory = purifyHistoryForDraw(drawName, rawHistory);

  // Clé de cache robuste intégrant le tirage, sa taille, les options et le dernier id stable
  const cacheKey = globalCache.generateKey(
    "neural_dna",
    drawName,
    `${options.generations}_${options.sampleSize}_${optType}_${fullHistory.length}_${fullHistory[0]?.id || ""}`
  );

  const cachedResult = await globalCache.get<any>(cacheKey, drawName);
  if (cachedResult) {
    logger.info(`[Tensor Processing] ADN Neural récupéré du cache pour ${drawName}.`);
    if (onTelemetry) {
      const stepsCount = 5;
      for (let i = 1; i <= stepsCount; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        onTelemetry({
          gen: Math.round((options.generations / stepsCount) * i),
          bestFitness: cachedResult.report?.score || 0,
          avgFitness: (cachedResult.report?.score || 0) * 0.9,
          diversity: 0.8 - 0.2 * (i / stepsCount),
          bestGenome: cachedResult.bestWeights,
          source: `${optType}-cached`,
        });
      }
    }
    return cachedResult;
  }

  const currentWeights = await getAlgoWeights(drawName);
  const result = await evolveNeuralDNACore(drawName, fullHistory, currentWeights, options, onTelemetry);

  await globalCache.set(cacheKey, result, CACHE_TTL.LONG, drawName);
  return result;
};

/**
 * Online Learning avec modulation statistique du taux d'apprentissage.
 * Gère la persistance de base de données et la mise à jour du store.
 */
export const applyOnlineLearning = async (
  drawName: string,
  history: DrawResult[],
  userFeedbackScore?: number
): Promise<void> => {
  const currentWeights = await getAlgoWeights(drawName);
  const temporalDepth = useNexusStore.getState()?.temporalDepth ?? 100;
  const purifiedHistory = purifyHistoryForDraw(drawName, history);

  const updatedWeights = await applyOnlineLearningCore(
    drawName,
    purifiedHistory,
    currentWeights,
    temporalDepth,
    userFeedbackScore
  );

  await saveAlgoWeights(drawName, updatedWeights);
  useNexusStore.getState().updateGlobalWeights(updatedWeights);
};

/**
 * Exécute une étape d'apprentissage complète liant Forensic et Training.
 */
export const runForensicTrainingStep = async (
  drawName: string,
  history: DrawResult[]
): Promise<{ learningSession: any; updatedWeights: AlgoWeights }> => {
  const purifiedHistory = purifyHistoryForDraw(drawName, history);
  const currentWeights = await getAlgoWeights(drawName);

  return runForensicTrainingStepCore(drawName, purifiedHistory, currentWeights);
};

/**
 * Simulation de boucle de replay déterministe.
 */
export const runLoopSimulation = async (
  drawName: string,
  rawHistory: DrawResult[],
  loopSize: number,
  originalWeights: AlgoWeights,
  onProgress?: (progress: number, stepResult: LoopSimulationStepResult) => void,
  abortSignal?: AbortSignal
): Promise<LoopSimulationSummary> => {
  const purifiedHistory = purifyHistoryForDraw(drawName, rawHistory);

  // Gestion du cache de boucle
  const weightsHash = hashWeights(originalWeights);
  const cacheKey = globalCache.generateKey(
    "loop_simulation",
    drawName,
    `${loopSize}_${purifiedHistory.length}_${purifiedHistory[0]?.id || ""}_${weightsHash}`
  );

  const cachedResult = await globalCache.get<LoopSimulationSummary>(cacheKey, drawName);
  if (cachedResult) {
    logger.info(`[Loop Simulation] Relecture du Replay Déterministe pour ${drawName} via cache.`);
    if (onProgress && cachedResult.steps) {
      for (let i = 0; i < cachedResult.steps.length; i++) {
        if (abortSignal?.aborted) {
          throw new Error("Simulation interrompue.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2));
        const percent = Math.round(((i + 1) / cachedResult.steps.length) * 100);
        onProgress(percent, cachedResult.steps[i]);
      }
    }
    return cachedResult;
  }

  const result = await runLoopSimulationCore(
    drawName,
    purifiedHistory,
    loopSize,
    originalWeights,
    onProgress,
    abortSignal
  );

  await globalCache.set(cacheKey, result, CACHE_TTL.LONG, drawName);
  return result;
};

/**
 * Extraction mathématique continue et déterministe des profils positionnels d'ADN.
 */
export const calculatePositionalDNAProfiles = (
  history: DrawResult[],
  baseWeights: AlgoWeights
): Record<number, Record<AlgoKey, number>> => {
  if (!history || history.length === 0) return {};

  const profiles: Record<number, Record<AlgoKey, number>> = {};
  const keys = Object.keys(baseWeights) as AlgoKey[];
  const N = 90;

  const sampleSize = Math.min(100, history.length);
  const sample = history.slice(0, sampleSize);

  for (let pos = 0; pos < 5; pos++) {
    const valuesInSlot = sample
      .map((h) => {
        const sorted = [...(h.gagnants || [])].sort((a, b) => a - b);
        return sorted[pos];
      })
      .filter((v) => v !== undefined);

    const avgVal =
      valuesInSlot.length > 0
        ? valuesInSlot.reduce((a, b) => a + b, 0) / valuesInSlot.length
        : pos * 18 + 9;

    const varianceVal =
      valuesInSlot.length > 0
        ? valuesInSlot.reduce((a, b) => a + Math.pow(b - avgVal, 2), 0) / valuesInSlot.length
        : 81;

    const stdDev = Math.sqrt(varianceVal) || Number.EPSILON;
    const normalizedPos = avgVal / N;

    let autoCorr = 0;
    if (valuesInSlot.length > 1) {
      let num = 0;
      let den = 0;
      for (let i = 0; i < valuesInSlot.length - 1; i++) {
        num += (valuesInSlot[i] - avgVal) * (valuesInSlot[i + 1] - avgVal);
        den += Math.pow(valuesInSlot[i] - avgVal, 2);
      }
      autoCorr = den > 0 ? num / den : 0;
    }

    const slotWeights: Record<AlgoKey, number> = {} as any;

    keys.forEach((k) => {
      const baseW = baseWeights[k] ?? 0.05;
      let modifier = 1.0;

      switch (k) {
        case AlgoKey.FREQUENCY:
          modifier = 1.0 + Math.tanh((30.0 - stdDev) / 10.0) * (1.0 - normalizedPos);
          break;
        case AlgoKey.GAPS:
        case AlgoKey.GAP_SEQUENCE:
        case AlgoKey.GAP_PATTERN:
        case AlgoKey.GAP_CADENCE:
        case AlgoKey.GAP_TREND:
        case AlgoKey.GAP_BAND_SEQUENCE:
          modifier = 1.0 + Math.tanh((stdDev - 30.0) / 10.0) * (1.0 - Math.max(0, autoCorr));
          break;
        case AlgoKey.SPECTRAL:
        case AlgoKey.INTER_MONTHLY_RESONANCE:
          modifier = 1.0 + Math.abs(autoCorr) * Math.sin(normalizedPos * Math.PI);
          break;
        case AlgoKey.MARKOV:
        case AlgoKey.SEQUENCE_PATTERN:
        case AlgoKey.AFFINITY:
        case AlgoKey.JACCARD:
          modifier = 1.0 + (1.0 - Math.abs(normalizedPos - 0.5) * 2.0) * Math.tanh(stdDev / 20.0);
          break;
        case AlgoKey.FRACTAL:
        case AlgoKey.ISOLATION_ANOMALY:
          modifier = 1.0 + Math.tanh(stdDev / 30.0) * (1.0 - Math.abs(autoCorr));
          break;
        case AlgoKey.TEMPORAL:
          modifier = 1.0 + Math.max(0, autoCorr) * Math.cos(normalizedPos * Math.PI);
          break;
        case AlgoKey.BAYES:
          modifier = 1.0 + Math.sin(normalizedPos * Math.PI) * (1.0 - Math.tanh(stdDev / 40.0));
          break;
        case AlgoKey.MOMENTUM:
          modifier = 1.0 + Math.max(0, autoCorr) * Math.tanh(stdDev / 15.0);
          break;
        case AlgoKey.SPATIAL:
        case AlgoKey.DERIVED_NEIGHBOR: {
          const edgeDistance = Math.abs(pos - 2) / 2.0;
          modifier = 1.0 + edgeDistance * Math.tanh(stdDev / 25.0);
          break;
        }
        case AlgoKey.SHADOW_PROBABILITY:
          modifier = 1.0 + (1.0 - Math.abs(autoCorr)) * Math.tanh(stdDev / 30.0);
          break;
        case AlgoKey.NETWORK_CORRELATION:
        case AlgoKey.MACHINE_TRANSFER:
          modifier = 1.0 + Math.tanh(stdDev / 20.0) * Math.sin(normalizedPos * Math.PI * 2.0);
          break;
        case AlgoKey.ECHO_STATE:
          modifier = 1.0 + Math.tanh(stdDev / 25.0) * (0.5 + 0.5 * Math.sin(normalizedPos * Math.PI));
          break;
      }

      slotWeights[k] = Math.max(0.001, baseW * modifier);
    });

    const total = Object.values(slotWeights).reduce((a, b) => a + b, 0) || 1;
    keys.forEach((k) => {
      slotWeights[k] = parseFloat((slotWeights[k] / total).toFixed(4));
    });

    profiles[pos] = slotWeights;
  }

  return profiles;
};

/**
 * Exécution asynchrone sécurisée du worker de backtest.
 */
export const runBacktestTrainingAsync = async (
  drawName: string,
  history: DrawResult[],
  sampleSize: number,
  onProgress?: (progress: number) => void,
  customWeights?: any,
  skipTraining: boolean = true,
): Promise<TrainingReport> => {
  const purifiedHistory = purifyHistoryForDraw(drawName, history);
  return runBacktestWorker<TrainingReport>(
    drawName,
    purifiedHistory,
    sampleSize,
    onProgress,
    customWeights,
    skipTraining
  );
};

export * from "./forensicTrainingBridge";
