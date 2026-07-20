import { DrawResult, AlgoWeights } from "../../types";
import { calculateStatisticalBounds } from "../mathService";
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
 * Évalue la perte de classement differentiable (Soft-Ranking Loss) des gagnants.
 * Utilise une formulation continue basée sur des sigmoïdes de différence de score
 * pour fournir des gradients lisses et éviter les paliers d'optimisation non-différentiables.
 * Intègre des pénalités composites pour le top-15 théorique et la séparation des scores.
 */
const evaluateSoftRankingLoss = (
  scores: { num: number; score: number }[],
  winners: number[]
): number => {
  if (winners.length === 0) return 45.5;

  const totalScores = scores.length;
  if (totalScores === 0) return 45.5;

  // Calcul continu de l'écart-type des scores pour calibrer la température (alpha) sans nombre magique
  const meanScore = scores.reduce((sum, s) => sum + s.score, 0) / totalScores;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s.score - meanScore, 2), 0) / totalScores;
  const stdDev = Math.sqrt(variance) || 1.0;
  
  // Alpha (température d'activation) basé sur l'inverse de la dispersion des scores (alpha = 1 / stdDev)
  const alpha = 1.0 / Math.max(0.1, stdDev);

  let softRankSum = 0;
  const winnerSoftRanks: Record<number, number> = {};

  winners.forEach(w => {
    const winnerItem = scores.find(s => s.num === w);
    if (!winnerItem) {
      softRankSum += 90.0;
      winnerSoftRanks[w] = 90.0;
      return;
    }

    const s_w = winnerItem.score;
    let softRank = 1.0;

    scores.forEach(item => {
      if (item.num === w) return;
      const s_j = item.score;
      // Differentiable sigmoid activation of difference: sigmoid(alpha * (s_j - s_w))
      const diff = s_j - s_w;
      const prob = 1.0 / (1.0 + Math.exp(-alpha * diff));
      softRank += prob;
    });

    softRankSum += softRank;
    winnerSoftRanks[w] = softRank;
  });

  const softRankLoss = softRankSum / winners.length;

  // topKPenalty: smooth penalty around 15th rank
  const kThresh = 15;
  let topKPenaltySum = 0;
  winners.forEach(w => {
    const r = winnerSoftRanks[w] || 90.0;
    const penalty = 1.0 / (1.0 + Math.exp(-0.8 * (r - kThresh)));
    topKPenaltySum += penalty;
  });
  const topKPenalty = 5.0 * (topKPenaltySum / winners.length);

  // scoreSeparationPenalty: encourage score separation between top 5 and others
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const meanTop5 = sorted.slice(0, 5).reduce((sum, s) => sum + s.score, 0) / 5;
  const meanOthers = sorted.slice(5).reduce((sum, s) => sum + s.score, 0) / (totalScores - 5);
  const diffSeparation = Math.max(0, meanTop5 - meanOthers);
  const scoreSeparationPenalty = 5.0 / (1.0 + 0.1 * diffSeparation);

  return softRankLoss + topKPenalty + scoreSeparationPenalty;
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
      hawkesBaseScores
    };

    if (context) {
      context.baseMetricsCache.set(cacheKey, base);
    }
  }

  // Recalcul des métriques paramétriques
  const bayesScores = calculateBayesianScore(localHistoryContext, params.bayesWindowRatio);
  const spatialHotSpots = calculateSpatialHotSpots(localHistoryContext, 0.5, params.spatialSigma);
  const topologicalLyapunovScores = calculateTopologicalLyapunov(localHistoryContext, params.lyapunovHorizon);

  // Appliquer le facteur de vélocité
  const gapVelocityScores = { ...base.gapVelocityScores };
  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= params.gapVelocityWeight;
  }

  // Appliquer la décroissance Hawkes
  const hawkesExcitationScores = { ...base.hawkesBaseScores };
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= (params.hawkesDecay / 0.15);
  }

  // Fusionner les métriques avec compatibilité double-clés (ancien/nouveau code)
  const mockMetrics: EnhancedMetrics = {
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

  return calculateScores(features, weights, mockMetrics, history);
};

