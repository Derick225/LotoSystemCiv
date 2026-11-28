import { DrawResult, AlgoWeights } from "../../types";
import { calculateStatisticalBounds, calculateFractalIndex } from "../mathService";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";
import { calculateScores } from "./scoringEngine";
import { extractFeatures, ExtractedFeatures } from "./featureExtractor";
import { EnhancedMetrics } from "./metrics.types";
import {
  calculatePoissonScores,
  calculateBayesianScore,
  calculateTemporalScores,
  calculateDigitalRootAnalysis,
  calculateResistanceScores,
  calculateGapVelocityScores,
  calculateLeaderSuccession,
  calculateAiIntuition,
  calculateFractalResonance,
  calculateSpatialHotSpots,
  calculateCoOccurrenceScores,
  calculateAnomalyScores,
  calculateHawkesExcitation,
  calculateTopologicalLyapunov
} from "../advancedMathService";

/**
 * Hyper-paramètres optimisables pour les algorithmes avancés de prédiction.
 * Évite d'utiliser des coefficients fixes ou magiques.
 */
export interface PredictiveHyperparameters {
  hawkesDecay: number;         // Coefficient d'excitation du processus de Hawkes [0.05 - 0.5]
  spatialSigma: number;        // Écart-type du lissage gaussien de la grille de jeu [0.5 - 3.0]
  gapVelocityWeight: number;   // Coefficient d'amortissement de la vélocité des écarts [0.2 - 2.0]
  bayesWindowRatio: number;    // Taille relative de la fenêtre d'apprentissage Bayes [0.05 - 0.3]
  sgdLearningRate: number;     // Taux d'apprentissage continu de la micro-SGD [0.005 - 0.05]
  lyapunovHorizon: number;     // Horizon temporel d'analyse de l'attracteur chaotique [5 - 25]
  pcaVarianceThreshold?: number; // Seuil de variance cumulative PCA déduit dynamiquement ou optimisé
}

export interface HyperSearchContext {
  featuresCache: Map<number, ExtractedFeatures>;
  baseMetricsCache: Map<number, {
    poissonScores: Record<number, number>;
    temporalScores: Record<number, number>;
    digitalRootScores: Record<number, number>;
    resistanceScores: Record<number, number>;
    gapVelocityScores: Record<number, number>;
    leaderSuccessionScores: Record<number, number>;
    aiIntuitionScores: Record<number, number>;
    fractalResonanceScores: Record<number, number>;
    symbioticClusterScores: Record<number, number>;
    anomalyScores: Record<number, number>;
    hawkesBaseScores: Record<number, number>;
    hurstExponent: number;
  }>;
}

export interface TunerDiagnostics {
  attemptedEvaluations: number;
  failedEvaluations: number;
  failureLogs: string[];
  optimalHyperparameterHistory: Record<string, number>[];
}

export const DEFAULT_HYPERPARAMETERS: PredictiveHyperparameters = {
  hawkesDecay: 0.15,
  spatialSigma: 1.5,
  gapVelocityWeight: 1.0,
  bayesWindowRatio: 0.1,
  sgdLearningRate: 0.015,
  lyapunovHorizon: 15,
  pcaVarianceThreshold: 0.95
};

/**
 * Calcule le rayon spectral (plus grande valeur propre) de la matrice de covariance de manière 100% déterministe.
 * Utilise la méthode de la puissance (Power Iteration) avec une initialisation seedée déterministe pour ZÉRO HASARD.
 * 
 * JSDOC: La dérivation du taux d'apprentissage à partir de l'inverse du rayon spectral (rayon de la plus grande valeur propre)
 * garantit mathématiquement la convergence de la descente de gradient stochastique en évitant les oscillations et divergences.
 */
export const calculateSpectralRadius = (features: number[][]): number => {
  if (!features || features.length === 0) return 1.0;
  const nSamples = features.length;
  const nFeatures = features[0].length;

  // 1. Centrer et réduire les variables
  const means = new Float64Array(nFeatures);
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) {
      means[j] += features[i][j];
    }
  }
  for (let j = 0; j < nFeatures; j++) {
    means[j] /= nSamples;
  }

  const stdDevs = new Float64Array(nFeatures);
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) {
      stdDevs[j] += Math.pow(features[i][j] - means[j], 2);
    }
  }
  for (let j = 0; j < nFeatures; j++) {
    stdDevs[j] = Math.sqrt(stdDevs[j] / (nSamples - 1)) || 1.0;
  }

  // 2. Construire la matrice de covariance
  const cov = Array.from({ length: nFeatures }, () => new Float64Array(nFeatures));
  for (let j1 = 0; j1 < nFeatures; j1++) {
    for (let j2 = 0; j2 < nFeatures; j2++) {
      let sum = 0;
      for (let i = 0; i < nSamples; i++) {
        const x1 = (features[i][j1] - means[j1]) / stdDevs[j1];
        const x2 = (features[i][j2] - means[j2]) / stdDevs[j2];
        sum += x1 * x2;
      }
      cov[j1][j2] = sum / (nSamples - 1);
    }
  }

  // 3. Méthode de la puissance pour trouver le vecteur propre dominant (ZÉRO HASARD)
  let v = new Float64Array(nFeatures);
  const initVal = 1.0 / Math.sqrt(nFeatures);
  for (let j = 0; j < nFeatures; j++) v[j] = initVal;

  let maxEigenValue = 1.0;
  const maxIterations = 30;
  const convergenceTolerance = Number.EPSILON * 1e4;

  for (let iter = 0; iter < maxIterations; iter++) {
    const w = new Float64Array(nFeatures);
    for (let r = 0; r < nFeatures; r++) {
      for (let c = 0; c < nFeatures; c++) {
        w[r] += cov[r][c] * v[c];
      }
    }

    let norm = 0;
    for (let j = 0; j < nFeatures; j++) norm += w[j] * w[j];
    norm = Math.sqrt(norm);

    if (norm < Number.EPSILON) break;

    const nextV = new Float64Array(nFeatures);
    for (let j = 0; j < nFeatures; j++) nextV[j] = w[j] / norm;

    let lambda = 0;
    for (let j = 0; j < nFeatures; j++) lambda += nextV[j] * w[j];

    const diff = Math.abs(lambda - maxEigenValue);
    maxEigenValue = lambda;
    v = nextV;

    if (diff < convergenceTolerance) break;
  }

  return Math.max(0.001, maxEigenValue);
};

/**
 * Détermine dynamiquement le seuil de variance PCA à partir de la dimension des caractéristiques.
 * Supprime le nombre magique 0.95 en le reliant de manière continue et asymptotique à nFeatures.
 */
export const getDynamicPcaVarianceThreshold = (nFeatures: number): number => {
  if (nFeatures <= 0) return 0.95;
  return 1.0 - (1.0 / Math.log2(nFeatures + 1));
};

/**
 * Évalue une perte propre invariante par permutation des étiquettes [1..90] :
 * moyenne équipondérée du ratio de Log-Loss marginal (water-filling Σ q_n = 5 vs baseline 5/90)
 * et du rang doux normalisé par l'espérance uniforme ((90 + 1) / 2 = 45.5).
 * Centrée autour de 1.0 sous bruit uniforme — zéro seuil arbitraire.
 */