/**
 * Calcule l'impact d'un paramètre spécifique sur l'exactitude de prédiction historique.
 * Exécute un backtest walk-forward rapide sur les 5 derniers tirages.
 */
const backtestHyperparameterSet = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  params: PredictiveHyperparameters,
  useSpatioTemporalHawkes: boolean = true,
  context?: HyperSearchContext,
  diagnostics?: TunerDiagnostics
): Promise<number> => {
  const kValidation = Math.min(5, history.length - 11);
  if (kValidation <= 0) return 45.5;

  let totalRankSum = 0;
  let count = 0;

  for (let t = 0; t < kValidation; t++) {
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
      totalRankSum += evaluateSoftRankingLoss(scored, winners);
      count++;
    } catch (e: any) {
      if (diagnostics) {
        diagnostics.failedEvaluations++;
        diagnostics.failureLogs.push(`T=${t} failed: ${e?.message || String(e)}`);
      }
    }
  }

  return count > 0 ? totalRankSum / count : 45.5;
};

/**
 * Recherche adaptative unidimensionnelle basée sur la décroissance de l'entropie de Shannon de la perte.
 * JSDOC: En raffinant l'intervalle de recherche de manière proportionnelle à l'inverse de l'entropie (1.0 / (1.0 + H)),
 * nous focalisons l'échantillonnage de manière fine dans les régions de forte certitude tout en maintenant
 * une couverture plus large en situation de haute incertitude (entropie élevée).
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
  diagnostics?: TunerDiagnostics
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
        diagnostics
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
 * 100% reproductible, sans Math.random().
 */
export const tunePredictiveHyperparameters = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  useSpatioTemporalHawkes: boolean = true,
  onProgress?: (progress: number, message: string) => void
): Promise<{ tunedParams: PredictiveHyperparameters; accuracyGain: number; log: string[] }> => {
  const log: string[] = [];
  const currentParams = { ...DEFAULT_HYPERPARAMETERS };
  
  if (typeof window !== 'undefined') {
    log.push("Exécution sur le thread principal : optimisation lourde bypassée pour préserver la fluidité (60 FPS). Moteur cybernétique sécurisé.");
    return { tunedParams: currentParams, accuracyGain: 0, log };
  }
  
  if (history.length < 15) {
    log.push("Historique insuffisant pour optimiser les hyper-paramètres. Retour aux valeurs de sécurité.");
    return { tunedParams: currentParams, accuracyGain: 0, log };
  }

  log.push("Début de l'optimisation déterministe par descente de coordonnées adaptative...");
  onProgress?.(12, "Début de l'optimisation déterministe des coordonnées...");

  // Initialisation du contexte de recherche cache pour le precompute partagé
  const searchContext: HyperSearchContext = {
    featuresCache: new Map(),
    baseMetricsCache: new Map()
  };

  // Initialisation des diagnostics de performance et de stabilité
  const diagnostics: TunerDiagnostics = {
    attemptedEvaluations: 0,
    failedEvaluations: 0,
    failureLogs: [],
    optimalHyperparameterHistory: []
  };
  
  // Évaluer l'exactitude initiale de base
  const baseRank = await backtestHyperparameterSet(
    drawName,
    history,
    weights,
    currentParams,
    useSpatioTemporalHawkes,
    searchContext,
    diagnostics
  );
  log.push(`Rang de départ moyen des gagnants (Loss composite) : ${baseRank.toFixed(3)} (un rang plus bas est meilleur).`);

  // Extraire les caractéristiques pour le calcul du rayon spectral de covariance
  const extFeatures = await extractFeatures(drawName, history, 30);
  
  // Construire la matrice de caractéristiques (90 échantillons, 8 dimensions de descripteurs)
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
  
  // Taux d'apprentissage sgd dérivé de l'inverse du rayon spectral (rayon de la plus grande valeur propre)
  const optimalSgdLR = 1.0 / spectralRadius;
  log.push(`Rayon spectral de covariance calculé : ${spectralRadius.toFixed(4)}. Taux d'apprentissage optimal SGD théorique dérivé : ${optimalSgdLR.toFixed(5)}.`);

  // Déterminer dynamiquement le seuil de variance PCA cumulative
  const dynamicPcaThreshold = getDynamicPcaVarianceThreshold(nFeatures);
  currentParams.pcaVarianceThreshold = dynamicPcaThreshold;
  log.push(`Seuil de variance cumulative PCA dynamique dérivé des dimensions (${nFeatures}) : ${dynamicPcaThreshold.toFixed(4)}.`);

  // 1. Optimisation de hawkesDecay [0.05, 0.50]
  onProgress?.(18, "Optimisation cybernétique : Calibrage résonance Hawkes...");
  const hawkesRes = await adaptiveParameterSearch('hawkesDecay', 0.05, 0.50, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics);
  currentParams.hawkesDecay = hawkesRes.bestVal;
  log.push(`Optimisation hawkesDecay -> ${hawkesRes.bestVal.toFixed(4)} (Rang: ${hawkesRes.bestRank.toFixed(3)})`);

  // 2. Optimisation de spatialSigma [0.5, 3.0]
  onProgress?.(24, "Optimisation cybernétique : Calibrage de la dispersion gaussienne...");
  const sigmaRes = await adaptiveParameterSearch('spatialSigma', 0.5, 3.0, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics);
  currentParams.spatialSigma = sigmaRes.bestVal;
  log.push(`Optimisation spatialSigma -> ${sigmaRes.bestVal.toFixed(4)} (Rang: ${sigmaRes.bestRank.toFixed(3)})`);

  // 3. Optimisation de gapVelocityWeight [0.2, 2.0]
  onProgress?.(30, "Optimisation cybernétique : Calibrage des vitesses de transition gap...");
  const velocityRes = await adaptiveParameterSearch('gapVelocityWeight', 0.2, 2.0, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics);
  currentParams.gapVelocityWeight = velocityRes.bestVal;
  log.push(`Optimisation gapVelocityWeight -> ${velocityRes.bestVal.toFixed(4)} (Rang: ${velocityRes.bestRank.toFixed(3)})`);

  // 4. Optimisation de bayesWindowRatio [0.05, 0.30]
  onProgress?.(36, "Optimisation cybernétique : Calibrage des probabilités de transition bayésiennes...");
  const bayesRes = await adaptiveParameterSearch('bayesWindowRatio', 0.05, 0.30, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics);
  currentParams.bayesWindowRatio = bayesRes.bestVal;
  log.push(`Optimisation bayesWindowRatio -> ${bayesRes.bestVal.toFixed(4)} (Rang: ${bayesRes.bestRank.toFixed(3)})`);

  // 5. Optimisation de sgdLearningRate [optimalSgdLR * 0.1, optimalSgdLR * 2.0]
  onProgress?.(42, "Optimisation cybernétique : Calibrage du micro-SGD learning rate...");
  const sgdMin = optimalSgdLR * 0.1;
  const sgdMax = optimalSgdLR * 2.0;
  const sgdRes = await adaptiveParameterSearch('sgdLearningRate', sgdMin, sgdMax, 4, drawName, history, weights, currentParams, useSpatioTemporalHawkes, log, searchContext, diagnostics);
  currentParams.sgdLearningRate = sgdRes.bestVal;
  log.push(`Optimisation sgdLearningRate -> ${sgdRes.bestVal.toFixed(5)} (Rang: ${sgdRes.bestRank.toFixed(3)})`);

  const accuracyGain = baseRank - sgdRes.bestRank;
  log.push(`Optimisation terminée. Gain net d'alignement (Loss composite) : ${accuracyGain.toFixed(3)} rangs.`);
  log.push(`Diagnostics de l'Optimisation: Evaluations tentées = ${diagnostics.attemptedEvaluations}, Échecs = ${diagnostics.failedEvaluations}`);
  if (diagnostics.failedEvaluations > 0) {
    log.push(`Échantillon d'erreurs: ${diagnostics.failureLogs.slice(0, 3).join(" | ")}`);
  }
  onProgress?.(45, "Calibrage cybernétique achevé.");

  return {
    tunedParams: currentParams,
    accuracyGain: Math.max(0, accuracyGain),
    log
  };
};