const evaluateSoftRankingLoss = (
  scores: { num: number; score: number }[],
  winners: number[]
): number => {
  if (winners.length === 0) return 1.0;

  const DOMAIN_SIZE = 90;
  const DRAW_SIZE = 5;
  const UNIFORM_P = DRAW_SIZE / DOMAIN_SIZE;
  const UNIFORM_LOG_LOSS = -(
    UNIFORM_P * Math.log(UNIFORM_P) +
    (1.0 - UNIFORM_P) * Math.log(1.0 - UNIFORM_P)
  );
  const UNIFORM_MEAN_RANK = (DOMAIN_SIZE + 1) / 2.0; // 45.5
  const PROB_EPS = 1e-6;

  const totalScores = scores.length;
  if (totalScores === 0) return 1.0;

  const meanScore = scores.reduce((sum, s) => sum + s.score, 0) / totalScores;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s.score - meanScore, 2), 0) / totalScores;
  const stdDev = Math.sqrt(variance) || 1.0;
  const temperature = Math.max(stdDev, 0.1);
  const alpha = 1.0 / temperature;

  let softRankSum = 0;
  const maxS = Math.max(...scores.map((s) => s.score));
  const expByNum = new Float64Array(DOMAIN_SIZE);
  let sumExp = 0;
  for (const item of scores) {
    if (item.num >= 1 && item.num <= DOMAIN_SIZE) {
      const e = Math.exp((item.score - maxS) / temperature);
      expByNum[item.num - 1] = e;
      sumExp += e;
    }
  }

  winners.forEach((w) => {
    const winnerItem = scores.find((s) => s.num === w);
    if (!winnerItem) {
      softRankSum += DOMAIN_SIZE;
      return;
    }
    const s_w = winnerItem.score;
    let softRank = 1.0;
    scores.forEach((item) => {
      if (item.num === w) return;
      const prob = 1.0 / (1.0 + Math.exp(-alpha * (item.score - s_w)));
      softRank += prob;
    });
    softRankSum += softRank;
  });

  const softRankRatio = (softRankSum / winners.length) / UNIFORM_MEAN_RANK;

  // Projection water-filling exacte Σ q_n = 5
  const rawRel = new Float64Array(DOMAIN_SIZE);
  const norm = sumExp > 0 ? sumExp : 1.0;
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    rawRel[i] = (expByNum[i] / norm) * DRAW_SIZE;
  }
  const clampProb = (v: number) => Math.max(PROB_EPS, Math.min(1.0 - PROB_EPS, v));
  let lo = -12.0;
  let hi = 12.0;
  for (let iter = 0; iter < 32; iter++) {
    const mid = 0.5 * (lo + hi);
    const scale = Math.exp(mid);
    let sumQ = 0;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      sumQ += clampProb(rawRel[i] * scale);
    }
    if (sumQ < DRAW_SIZE) lo = mid;
    else hi = mid;
  }
  const finalScale = Math.exp(0.5 * (lo + hi));
  const winnerSet = new Set(winners.filter((w) => w >= 1 && w <= DOMAIN_SIZE));
  let logLossSum = 0;
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const q = clampProb(rawRel[i] * finalScale);
    const y = winnerSet.has(i + 1) ? 1.0 : 0.0;
    logLossSum += -(y * Math.log(q) + (1.0 - y) * Math.log(1.0 - q));
  }
  const logLossRatio = (logLossSum / DOMAIN_SIZE) / UNIFORM_LOG_LOSS;

  return 0.5 * logLossRatio + 0.5 * softRankRatio;
};

/**
 * Fonction interne de calcul de score avec hyper-paramètres injectables.
 * Reproduit la boucle d'inférence avec des paramètres fluctuants de manière 100% déterministe.
 * Utilise un HyperSearchContext pour partager et éviter de recalculer les métriques statiques.
 */
const simulateInferenceWithHyperparameters = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  params: PredictiveHyperparameters,
  useSpatioTemporalHawkes: boolean = true,
  context?: HyperSearchContext
): Promise<{ num: number; score: number }[]> => {
  const localHistoryContext = history.slice(0, 30); // Limite le contexte pour des performances de calcul optimales
  const cacheKey = history.length;

  let features = context?.featuresCache.get(cacheKey);
  if (!features) {
    features = await extractFeatures(drawName, history, 30);
    if (context) {
      context.featuresCache.set(cacheKey, features);
    }
  }

  let base = context?.baseMetricsCache.get(cacheKey);
  if (!base) {
    const poissonScores = calculatePoissonScores(localHistoryContext);
    const temporalScores = calculateTemporalScores(localHistoryContext);
    const digitalRootScores = calculateDigitalRootAnalysis(localHistoryContext);
    const resistanceScores = calculateResistanceScores(localHistoryContext);
    const gapVelocityScores = calculateGapVelocityScores(localHistoryContext);
    const leaderSuccessionScores = calculateLeaderSuccession(localHistoryContext);
    const aiIntuitionScores = calculateAiIntuition(localHistoryContext, {});
    const fractalResonanceScores = calculateFractalResonance(localHistoryContext);
    const symbioticClusterScores = calculateCoOccurrenceScores(localHistoryContext);
    const anomalyScores = calculateAnomalyScores(localHistoryContext);
    const hawkesBaseScores = useSpatioTemporalHawkes
      ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
      : calculateHawkesExcitation(localHistoryContext);

    const hurstRes = calculateFractalIndex(history);
    const hurstExponent = Number.isFinite(hurstRes) ? hurstRes : 0.5;

    base = {
      poissonScores,
      temporalScores,
      digitalRootScores,
      resistanceScores,
      gapVelocityScores,
      leaderSuccessionScores,
      aiIntuitionScores,
      fractalResonanceScores,
      symbioticClusterScores,
      anomalyScores,
      hawkesBaseScores,
      hurstExponent
    };

    if (context) {
      context.baseMetricsCache.set(cacheKey, base);
    }
  }

  // Recalcul des métriques paramétriques
  const bayesScores = calculateBayesianScore(localHistoryContext, params.bayesWindowRatio);
  const spatialHotSpots = calculateSpatialHotSpots(localHistoryContext, base.hurstExponent, params.spatialSigma);
  const topologicalLyapunovScores = calculateTopologicalLyapunov(localHistoryContext, params.lyapunovHorizon);

  // Appliquer le facteur de vélocité
  const gapVelocityScores = { ...base.gapVelocityScores };
  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= params.gapVelocityWeight;
  }

  // Appliquer la décroissance Hawkes relativement à la valeur nominale de référence
  const hawkesExcitationScores = { ...base.hawkesBaseScores };
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= (params.hawkesDecay / DEFAULT_HYPERPARAMETERS.hawkesDecay);
  }

  // Fusionner les métriques avec compatibilité double-clés (ancien/nouveau code)
  const computedMetrics: EnhancedMetrics = {
    poisson: base.poissonScores,
    bayes: bayesScores,
    temporal: base.temporalScores,
    digitalRoot: base.digitalRootScores,
    resistance: base.resistanceScores,
    gapVelocity: gapVelocityScores,
    leaderSuccession: base.leaderSuccessionScores,
    aiIntuition: base.aiIntuitionScores,
    fractalResonance: base.fractalResonanceScores,
    spatial: spatialHotSpots,
    symbioticClusters: base.symbioticClusterScores,
    coOccurrence: base.symbioticClusterScores,
    anomaly: base.anomalyScores,
    anomalyDetection: base.anomalyScores,
    hawkes: hawkesExcitationScores,
    hawkesExcitation: hawkesExcitationScores,
    lyapunov: topologicalLyapunovScores,
    topologicalLyapunov: topologicalLyapunovScores,
    pcaVarianceThreshold: params.pcaVarianceThreshold,
    statisticalBounds: calculateStatisticalBounds(history),
  };

  return calculateScores(features, weights, computedMetrics, history);
};

/**
 * Calcule la perte composite walk-forward d'un jeu d'hyperparamètres sur une fenêtre chronologique [startIdx, endIdx).
 * Chaque tirage t n'observe strictement que history.slice(t + 1) (zéro fuite future).
 */
const backtestHyperparameterSet = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  params: PredictiveHyperparameters,
  useSpatioTemporalHawkes: boolean = true,
  context?: HyperSearchContext,
  diagnostics?: TunerDiagnostics,
  startIdx: number = 0,
  endIdx?: number
): Promise<number> => {
  const maxEnd = Math.max(0, history.length - 10);
  const safeStart = Math.max(0, startIdx);
  const safeEnd = Math.min(maxEnd, endIdx ?? Math.min(maxEnd, safeStart + 6));
  if (safeEnd <= safeStart) return 1.0;

  let totalLossSum = 0;
  let count = 0;

  for (let t = safeStart; t < safeEnd; t++) {
    await new Promise(r => setTimeout(r, 0));
    const targetDraw = history[t];
    const subHistory = history.slice(t + 1);
    if (subHistory.length < 10) continue;

    const winners = targetDraw.gagnants;
    if (!winners || winners.length === 0) continue;

    if (diagnostics) {
      diagnostics.attemptedEvaluations++;
    }

    try {
      const scored = await simulateInferenceWithHyperparameters(
        drawName,
        subHistory,
        weights,
        params,
        useSpatioTemporalHawkes,
        context
      );
      totalLossSum += evaluateSoftRankingLoss(scored, winners);
      count++;
    } catch (e: any) {
      if (diagnostics) {
        diagnostics.failedEvaluations++;
        diagnostics.failureLogs.push(`T=${t} failed: ${e?.message || String(e)}`);
      }
    }
  }

  return count > 0 ? totalLossSum / count : 1.0;
};

/**
 * Recherche adaptative unidimensionnelle basée sur la décroissance de l'entropie de Shannon de la perte.
 */
export const adaptiveParameterSearch = async (
  paramName: keyof PredictiveHyperparameters,
  minVal: number,
  maxVal: number,
  stepsCount: number,
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  currentParams: PredictiveHyperparameters,
  useSpatioTemporalHawkes: boolean,
  log: string[],
  context?: HyperSearchContext,
  diagnostics?: TunerDiagnostics,
  tuneStartIdx: number = 0,
  tuneEndIdx?: number
): Promise<{ bestVal: number; bestRank: number }> => {
  let low = minVal;
  let high = maxVal;
  let bestVal = (minVal + maxVal) / 2.0;
  let bestRank = Infinity;

  // Deux itérations de raffinement successif adaptatif
  for (let refine = 0; refine < 2; refine++) {
    const stepSize = stepsCount > 1 ? (high - low) / (stepsCount - 1) : 0;
    const testValues: number[] = [];
    const ranks: number[] = [];

    for (let i = 0; i < stepsCount; i++) {
      const val = low + i * stepSize;
      testValues.push(val);

      const testParams = { ...currentParams, [paramName]: val };
      const rank = await backtestHyperparameterSet(
        drawName,
        history,
        weights,
        testParams,
        useSpatioTemporalHawkes,
        context,
        diagnostics,
        tuneStartIdx,
        tuneEndIdx
      );
      ranks.push(rank);

      if (rank < bestRank) {
        bestRank = rank;
        bestVal = val;
      }
    }

    // Calcul de l'entropie de Shannon du paysage de perte pour adapter le raffinement
    const minRank = Math.min(...ranks);
    const exps = ranks.map(r => Math.exp(-(r - minRank) / 2.0));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / (sumExps || 1));

    let entropy = 0;
    for (const p of probs) {
      if (p > 1e-9) {
        entropy -= p * Math.log2(p);
      }
    }

    log.push(`[Tuner - ${String(paramName)}] Itération de raffinement ${refine + 1}: low=${low.toFixed(4)}, high=${high.toFixed(4)}, entropy=${entropy.toFixed(4)}`);

    const refinementFactor = 1.0 / (1.0 + entropy);
    const currentRange = high - low;
    const newRange = currentRange * refinementFactor;

    low = Math.max(minVal, bestVal - newRange / 2.0);
    high = Math.min(maxVal, bestVal + newRange / 2.0);
  }

  return { bestVal, bestRank };
};

/**
 * OPTIMISATION DE COORDONNÉES DÉTERMINISTE (Coordinate Descent) :
 * Ajuste séquentiellement chaque hyper-paramètre pour minimiser le rang moyen des gagnants passés.
 * 100% reproductible et déterministe.
 */
export const tunePredictiveHyperparameters = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  useSpatioTemporalHawkes: boolean = true,
  onProgress?: (progress: number, message: string) => void
): Promise<{
  tunedParams: PredictiveHyperparameters;
  accuracyGain: number;
  applied: boolean;
  validationLossBaseline?: number;
  validationLossTuned?: number;
  log: string[];
}> => {
  const log: string[] = [];
  const currentParams = { ...DEFAULT_HYPERPARAMETERS };

  if (typeof window !== 'undefined') {
    log.push("Exécution sur le thread principal : optimisation lourde bypassée pour préserver la fluidité (60 FPS). Moteur cybernétique sécurisé.");
    return { tunedParams: currentParams, accuracyGain: 0, applied: false, log };
  }

  const usable = history.length - 10;
  if (usable < 10) {
    log.push("Historique insuffisant pour une séparation entraînement/validation hors-échantillon (minimum 20 tirages). Retour aux valeurs par défaut.");
    return { tunedParams: currentParams, accuracyGain: 0, applied: false, log };
  }

  // Séparation chronologique stricte :
  // - Validation hors-échantillon : les valCount tirages les plus récents [0 .. valCount)
  // - Accordage (Tuning) : les tuneCount tirages immédiatement antérieurs [valCount .. valCount + tuneCount)
  const valCount = Math.max(4, Math.min(10, Math.floor(usable * 0.35)));
  const tuneStartIdx = valCount;
  const tuneEndIdx = Math.min(usable, valCount + Math.max(5, Math.min(10, usable - valCount)));

  log.push(`Début de l'optimisation déterministe avec split chronologique strict (Accordage: ${tuneEndIdx - tuneStartIdx} tirages, Validation hors-échantillon: ${valCount} tirages)...`);
  onProgress?.(12, "Début de l'optimisation déterministe des coordonnées...");

  const searchContext: HyperSearchContext = {
    featuresCache: new Map(),
    baseMetricsCache: new Map()
  };

  const diagnostics: TunerDiagnostics = {
    attemptedEvaluations: 0,
    failedEvaluations: 0,
    failureLogs: [],
    optimalHyperparameterHistory: []
  };

  const baselineTuneLoss = await backtestHyperparameterSet(
    drawName,
    history,
    weights,
    DEFAULT_HYPERPARAMETERS,
    useSpatioTemporalHawkes,
    searchContext,
    diagnostics,
    tuneStartIdx,
    tuneEndIdx
  );
  const validationLossBaseline = await backtestHyperparameterSet(
    drawName,
    history,
    weights,
    DEFAULT_HYPERPARAMETERS,
    useSpatioTemporalHawkes,
    searchContext,
    diagnostics,
    0,
    valCount
  );
  log.push(`Perte composite de référence — Accordage: ${baselineTuneLoss.toFixed(4)} | Validation hors-échantillon: ${validationLossBaseline.toFixed(4)}.`);

  const extFeatures = await extractFeatures(drawName, history, 30);
  const featureMatrix: number[][] = [];
  const nFeatures = 8;

  for (let num = 1; num <= 90; num++) {
    const row: number[] = [
      extFeatures.freqMap[num] || 0,
      extFeatures.gapsMap[num] || 0,
      extFeatures.markovMap[num] || 0,
      extFeatures.momentumMap[num] || 0,
      extFeatures.machineTransferMap[num] || 0,
      extFeatures.shadowProbabilityMap[num] || 0,
      extFeatures.networkCorrelationMap[num] || 0,
      extFeatures.affinityMap[0] ? (extFeatures.affinityMap[0][num] || 0) : 0
    ];
    featureMatrix.push(row);
  }

  const spectralRadius = calculateSpectralRadius(featureMatrix);
  const optimalSgdLR = 1.0 / spectralRadius;
  log.push(`Rayon spectral de covariance calculé : ${spectralRadius.toFixed(4)}. Taux d'apprentissage optimal SGD théorique dérivé : ${optimalSgdLR.toFixed(5)}.`);

  const dynamicPcaThreshold = getDynamicPcaVarianceThreshold(nFeatures);
  currentParams.pcaVarianceThreshold = dynamicPcaThreshold;
  log.push(`Seuil de variance cumulative PCA dynamique dérivé des dimensions (${nFeatures}) : ${dynamicPcaThreshold.toFixed(4)}.`);

  // 1. Optimisation de hawkesDecay [0.05, 0.50] sur tranche d'accordage uniquement
  onProgress?.(18, "Optimisation cybernétique : Calibrage résonance Hawkes...");
  const hawkesRes = await adaptiveParameterSearch('hawkesDecay', 0.05, 0.50, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics, tuneStartIdx, tuneEndIdx);
  currentParams.hawkesDecay = hawkesRes.bestVal;
  log.push(`Accordage hawkesDecay -> ${hawkesRes.bestVal.toFixed(4)} (Loss accordage: ${hawkesRes.bestRank.toFixed(4)})`);

  // 2. Optimisation de spatialSigma [0.5, 3.0]
  onProgress?.(24, "Optimisation cybernétique : Calibrage de la dispersion gaussienne...");
  const sigmaRes = await adaptiveParameterSearch('spatialSigma', 0.5, 3.0, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics, tuneStartIdx, tuneEndIdx);
  currentParams.spatialSigma = sigmaRes.bestVal;
  log.push(`Accordage spatialSigma -> ${sigmaRes.bestVal.toFixed(4)} (Loss accordage: ${sigmaRes.bestRank.toFixed(4)})`);

  // 3. Optimisation de gapVelocityWeight [0.2, 2.0]
  onProgress?.(30, "Optimisation cybernétique : Calibrage des vitesses de transition gap...");
  const velocityRes = await adaptiveParameterSearch('gapVelocityWeight', 0.2, 2.0, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics, tuneStartIdx, tuneEndIdx);
  currentParams.gapVelocityWeight = velocityRes.bestVal;
  log.push(`Accordage gapVelocityWeight -> ${velocityRes.bestVal.toFixed(4)} (Loss accordage: ${velocityRes.bestRank.toFixed(4)})`);

  // 4. Optimisation de bayesWindowRatio [0.05, 0.30]
  onProgress?.(36, "Optimisation cybernétique : Calibrage des probabilités de transition bayésiennes...");
  const bayesRes = await adaptiveParameterSearch('bayesWindowRatio', 0.05, 0.30, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics, tuneStartIdx, tuneEndIdx);
  currentParams.bayesWindowRatio = bayesRes.bestVal;
  log.push(`Accordage bayesWindowRatio -> ${bayesRes.bestVal.toFixed(4)} (Loss accordage: ${bayesRes.bestRank.toFixed(4)})`);

  // 5. Optimisation de sgdLearningRate [optimalSgdLR * 0.1, optimalSgdLR * 2.0]
  onProgress?.(42, "Optimisation cybernétique : Calibrage du micro-SGD learning rate...");
  const sgdMin = optimalSgdLR * 0.1;
  const sgdMax = optimalSgdLR * 2.0;
  const sgdRes = await adaptiveParameterSearch('sgdLearningRate', sgdMin, sgdMax, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics, tuneStartIdx, tuneEndIdx);
  currentParams.sgdLearningRate = sgdRes.bestVal;
  log.push(`Accordage sgdLearningRate -> ${sgdRes.bestVal.toFixed(5)} (Loss accordage: ${sgdRes.bestRank.toFixed(4)})`);

  // Évaluation finale STRICTEMENT hors-échantillon sur [0 .. valCount)
  const validationLossTuned = await backtestHyperparameterSet(
    drawName,
    history,
    weights,
    currentParams,
    useSpatioTemporalHawkes,
    searchContext,
    diagnostics,
    0,
    valCount
  );

  const outOfSampleGain = validationLossBaseline - validationLossTuned;
  const isValidated = outOfSampleGain > 1e-4;

  log.push(`Validation hors-échantillon finale : Baseline=${validationLossBaseline.toFixed(4)} vs Optimisé=${validationLossTuned.toFixed(4)} (gain=${outOfSampleGain.toFixed(5)}).`);
  log.push(`Diagnostics : Evaluations tentées = ${diagnostics.attemptedEvaluations}, Échecs = ${diagnostics.failedEvaluations}`);
  if (diagnostics.failedEvaluations > 0) {
    log.push(`Échantillon d'erreurs: ${diagnostics.failureLogs.slice(0, 3).join(" | ")}`);
  }

  if (!isValidated) {
    const rollbackParams = { ...DEFAULT_HYPERPARAMETERS };
    log.push(`REJET hors-échantillon : aucune amélioration stricte en validation (rollback aux paramètres par défaut).`);
    onProgress?.(45, "Calibrage rejeté en validation hors-échantillon (rollback sécurisé).");
    return {
      tunedParams: rollbackParams,
      accuracyGain: 0,
      applied: false,
      validationLossBaseline,
      validationLossTuned,
      log
    };
  }

  onProgress?.(45, "Calibrage cybernétique validé hors-échantillon.");
  await saveTunedHyperparameters(drawName, currentParams);

  return {
    tunedParams: currentParams,
    accuracyGain: outOfSampleGain,
    applied: true,
    validationLossBaseline,
    validationLossTuned,
    log
  };
};

const HYPERPARAMS_CACHE = new Map<string, PredictiveHyperparameters>();

/**
 * Récupère les hyperparamètres calibrés pour un tirage isolé (avec fallback aux valeurs par défaut statistiques).
 */
export const getTunedHyperparameters = async (drawName: string): Promise<PredictiveHyperparameters> => {
  if (HYPERPARAMS_CACHE.has(drawName)) {
    return HYPERPARAMS_CACHE.get(drawName)!;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(`lotopro_hyperparams_${drawName}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.hawkesDecay === 'number') {
          HYPERPARAMS_CACHE.set(drawName, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignorer
    }
  }
  return { ...DEFAULT_HYPERPARAMETERS };
};

/**
 * Enregistre les hyperparamètres calibrés de façon isolée et persistante par tirage.
 */
export const saveTunedHyperparameters = async (drawName: string, params: PredictiveHyperparameters): Promise<void> => {
  HYPERPARAMS_CACHE.set(drawName, params);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(`lotopro_hyperparams_${drawName}`, JSON.stringify(params));
    } catch {
      // Ignorer
    }
  }
};
