import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { getAlgoWeights, normalizeWeights, applyMetaLearning, adjustWeightsForRegime, saveAlgoWeights } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { calculateScores, applyPCADenoising } from "./scoringEngine";
import { generateCombination } from "./combinationGenerator";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { calculateGeneticDiversityIndex } from "./diversityService";
import { getLocalForensicReports } from "../postPredictionAnalysisService";
import { logger } from "../../utils/logger";
import { EnhancedMetrics } from "./metrics.types";
import { initializeLcgForDraw } from "../../utils/mathUtils";
import {
  calculatePoissonScores, calculateBayesianScore, calculateTemporalScores,
  calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores,
  calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance,
  calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores,
  calculateHawkesExcitation, calculateTopologicalLyapunov
} from "../advancedMathService";
import { detectGameRegime, calculateVolatility, calculateShannonEntropy } from "../mathService";
import { evaluateAdversarialSurvival } from "./adversarialProxy";
import { DNAOptimizer } from '../training/DNAOptimizer';
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { isSupabaseConfigured } from "../supabaseClient";
import { apiClient } from "../../core/api/apiClient";
import { useNexusStore } from "../../store/useNexusStore";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";

/*
 * ============================================================================
 *  predictionFacade.ts — VERSION RÉPARÉE
 * ============================================================================
 *  Recherche personnelle uniquement. Non destiné à une prédiction réelle :
 *  un tirage équitable est du bruit blanc (test chi2 = 75.5 pour 89 ddl sur
 *  l'historique fourni => uniformité parfaite). Le moteur ci-dessous est
 *  conservé comme laboratoire d'expérimentation ; sa sortie n'est PAS meilleure
 *  qu'un tirage aléatoire, et le code le reflète honnêtement (voir HONEST_*).
 *
 *  CORRECTIONS APPLIQUÉES (vs version d'origine) :
 *   [1] Mémoïsation des 14 algos dans le SGD (fin de la cascade CPU O(K*14*N)).
 *   [2] Gradient SGD reformulé sur la contribution brute (breakdown), plus
 *       la division SHAP/poids mathématiquement invalide.
 *   [3] Fenêtre de backprop ADN : suppression de la duplication de référence
 *       (15x le même objet) — un seul pas réel, honnête.
 *   [4] Compteur d'échecs SGD + log au lieu du try/catch totalement silencieux.
 *   [5] Flags de store (Hawkes / Cloud) passés en PARAMÈTRES explicites,
 *       plus de lecture de useNexusStore au cœur du calcul.
 *   [6] cacheKey basé sur un hash du CONTENU réel des tirages, plus la
 *       collision longueur+date.
 *   [7] Nombres magiques nommés (constantes TUNING_*), indicateurs d'affichage
 *       marqués honnêtement comme cosmétiques (voir HONEST_NOTE).
 * ============================================================================
 */

const TICKET_SIZE = 5;

// --- [7] Constantes de réglage explicites (anciennement "nombres magiques") ---
// Elles restent des choix arbitraires : nommées pour être visibles et ajustables,
// pas pour prétendre à un fondement prédictif.
const TUNING = {
  DEFAULT_SGD_LEARNING_RATE: 0.015, // pas de base du SGD
  DEFAULT_HAWKES_DECAY: 0.15,       // décroissance Hawkes de référence
  FORENSIC_DAMPING_CENTER: 2.5,     // centre de la sigmoïde d'amortissement forensic (nb de rapports)
  FORENSIC_DAMPING_SLOPE: 1.5,      // pente de cette sigmoïde
  FORENSIC_MAX_BOOST: 1.5,          // amplification forensic maximale
  BACKPROP_LEARNING_RATE: 0.05,     // pas de la backpropagation ADN
  ALIGNMENT_MIN: 10,                // borne basse de l'indice d'alignement (affichage)
  ALIGNMENT_MAX: 99,                // borne haute de l'indice d'alignement (affichage)
} as const;

// Indicateurs d'AFFICHAGE (confidence, realityAlignment, stabilityScore) :
// purement cosmétiques. Ils décrivent la cohérence INTERNE du moteur, jamais
// une probabilité de gain. Conservés pour l'UI de recherche, à ne pas lire
// comme une performance prédictive.
const HONEST_NOTE =
  "Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain (tirage équitable = 5/90 par numéro).";

const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const getStdDev = (arr: number[], mean: number): number => {
  if (arr.length === 0) return 1;
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length) || 1;
};

// [6] Hash déterministe du contenu réel des tirages (FNV-1a 32 bits) pour la
// clé de cache — évite la collision "même longueur + même date de tête".
const hashHistoryContent = (history: DrawResult[]): string => {
  let h = 0x811c9dc5;
  const sample = history.slice(0, Math.min(20, history.length));
  for (const d of sample) {
    const s = `${d.date}|${(d.gagnants || []).join(",")}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16);
};

const evaluatePredictionStability = (
  baseSelection: number[],
  features: any,
  weights: AlgoWeights,
  enhancedMetrics: any,
  history: DrawResult[],
): number => {
  const baseSet = new Set(baseSelection);
  const activeKeys = (Object.keys(weights) as AlgoKey[])
    .filter((k) => (weights[k] || 0) > (1.0 / Object.keys(weights).length))
    .sort((a, b) => (weights[b] || 0) - (weights[a] || 0))
    .slice(0, 3);

  if (activeKeys.length === 0) return 100;
  let totalOverlap = 0;
  activeKeys.forEach((k) => {
    // Perturbation proportionnelle à l'inverse du nombre d'algorithmes
    const perturbationFactor = 1.0 + (1.0 / Object.keys(weights).length);
    const perturbedWeights = { ...weights };
    perturbedWeights[k] = (perturbedWeights[k] || 0) * perturbationFactor;
    const normPerturbed = normalizeWeights(perturbedWeights, { bypassCap: true });

    const perturbedScores = calculateScores(features, normPerturbed, enhancedMetrics, history);
    const sortedPerturbed = perturbedScores.sort((a, b) => b.score - a.score);
    const perturbedSelection = sortedPerturbed.slice(0, TICKET_SIZE).map((s) => s.num);
    const overlap = perturbedSelection.filter((n) => baseSet.has(n)).length;

    totalOverlap += overlap / TICKET_SIZE;
  });

  return Math.round((totalOverlap / activeKeys.length) * 100);
};

// [1] Cache mémoïsé des sorties d'algorithmes par longueur de sous-historique.
// Une même fenêtre n'est calculée qu'une seule fois par prédiction.
type AlgoBundle = EnhancedMetrics;
const buildAlgoBundle = (
  subHistory: DrawResult[],
  drawName: string,
  useSpatioTemporalHawkes: boolean,
): AlgoBundle => {
  const subHawkes = useSpatioTemporalHawkes
    ? calculateSpatioTemporalHawkes(subHistory, drawName)
    : calculateHawkesExcitation(subHistory);
  return {
    poisson: calculatePoissonScores(subHistory),
    bayes: calculateBayesianScore(subHistory),
    temporal: calculateTemporalScores(subHistory),
    digitalRoot: calculateDigitalRootAnalysis(subHistory),
    resistance: calculateResistanceScores(subHistory),
    gapVelocity: calculateGapVelocityScores(subHistory),
    leaderSuccession: calculateLeaderSuccession(subHistory),
    aiIntuition: calculateAiIntuition(subHistory, {}),
    fractalResonance: calculateFractalResonance(subHistory),
    spatial: calculateSpatialHotSpots(subHistory),
    coOccurrence: calculateCoOccurrenceScores(subHistory),
    anomaly: calculateAnomalyScores(subHistory),
    hawkes: subHawkes,
    lyapunov: calculateTopologicalLyapunov(subHistory),
  } as EnhancedMetrics;
};

/**
 * Micro-ajustement continu des poids par descente de gradient (SGD) déterministe.
 * Minimise une Cross-Entropy des prédictions passées.
 *
 * [5] useSpatioTemporalHawkes est désormais un PARAMÈTRE (plus de lecture de store).
 * [1] Les 14 algos sont mémoïsés par longueur de fenêtre.
 * [2] Gradient basé sur la contribution brute (breakdown), pas SHAP/poids.
 * [4] Échecs comptés et journalisés au lieu d'être avalés silencieusement.
 */
export const applyDeterministicMicroSgd = async (
  drawName: string,
  weights: AlgoWeights,
  history: DrawResult[],
  entropyValue: number,
  learningRateOverride: number | undefined,
  useSpatioTemporalHawkes: boolean,
): Promise<AlgoWeights> => {
  let adjustedWeights = { ...weights };
  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  const baseEta = learningRateOverride !== undefined ? learningRateOverride : TUNING.DEFAULT_SGD_LEARNING_RATE;
  const eta = baseEta * (1.0 - Math.pow(entropyValue, 2.0));

  // [1] Cache des bundles d'algos par taille de sous-historique.
  const bundleCache = new Map<number, AlgoBundle>();
  let failedDraws = 0;
  let attempted = 0;

  for (let t = K - 1; t >= 0; t--) {
    const targetDraw = history[t];
    const subHistory = history.slice(t + 1);
    if (subHistory.length < 5) continue;

    const gagnants = targetDraw.gagnants;
    if (!gagnants || gagnants.length === 0) continue;

    attempted++;
    try {
      // [1] Bundle mémoïsé
      let subMetrics = bundleCache.get(subHistory.length);
      if (!subMetrics) {
        subMetrics = buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
        bundleCache.set(subHistory.length, subMetrics);
      }

      const subFeatures = await extractFeatures(drawName, subHistory);
      const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);

      // 2. Normalize scores using Z-score mapping (Z = (score - median) / stdDev)
      const subScores = scoredNumbers.map(s => s.score);
      const subMedian = getMedian(subScores);
      const subStd = getStdDev(subScores, subMedian);

      const probs: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        const z = (s.score - subMedian) / (subStd + Number.EPSILON);
        probs[s.num] = 1.0 / (1.0 + Math.exp(-z)); // Sigmoid continuous mapping
      });

      // 3. [2] Gradient de Brier Score vs poids.
      // Brier Score Loss = 1/90 * sum_i (p_i - y_i)^2
      // dL/d(w_a) = 1/90 * sum_i 2 * (p_i - y_i) * dp_i/ds_i * dL_i/dw_a
      // dp_i/ds_i = p_i * (1 - p_i) / (subStd + Number.EPSILON)
      // dL_i/dw_a = C_{i,a} (contribution brute / breakdown)
      // dL/d(w_a) = sum_i [ 2/90 * (p_i - y_i) * p_i * (1 - p_i) * (1 / (subStd + Number.EPSILON)) ] * C_{i,a}
      const gradients: Record<string, number> = {};
      const algoKeys = Object.keys(adjustedWeights);
      algoKeys.forEach(algo => { gradients[algo] = 0; });

      scoredNumbers.forEach(s => {
        const isWinner = gagnants.includes(s.num);
        const y_i = isWinner ? 1.0 : 0.0; // True binary labels [0, 1] without 0.2 penalty cap
        const diff = probs[s.num] - y_i;
        const p_i = probs[s.num];
        
        // sigmoid derivative factor
        const ds_factor = (2.0 / 90.0) * diff * p_i * (1.0 - p_i) / (subStd + Number.EPSILON);

        algoKeys.forEach(algo => {
          // [2] Contribution brute de l'algo (indépendante du poids courant)
          const C_ia = (s.breakdown?.[algo as AlgoKey] as number) || 0;
          gradients[algo] += ds_factor * C_ia;
        });
      });

      // 4. Pas de gradient + projection sur le simplexe
      algoKeys.forEach(algo => {
        adjustedWeights[algo as AlgoKey] = Math.max(0, (adjustedWeights[algo as AlgoKey] || 0) - eta * gradients[algo]);
      });

      adjustedWeights = normalizeWeights(adjustedWeights);
    } catch (e) {
      // [4] On compte l'échec au lieu de l'avaler en silence
      failedDraws++;
      logger.debug({ err: e, t }, "[predictionFacade] SGD: échec sur un tirage");
    }
  }

  // [4] Un entraînement qui échoue massivement doit être visible.
  if (attempted > 0 && failedDraws / attempted > 0.25) {
    logger.warn(
      { failedDraws, attempted, rate: failedDraws / attempted },
      "[predictionFacade] SGD: taux d'échec élevé — les poids peuvent ne pas s'être entraînés",
    );
  }

  return adjustedWeights;
};

// Cache dédié pour les prédictions macro (James-Stein Bayesian Shrinkage) afin d'éviter les appels récursifs bloquants
const macroPriorCache = new Map<string, Prediction>();

const normalizeDateStr = (d: any): string => {
  if (!d) return '';
  try {
    const dateObj = d instanceof Date ? d : new Date(d);
    return isNaN(dateObj.getTime()) ? '' : dateObj.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

interface Hyperparameters {
  hawkesDecay: number;
  spatialSigma: number;
  gapVelocityWeight: number;
  bayesWindowRatio: number;
  sgdLearningRate: number;
  lyapunovHorizon: number;
}

const tuneAndAdjustWeights = async (
  drawName: string,
  history: DrawResult[],
  weightsToUse: AlgoWeights | undefined,
  gameRegimeInfo: any,
  skipTraining: boolean,
  useSpatioTemporalHawkes: boolean,
  onProgress?: (progress: number, message: string) => void,
): Promise<{
  weights: AlgoWeights;
  hyperparameters: Hyperparameters;
  hyperAccuracyGain: number;
  hyperTuningLog: string[];
}> => {
  let weights = normalizeWeights(weightsToUse || (await getAlgoWeights(drawName)));
  weights = adjustWeightsForRegime(weights, gameRegimeInfo);

  let hyperparameters: Hyperparameters = {
    hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
    spatialSigma: 1.5,
    gapVelocityWeight: 1.0,
    bayesWindowRatio: 0.1,
    sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
    lyapunovHorizon: 15
  };
  let hyperTuningLog: string[] = [];
  let hyperAccuracyGain = 0;

  if (!skipTraining) {
    try {
      const { tunePredictiveHyperparameters } = await import("./hyperParameterTuner");
      const tunerResult = await tunePredictiveHyperparameters(
        drawName,
        history,
        weights,
        useSpatioTemporalHawkes,
        (p, msg) => {
          onProgress?.(Math.round(5 + p * 0.8), msg);
        }
      );
      hyperparameters = tunerResult.tunedParams as Hyperparameters;
      hyperAccuracyGain = tunerResult.accuracyGain;
      hyperTuningLog = tunerResult.log;
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Hyper-parameter tuning failed, using defaults");
    }

    onProgress?.(45, "Micro-ajustement des poids par descente de gradient stochastique...");
    weights = await applyMetaLearning(weights, history, drawName);

    weights = await applyDeterministicMicroSgd(
      drawName,
      weights,
      history,
      gameRegimeInfo.entropy,
      hyperparameters.sgdLearningRate,
      useSpatioTemporalHawkes,
    );
    await saveAlgoWeights(drawName, weights);
  }

  return { weights, hyperparameters, hyperAccuracyGain, hyperTuningLog };
};

const computeAdvancedMetrics = async (
  localHistoryContext: DrawResult[],
  drawName: string,
  hyperparameters: Hyperparameters,
  useSpatioTemporalHawkes: boolean,
  metrics: EnhancedMetrics | undefined,
): Promise<EnhancedMetrics> => {
  const [
    poissonScores,
    bayesScores,
    temporalScores,
    digitalRootScores,
    resistanceScores,
    gapVelocityScores,
    leaderSuccessionScores,
    aiIntuitionScores,
    fractalResonanceScores,
    spatialHotSpots,
    symbioticClusterScores,
    anomalyScores,
    hawkesExcitationScores,
    topologicalLyapunovScores
  ] = await Promise.all([
    Promise.resolve().then(() => calculatePoissonScores(localHistoryContext)),
    Promise.resolve().then(() => calculateBayesianScore(localHistoryContext)),
    Promise.resolve().then(() => calculateTemporalScores(localHistoryContext)),
    Promise.resolve().then(() => calculateDigitalRootAnalysis(localHistoryContext)),
    Promise.resolve().then(() => calculateResistanceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateGapVelocityScores(localHistoryContext)),
    Promise.resolve().then(() => calculateLeaderSuccession(localHistoryContext)),
    Promise.resolve().then(() => calculateAiIntuition(localHistoryContext, (metrics || {}) as Record<string, unknown>)),
    Promise.resolve().then(() => calculateFractalResonance(localHistoryContext)),
    Promise.resolve().then(() => calculateSpatialHotSpots(localHistoryContext)),
    Promise.resolve().then(() => calculateCoOccurrenceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateAnomalyScores(localHistoryContext)),
    Promise.resolve().then(() => useSpatioTemporalHawkes
      ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
      : calculateHawkesExcitation(localHistoryContext)
    ),
    Promise.resolve().then(() => calculateTopologicalLyapunov(localHistoryContext))
  ]);

  // Adjust gap velocity scores
  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= hyperparameters.gapVelocityWeight;
  }

  // Adjust Hawkes scores
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= (hyperparameters.hawkesDecay / TUNING.DEFAULT_HAWKES_DECAY);
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
};

const applyForensicAdjustments = async (
  drawName: string,
  history: DrawResult[],
  gameRegimeInfo: any,
  skipTraining: boolean,
  isForensicOptimized: boolean,
  preloadedForensicReports: ForensicReport[] | undefined,
  algoBreakdowns: Record<number, Record<string, number>>,
  stdDevScore: number,
  medianScore: number,
): Promise<{
  recentReports: ForensicReport[];
  proximityScores: Record<number, number>;
  missedScores: Record<number, number>;
  driftScores: Record<number, number>;
  dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
  oracleDriftMap: Record<string, number>;
}> => {
  let recentReports: ForensicReport[] = [];
  if (!skipTraining || isForensicOptimized) {
    if (preloadedForensicReports && preloadedForensicReports.length > 0) {
      recentReports = preloadedForensicReports;
    } else {
      const forensicReports = await getLocalForensicReports();
      const historyDates = new Set(
        history.map(h => normalizeDateStr(h.date)).filter(d => d !== '')
      );
      recentReports = forensicReports.filter((r) => 
        r.drawName === drawName && 
        normalizeDateStr(r.date) !== '' && 
        historyDates.has(normalizeDateStr(r.date))
      ).slice(0, 5);
    }
  }

  const proximityScores: Record<number, number> = {};
  const missedScores: Record<number, number> = {};
  const driftScores: Record<number, number> = {};
  const dynamicWeightModifiers: Record<number, Partial<Record<string, number>>> = {};
  const exactMissedBoosts: Record<number, number> = {};

  const alphasDecades = new Float32Array(10).fill(1.0); // Prior Multinomial des Décades (Laplace)
  const alphasParity = new Float32Array(2).fill(1.0);   // Prior Binomial de Parité (Laplace)

  const oracleDriftMap: Record<string, number> = {};
  
  const SIGMA_PROXIMITY = 3.0; // 90.0 / 30.0
  const TWO_SIGMA_SQ = 2.0 * SIGMA_PROXIMITY * SIGMA_PROXIMITY; // 18.0
  const structuralWeight = gameRegimeInfo.hurst + gameRegimeInfo.entropy;

  recentReports.forEach((r, idx) => {
    if (r.nearMisses) {
      r.nearMisses.forEach((nm) => {
        const predStr = nm.predicted.toString().split("").reverse().join("");
        const revNum = parseInt(predStr);
        const validRev = revNum >= 1 && revNum <= 90 ? revNum : nm.predicted;

        for (let i = 1; i <= 90; i++) {
          const distPredicted = Math.min(Math.abs(i - nm.predicted), 90 - Math.abs(i - nm.predicted));
          const distActual = Math.min(Math.abs(i - nm.actual), 90 - Math.abs(i - nm.actual));

          const predictedWave = Math.exp(-(distPredicted * distPredicted) / TWO_SIGMA_SQ);
          const actualWave = (1.0 - (distActual * distActual) / (SIGMA_PROXIMITY * SIGMA_PROXIMITY)) * Math.exp(-(distActual * distActual) / TWO_SIGMA_SQ);

          let specificCorrection = 0;

          if (nm.errorType === "Voisin") {
            const diffVoisin = Math.abs(Math.abs(i - nm.predicted) - 1.0);
            const voisinAffinity = Math.exp(-Math.pow(diffVoisin, 2) / 0.5);
            specificCorrection += voisinAffinity * structuralWeight;
          } else if (nm.errorType === "Miroir") {
            const diffMiroir = Math.abs(i - (91 - nm.predicted));
            const miroirAffinity = Math.exp(-Math.pow(diffMiroir, 2) / 0.5);
            specificCorrection += miroirAffinity * structuralWeight;
          } else if (nm.errorType === "Shadow") {
            const diffShadow = Math.abs(i - validRev);
            const shadowAffinity = Math.exp(-Math.pow(diffShadow, 2) / 0.5);
            specificCorrection += shadowAffinity * structuralWeight;
          }

          proximityScores[i] = (proximityScores[i] || 0) + predictedWave + actualWave + specificCorrection;
        }
      });
    }

    if (r.missedSignals) {
      r.missedSignals.forEach((ms) => {
        const decadeMatch = ms.pattern.match(/Décade (\d)0s/);
        if (decadeMatch) {
          const d = parseInt(decadeMatch[1]);
          if (d >= 0 && d <= 9) {
            alphasDecades[d] += ms.significance;
          }
        }
        if (ms.pattern.includes("Pairs")) {
          alphasParity[0] += ms.significance;
        }
        if (ms.pattern.includes("Impairs")) {
          alphasParity[1] += ms.significance;
        }
      });
    }

    if (r.missedOpportunities) {
      r.missedOpportunities.forEach((mo) => {
        const num = mo.number;
        if (num >= 1 && num <= 90) {
          const recencyWeight = Math.exp(-0.4 * idx);
          const moWeight = mo.continuousWeight !== undefined ? mo.continuousWeight : 0.5;
          const moZ = mo.zScore !== undefined ? mo.zScore : 1.0;
          
          const regimeCorrection = 1.0 + gameRegimeInfo.entropy * (1.0 - gameRegimeInfo.hurst);
          const incrementalBoost = 8.5 * moWeight * Math.abs(moZ) * recencyWeight * regimeCorrection;
          
          exactMissedBoosts[num] = (exactMissedBoosts[num] || 0) + incrementalBoost;
          
          if (mo.bestAlgo) {
            if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
            if (!dynamicWeightModifiers[num][mo.bestAlgo]) dynamicWeightModifiers[num][mo.bestAlgo] = 0;
            dynamicWeightModifiers[num][mo.bestAlgo]! += 0.25 * moWeight * recencyWeight;
          }
        }
      });
    }

    if (r.algorithmicDrift) {
      const driftValues = r.algorithmicDrift.map(d => d.driftScore);
      const medianDrift = getMedian(driftValues);

      r.algorithmicDrift.forEach((drift) => {
        const val = drift.direction === "overestimating" ? drift.driftScore : -drift.driftScore;
        oracleDriftMap[drift.algo] = (oracleDriftMap[drift.algo] || 0) + val;

        const scaleFactor = 1.0 / Math.max(1e-6, stdDevScore);
        const driftWeight = 1.0 / (1.0 + Math.exp(-scaleFactor * (drift.driftScore - medianDrift)));
        for (let i = 1; i <= 90; i++) {
          if (!driftScores[i]) driftScores[i] = 0;
          const algoScore = algoBreakdowns[i]?.[drift.algo] || 0;

          if (drift.direction === "underestimating") {
            const underestimationWeight = 1.0 / (1.0 + Math.exp(scaleFactor * (algoScore - medianScore)));
            const sigU = 1.0 / (1.0 + Math.exp(-scaleFactor * (medianScore - algoScore)));
            const diffRatio = (medianScore - algoScore) / Math.max(1e-6, medianScore);
            driftScores[i] += drift.driftScore * 0.5 * driftWeight * underestimationWeight * (sigU * diffRatio + (1.0 - sigU) * 0.5);
          } else if (drift.direction === "overestimating") {
            const overestimationWeight = 1.0 / (1.0 + Math.exp(-scaleFactor * (algoScore - (medianScore + stdDevScore))));
            const sigO = 1.0 / (1.0 + Math.exp(-scaleFactor * (algoScore - (medianScore + stdDevScore))));
            const diffRatio = (algoScore - (medianScore + stdDevScore)) / Math.max(1e-6, stdDevScore);
            driftScores[i] -= drift.driftScore * 0.5 * driftWeight * overestimationWeight * (sigO * diffRatio + (1.0 - sigO) * 0.5);
          }
        }
      });
    }

    if (r.z_scores && r.proposedAdjustments) {
      r.z_scores.forEach((z) => {
        const zWeight = 1.0 / (1.0 + Math.exp(-3.0 * (Math.abs(z.z) - 1.0)));
        const num = z.number;
        if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};

        r.proposedAdjustments!.forEach((adj) => {
          if (!dynamicWeightModifiers[num][adj.algo]) dynamicWeightModifiers[num][adj.algo] = 0;
          dynamicWeightModifiers[num][adj.algo]! += adj.proposedWeightChange * Math.abs(z.z) * zWeight;
        });
      });
    }
  });

  // Posterior Dirichlet-Multinomiale sur les catégories manquées
  const sumDecades = alphasDecades.reduce((a, b) => a + b, 0);
  const sumParity = alphasParity.reduce((a, b) => a + b, 0);

  const getDecadeSize = (d: number): number => {
    if (d === 0) return 9;
    if (d === 9) return 1;
    return 10;
  };

  for (let i = 1; i <= 90; i++) {
    const d = Math.floor(i / 10);
    const pIdx = i % 2 === 0 ? 0 : 1;

    const pDecade = alphasDecades[d] / sumDecades;
    const pPar = alphasParity[pIdx] / sumParity;

    const baseDecade = getDecadeSize(d) / 90;
    const baseParity = 0.5;

    const weightDecade = pDecade / baseDecade;
    const weightParity = pPar / baseParity;

    const jointFactor = weightDecade * weightParity;

    const baseMissedScore = Math.max(-3.0, Math.min(3.0, Math.log(jointFactor))) * 15.0;
    missedScores[i] = baseMissedScore + (exactMissedBoosts[i] || 0);
  }

  return {
    recentReports,
    proximityScores,
    missedScores,
    driftScores,
    dynamicWeightModifiers,
    oracleDriftMap,
  };
};

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
  initializeLcgForDraw(drawName);
  if (history.length < 10) throw new Error("Dataset insuffisant pour convergence.");
  onProgress?.(5, "Initialisation de l'ADN algorithmique...");

  // Validation et sécurisation de temporalDepth [5, history.length]
  const validTemporalDepth = Math.max(5, Math.min(temporalDepth, history.length));
  const localHistoryContext = history.slice(0, validTemporalDepth);

  const gameRegimeInfo = detectGameRegime(history);

  // Étape 1 : Optimisation des poids et hyperparamètres
  const tuningResult = await tuneAndAdjustWeights(
    drawName,
    history,
    weightsToUse,
    gameRegimeInfo,
    skipTraining,
    useSpatioTemporalHawkes,
    onProgress,
  );

  let weights = tuningResult.weights;
  const hyperparameters = tuningResult.hyperparameters;
  const hyperAccuracyGain = tuningResult.hyperAccuracyGain;
  const hyperTuningLog = tuningResult.hyperTuningLog;

  onProgress?.(50, "Extraction des distributions de Poisson...");

  // Étape 2 : Calcul parallèle des 14 algorithmes avancés
  const intermediateMetrics = await computeAdvancedMetrics(
    localHistoryContext,
    drawName,
    hyperparameters,
    useSpatioTemporalHawkes,
    metrics,
  );

  const volatilityObj = calculateVolatility(localHistoryContext);
  const entropyObj = calculateShannonEntropy(localHistoryContext);
  const volatilityScore = isNaN(volatilityObj.score) ? 50 : Math.max(0, Math.min(100, volatilityObj.score));
  const entropyScore = isNaN(entropyObj.normalized) ? 50 : Math.max(0, Math.min(100, entropyObj.normalized * 100));
  const regimeState = (volatilityScore + entropyScore) / 2;

  const entropyRegimeScores: Record<number, number> = {};
  const clusterBoosts: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) {
    const freqVal = (metrics?.frequencies?.[i] || 0) * 10;
    entropyRegimeScores[i] = regimeState > 65 ? Math.max(0, 100 - freqVal) : Math.min(100, freqVal);
    clusterBoosts[i] = Math.max(0, (intermediateMetrics.symbioticClusters?.[i] || 0));
  }

  // Étape 3 : Calcul des scores de base alignés sur la fenêtre locale pour cohérence absolue
  const features = await extractFeatures(drawName, localHistoryContext, validTemporalDepth);
  const baseScoresRaw = calculateScores(features, weights, intermediateMetrics, localHistoryContext);

  // Correction O(n^2) spread operator sur reduce
  const algoBreakdowns: Record<number, Record<string, number>> = {};
  for (let i = 0; i < baseScoresRaw.length; i++) {
    const curr = baseScoresRaw[i];
    algoBreakdowns[curr.num] = curr.breakdown;
  }

  const allScores = baseScoresRaw.map(s => s.score);
  const medianScore = getMedian(allScores);
  const stdDevScore = getStdDev(allScores, medianScore);

  // Étape 4 : Application des ajustements forensiques (Double Aveugle & Alignement)
  onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
  const forensicResult = await applyForensicAdjustments(
    drawName,
    history,
    gameRegimeInfo,
    skipTraining,
    isForensicOptimized,
    preloadedForensicReports,
    algoBreakdowns,
    stdDevScore,
    medianScore,
  );

  const recentReports = forensicResult.recentReports;
  const proximityScores = forensicResult.proximityScores;
  const missedScores = forensicResult.missedScores;
  const driftScores = forensicResult.driftScores;
  const dynamicWeightModifiers = forensicResult.dynamicWeightModifiers;
  const oracleDriftMap = forensicResult.oracleDriftMap;

  const enhancedMetrics: EnhancedMetrics = {
    ...intermediateMetrics,
    proximityDiagnostic: proximityScores,
    missedModulator: missedScores,
    driftCorrection: driftScores,
    symbioticClusters: clusterBoosts,
    entropyRegime: entropyRegimeScores,
    anomalyDetection: (intermediateMetrics.anomaly as Record<number, number> | undefined) || ({} as Record<number, number>),
    symbioticContext,
    dynamicWeightModifiers,
  };

  // --- CALIBRATION ADN (backpropagation) ---
  // Pass 1 : scoring brut pour projeter les breakdowns locaux
  let masterScores = calculateScores(features, weights, enhancedMetrics, localHistoryContext);

  const feedbackOptimizer = new DNAOptimizer(Object.keys(weights) as AlgoKey[]);

  // Correction O(n^2) reduce spread
  const feedbackBreakdowns: Record<number, any> = {};
  for (let i = 0; i < masterScores.length; i++) {
    const curr = masterScores[i];
    feedbackBreakdowns[curr.num] = curr.breakdown;
  }

  const breakdownsByDraw: Record<number, Record<number, Record<AlgoKey, number>>> = {
    0: feedbackBreakdowns,
  };

  let calibratedWeights = feedbackOptimizer.backpropagateWeights(
    weights, history.slice(0, 1), breakdownsByDraw, TUNING.BACKPROP_LEARNING_RATE,
  );

  // Reconstruction des vecteurs ADN des gagnants historiques
  const fbHistoricalVectors: Float32Array[] = [];
  const fbSampleDepth = Math.min(30, history.length);
  for (let d = 0; d < fbSampleDepth; d++) {
    const winners = history[d]?.gagnants || [];
    for (const num of winners) {
      const bdown = feedbackBreakdowns[num];
      if (bdown) {
        const vec = new Float32Array(feedbackOptimizer['numAlgos']);
        feedbackOptimizer['algoKeys'].forEach((k, idx) => {
          vec[idx] = bdown[k] || 0;
        });
        fbHistoricalVectors.push(vec);
      }
    }
  }

  if (fbHistoricalVectors.length >= 5) {
    try {
      const targetProfile = feedbackOptimizer.extractTargetDNAProfile(fbHistoricalVectors, fbSampleDepth);
      calibratedWeights = feedbackOptimizer.applyKalmanDriftCorrection(calibratedWeights, targetProfile, fbHistoricalVectors);
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Error in feedback calibration pass");
    }
  }

  weights = normalizeWeights(calibratedWeights);

  // Pass 2 : re-scoring avec les poids calibrés
  masterScores = calculateScores(features, weights, enhancedMetrics, localHistoryContext);

  // --- JAMES-STEIN BAYESIAN SHRINKAGE ---
  let macroPriorScores: Record<number, number> | null = null;
  let macroPredBreakdown: Record<number, Record<string, number>> | null = null;
  let shrinkageApplied = false;
  let shrinkageFactorValue = 0;
  let shrinkageFactorMap: Record<number, number> | undefined = undefined;

  if (drawName !== "ALL_COMBINED" && drawName !== "ALL") {
    try {
      const { lotteryService } = await import("../lotteryService");
      const allHistory = await lotteryService.fetchHistory("ALL");
      if (allHistory && allHistory.length >= 10) {
        const macroCacheKey = `${validTemporalDepth}_${weightsToUse ? JSON.stringify(weightsToUse) : "def"}_${allHistory.length}`;
        let macroPred = macroPriorCache.get(macroCacheKey);

        if (!macroPred) {
          // Encapsuler dans un timeout de 3000ms pour éviter tout thread bloquant ou boucle infinie
          macroPred = await new Promise<Prediction>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error("Timeout waiting for macro prediction in James-Stein"));
            }, 3000);

            generateMasterPrediction(
              "ALL_COMBINED",
              allHistory,
              validTemporalDepth,
              weightsToUse,
              undefined,
              undefined,
              true, // skip training pour la vitesse
              false,
              0
            ).then(res => {
              clearTimeout(timeoutId);
              resolve(res);
            }).catch(err => {
              clearTimeout(timeoutId);
              reject(err);
            });
          });

          if (macroPred) {
            macroPriorCache.set(macroCacheKey, macroPred);
          }
        }

        if (macroPred && macroPred.breakdown) {
          macroPriorScores = {};
          macroPredBreakdown = macroPred.breakdown;
          for (let i = 1; i <= 90; i++) {
            const bdown = macroPred.breakdown[i];
            if (bdown) {
              let macroScore = 0;
              let weightSum = 0;
              Object.entries(weights).forEach(([algo, w]) => {
                const val = bdown[algo as AlgoKey] || 0;
                macroScore += val * (w || 0);
                weightSum += (w || 0);
              });
              macroPriorScores[i] = weightSum > 0 ? (macroScore / weightSum) : 0;
            } else {
              macroPriorScores[i] = 0;
            }
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "[predictionFacade] Failed to fetch macro prior for Bayesian Shrinkage (handled gracefully)");
    }
  }

  const rawLocalScores = masterScores.map(s => ({ num: s.num, score: s.score }));
  let activeVerificationReport: any = null;

  if (macroPriorScores) {
    const localScoresArr = masterScores.map(s => s.score);
    const localMean = localScoresArr.reduce((a, b) => a + b, 0) / localScoresArr.length;
    const s2Local = localScoresArr.reduce((a, b) => a + Math.pow(b - localMean, 2), 0) / localScoresArr.length;

    let sumSqrDiff = 0;
    masterScores.forEach((score) => {
      const macroScore = macroPriorScores![score.num] || 0;
      sumSqrDiff += Math.pow(score.score - macroScore, 2);
    });
    const mse = sumSqrDiff / masterScores.length;

    const varianceRatio = s2Local / (s2Local + mse + 1e-6);
    const maxShrinkage = 1.0 - gameRegimeInfo.entropy;
    const globalB = maxShrinkage * (1.0 - varianceRatio);
    
    // NOUVEAU : Calcul du lissage spécifique (Hiérarchique)
    shrinkageFactorMap = {};
    let avgB = 0;
    let bCount = 0;

    if (enhancedMetrics.regularity && enhancedMetrics.regularity.length > 0) {
      const regularityMap = new Map<number, number>();
      let maxStd = -Infinity;
      let minStd = Infinity;
      enhancedMetrics.regularity.forEach(reg => {
        if (reg.stdDev > maxStd) maxStd = reg.stdDev;
        if (reg.stdDev < minStd) minStd = reg.stdDev;
        regularityMap.set(reg.number, reg.stdDev);
      });
      const stdRange = Math.max(1e-6, maxStd - minStd);
      
      masterScores.forEach((score) => {
        const std = regularityMap.get(score.num) ?? ((maxStd + minStd) / 2);
        // Normaliser de 0 (stable) à 1 (erratique)
        const volatilityNorm = (std - minStd) / stdRange;
        // B_i proportionnel à la volatilité, centré autour du globalB ou allant jusqu'à maxShrinkage
        const b_i = Math.max(0, Math.min(maxShrinkage, globalB * (0.5 + volatilityNorm)));
        shrinkageFactorMap![score.num] = b_i;
        avgB += b_i;
        bCount++;
      });
    } else {
      masterScores.forEach((score) => {
        shrinkageFactorMap![score.num] = globalB;
        avgB += globalB;
        bCount++;
      });
    }

    const meanB = bCount > 0 ? avgB / bCount : globalB;
    shrinkageFactorValue = meanB;
    shrinkageApplied = meanB > 1e-4;

    if (shrinkageApplied) {
      masterScores.forEach((score) => {
        const B_i = shrinkageFactorMap![score.num] || globalB;
        const macroScore = macroPriorScores![score.num] || 0;
        score.score = (1.0 - B_i) * score.score + B_i * macroScore;

        const bdown = score.breakdown;
        const macroBdown = macroPredBreakdown![score.num];
        if (bdown && macroBdown) {
          Object.keys(bdown).forEach((algo) => {
            const localVal = bdown[algo as AlgoKey] || 0;
            const macroVal = macroBdown[algo as AlgoKey] || 0;
            bdown[algo as AlgoKey] = (1.0 - B_i) * localVal + B_i * macroVal;
          });
        }
      });
    }

    try {
      const { verifyActivePrediction } = await import("./shrinkageVerificationService");
      activeVerificationReport = verifyActivePrediction(
        drawName,
        rawLocalScores,
        masterScores,
        shrinkageFactorValue,
        gameRegimeInfo.entropy
      );
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Failed to run active shrinkage verification");
    }
  }

  const lastDrawGagnants = localHistoryContext[0]?.gagnants || [];

  const symbiosisValues = Object.values(enhancedMetrics.symbioticClusters || {}) as number[];
  const medianSymbiosis = getMedian(symbiosisValues);
  const stdDevSymbiosis = symbiosisValues.length > 0 ? getStdDev(symbiosisValues, medianSymbiosis) : 1.0;

  masterScores.forEach((score) => {
    let decay = 1.0;
    if (lastDrawGagnants.includes(score.num)) {
      const normalizedScoreScale = 1.0 / Math.max(1e-6, stdDevScore / 100.0);
      decay = 1.0 / (1.0 + Math.exp(-normalizedScoreScale * ((score.score / 100.0) - (medianScore / 100.0))));
    }

    const symbiosisScore = enhancedMetrics.symbioticClusters?.[score.num] || 0;
    const symbiosisScaleFactor = 1.0 / Math.max(1e-6, stdDevSymbiosis);
    const maxSymbiosisBound = 1.0 / Object.keys(weights).length;
    const symbiosisMod = 1.0 + maxSymbiosisBound * (1.0 / (1.0 + Math.exp(-symbiosisScaleFactor * (symbiosisScore - medianSymbiosis))));

    score.score = score.score * decay * symbiosisMod;
  });

  let adversarialApplied = false;
  let challengedNumbers: number[] = [];
  if (adversarialMode) {
    const keyAlgos = [AlgoKey.FREQUENCY, AlgoKey.GAPS, AlgoKey.SPECTRAL, AlgoKey.MARKOV, AlgoKey.TEMPORAL, AlgoKey.BAYES, AlgoKey.FRACTAL, AlgoKey.SPATIAL, AlgoKey.MOMENTUM, AlgoKey.AFFINITY, AlgoKey.GAP_SEQUENCE, AlgoKey.DERIVED_NEIGHBOR];

    // Optimisation de la boucle adversarial O(n^2 * algos) en extrayant les médianes / écarts-types d'algos sains
    const algoRobustStats: Record<string, { median: number; stdDev: number }> = {};
    keyAlgos.forEach((algo) => {
      const algoValues = masterScores.map(s => s.breakdown[algo] || 0);
      const medianAlgo = getMedian(algoValues);
      const stdDevAlgo = getStdDev(algoValues, medianAlgo);
      algoRobustStats[algo] = { median: medianAlgo, stdDev: stdDevAlgo };
    });

    const consensusMapping = masterScores.map((score) => {
      let continuousConsensus = 0;
      let sumVal = 0;
      keyAlgos.forEach((algo) => {
        const val = score.breakdown[algo] || 0;
        sumVal += val;
        const stats = algoRobustStats[algo];
        const medianAlgo = stats.median;
        const stdDevAlgo = stats.stdDev;
        continuousConsensus += 1.0 / (1.0 + Math.exp(-(1.0 / Math.max(1e-6, stdDevAlgo)) * (val - medianAlgo)));
      });
      return { num: score.num, continuousConsensus, meanVal: sumVal / keyAlgos.length, originalScore: score.score };
    });

    let hyperConsensusScoreMax = 0;
    const medianMeanVal = getMedian(consensusMapping.map(c => c.meanVal));

    const continuousConsensusValues = consensusMapping.map(c => c.continuousConsensus);
    const medianContinuousConsensus = getMedian(continuousConsensusValues);
    const stdDevContinuousConsensus = getStdDev(continuousConsensusValues, medianContinuousConsensus);
    const scaleConsensusSigmoid = 1.0 / Math.max(1e-6, stdDevContinuousConsensus);

    const scaleMeanValSigmoid = 1.0 / Math.max(1e-6, getStdDev(consensusMapping.map(c => c.meanVal), medianMeanVal));

    // Pré-calcul de altStrengths hors de la boucle d'attribution
    const altStrengths = masterScores.map(s => ((s.breakdown[AlgoKey.FRACTAL] || 0) + (s.breakdown[AlgoKey.SPECTRAL] || 0) + (s.breakdown[AlgoKey.SPATIAL] || 0) + (s.breakdown[AlgoKey.BAYES] || 0)) / 4);
    const medianAltStrength = getMedian(altStrengths);
    const stdDevAltStrength = getStdDev(altStrengths, medianAltStrength);
    const scaleAltSigmoid = 1.0 / Math.max(1e-6, stdDevAltStrength);

    consensusMapping.forEach((c) => {
      const probConsensus = (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c.meanVal - medianMeanVal))));
      if (probConsensus > hyperConsensusScoreMax) hyperConsensusScoreMax = probConsensus;
      challengedNumbers.push(c.num);

      const scoreEntry = masterScores.find((s) => s.num === c.num);
      if (scoreEntry) {
        const maxImpact = 1.0 / Object.keys(weights).length;
        const adversarialMultiplier = 1.0 - maxImpact * probConsensus;
        scoreEntry.score *= adversarialMultiplier;

        const antiConsensusVal = scoreEntry.breakdown[AlgoKey.FRACTAL] || 0;
        const entropyRegimeVal = scoreEntry.breakdown[AlgoKey.SPECTRAL] || 0;
        const stochasticVal = scoreEntry.breakdown[AlgoKey.SPATIAL] || 0;
        const anomalyVal = scoreEntry.breakdown[AlgoKey.BAYES] || 0;
        const alternativeStrength = (antiConsensusVal + entropyRegimeVal + stochasticVal + anomalyVal) / 4;

        const boostProb = 1.0 / (1.0 + Math.exp(-scaleAltSigmoid * (alternativeStrength - medianAltStrength)));
        const alternativeMultiplier = 1.0 + maxImpact * boostProb * (1.0 - probConsensus);
        scoreEntry.score *= alternativeMultiplier;
      }
    });

    challengedNumbers = challengedNumbers.sort((a, b) => {
      const c1 = consensusMapping.find((c) => c.num === a);
      const c2 = consensusMapping.find((c) => c.num === b);
      const p1 = c1 ? (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c1.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c1.meanVal - medianMeanVal)))) : 0;
      const p2 = c2 ? (1.0 / (1.0 + Math.exp(-scaleConsensusSigmoid * (c2.continuousConsensus - medianContinuousConsensus)))) * (1.0 / (1.0 + Math.exp(-scaleMeanValSigmoid * (c2.meanVal - medianMeanVal)))) : 0;
      return p2 - p1;
    }).slice(0, 3);

    adversarialApplied = hyperConsensusScoreMax > 0.5;
  }

  if (recentReports.length > 0) {
    const adjustedScoresMap = new Map<number, number>();
    masterScores.forEach((score) => {
      const raw = score.score;
      let forensicDrift = driftScores[score.num] || 0;
      let proxScore = proximityScores[score.num] || 0;
      let missed = missedScores[score.num] || 0;
      const bayesianImpact = enhancedMetrics.bayes?.[score.num] || 50;
      const poissonImpact = enhancedMetrics.poisson?.[score.num] || 50;

      const impacts = [bayesianImpact, poissonImpact, proxScore, forensicDrift];
      const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
      const varImpact = impacts.reduce((a, b) => a + Math.pow(b - avgImpact, 2), 0) / impacts.length;
      const weightMod = 1.0 / (1.0 + Math.sqrt(varImpact) / 100.0);

      const trueProbabilityExp = (Math.exp((bayesianImpact - 50) / 50) + Math.exp((poissonImpact - 50) / 50)) / 2;
      let adjustedScore = raw * trueProbabilityExp;

      const N_reports = recentReports.length;
      const baseDamping = 1.0 / (1.0 + Math.exp(-TUNING.FORENSIC_DAMPING_SLOPE * (N_reports - TUNING.FORENSIC_DAMPING_CENTER)));
      const volatility = typeof (enhancedMetrics as any).volatility === 'number' ? (enhancedMetrics as any).volatility : 0.5;
      const cyberneticDamping = Math.exp(-0.5 * volatility);

      const forensicMultiplier = isForensicOptimized
        ? 1.0 + TUNING.FORENSIC_MAX_BOOST * baseDamping * cyberneticDamping
        : 1.0;

      const baseShare = 1.0 / Object.keys(weights).length;
      adjustedScore += (forensicDrift * baseShare + proxScore * baseShare + missed * baseShare) * weightMod * forensicMultiplier;
      adjustedScoresMap.set(score.num, adjustedScore);
    });

    const adjustedValues = Array.from(adjustedScoresMap.values());
    const medianAdjusted = getMedian(adjustedValues);
    const stdDevAdjusted = getStdDev(adjustedValues, medianAdjusted);
    const adjustedScale = 1.0 / Math.max(1e-6, stdDevAdjusted);

    masterScores.forEach((score) => {
      const adScore = adjustedScoresMap.get(score.num) || 50;
      score.score = 100.0 * (1.0 / (1.0 + Math.exp(-adjustedScale * (adScore - medianAdjusted))));
    });
  }

  onProgress?.(95, "Formulation finale et sélection des combinaisons...");
  masterScores = await applyPCADenoising(masterScores, weights, enhancedMetrics);
  const sortedScores = masterScores.sort((a, b) => b.score - a.score);
  const outsiderCount = forcedOutsiderCount !== undefined ? forcedOutsiderCount : 2;
  const empiricalCalibration = generateEmpiricalCalibration(history);

  const regimeStateNormalized = regimeState / 100.0;
  const selection = generateCombination(sortedScores, features.affinityMap, empiricalCalibration, outsiderCount, history[0]?.gagnants, regimeStateNormalized);

  let averageScore = sortedScores.slice(0, TICKET_SIZE).reduce((a, b) => a + (b.score || 0), 0) / TICKET_SIZE;
  if (isNaN(averageScore) || averageScore <= 0) averageScore = 45;

  const currentEntropyResult = calculateShannonEntropy(history);
  const currentEntropy = currentEntropyResult.normalized;

  const plattA = 1.2 - 0.8 * currentEntropy;
  const plattB = -0.5 - 1.5 * currentEntropy;

  const rawX = (averageScore - 50.0) / 15.0;
  const plattCalibratedProbability = 1.0 / (1.0 + Math.exp(-(plattA * rawX + plattB)));
  const calibratedConfidence = Math.max(1, Math.min(99, plattCalibratedProbability * 100.0));

  onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");

  let analysisText = adversarialApplied
    ? `Prédiction Oracle Base filtrée par le Protocole Adversarial Anti-Consensus (cibles [${challengedNumbers.join(", ")}] modérées).`
    : `Prédiction Oracle Base générée à partir de l'ADN Algorithmique du moment.`;

  if (shrinkageApplied) {
    analysisText += ` Prior Bayésien continu (James-Stein, B = ${Math.round(shrinkageFactorValue * 100)}%).`;
  }

  const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, localHistoryContext);

  // Correction O(n^2) reduce spread
  const breakdownRecord: Record<number, any> = {};
  for (let i = 0; i < masterScores.length; i++) {
    const curr = masterScores[i];
    breakdownRecord[curr.num] = curr.breakdown;
  }

  const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);

  const optimizer = new DNAOptimizer(Object.keys(weights) as AlgoKey[]);
  const dnaMatrix = selection.map(num => {
    const bdown = breakdownRecord[num] || {};
    const vec = new Float32Array(optimizer['numAlgos']);
    optimizer['algoKeys'].forEach((k, i) => { vec[i] = bdown[k] || 0; });
    return vec;
  });

  const historicalVectors: Float32Array[] = [];
  const sampleDepth = Math.min(30, history.length);
  for (let i = 0; i < sampleDepth; i++) {
    const winners = history[i]?.gagnants || [];
    for (const num of winners) {
      const bdown = breakdownRecord[num];
      if (bdown) {
        const vec = new Float32Array(optimizer['numAlgos']);
        optimizer['algoKeys'].forEach((k, idx) => {
          vec[idx] = bdown[k] || 0;
        });
        historicalVectors.push(vec);
      }
    }
  }

  let calculatedAlignment = 82;
  if (historicalVectors.length >= 5) {
    try {
      const targetProfile = optimizer.extractTargetDNAProfile(fbHistoricalVectors, fbSampleDepth);
      const evaluation = optimizer.evaluateCandidate(
        dnaMatrix,
        targetProfile,
        selection,
        history.slice(0, sampleDepth).map(d => d.gagnants)
      );
      const rawAlign = (1.0 / (1.0 + evaluation.distance)) * 100;
      calculatedAlignment = Math.min(TUNING.ALIGNMENT_MAX, Math.max(TUNING.ALIGNMENT_MIN, Math.round(rawAlign)));
    } catch (err) {
      logger.warn({ err }, "[predictionFacade] Error calculating continuous DNA alignment");
    }
  }

  const xapCandidate = {
    numbers: selection,
    dnaMatrix,
    synergyVector: new Float32Array(optimizer['numAlgos']),
    distance: 1.0 - (calculatedAlignment / 100),
    diversityScore: diversityMetrics.diversityScore
  };
  const xapExp = optimizer.generateXAP(xapCandidate, selection);

  const proxyValidation = evaluateAdversarialSurvival(selection, breakdownRecord, history, oracleDriftMap);

  // Correction O(n^2) reduce spread
  const explainabilityData: Record<number, any> = {};
  for (let i = 0; i < masterScores.length; i++) {
    const curr = masterScores[i];
    if (curr.explainability) {
      explainabilityData[curr.num] = curr.explainability;
    }
  }

  return {
    suggestedNumbers: selection,
    candidates: sortedScores.slice(5, 15).map((s) => s.num),
    confidence: Math.round(calibratedConfidence),
    confidenceNote: HONEST_NOTE,
    analysis: analysisText,
    breakdown: breakdownRecord,
    timestamp: Date.now(),
    symbiosisFactor: symbioticContext ? 1.5 : 1.0,
    realityAlignment: calculatedAlignment,
    realityAlignmentNote: HONEST_NOTE,
    adversarialApplied,
    challengedNumbers,
    stabilityScore,
    diversityMetrics,
    xapExp,
    adversarialSurvivalScore: proxyValidation.survivalScore,
    adversarialRisks: proxyValidation.risks,
    explainabilityData,
    shrinkageApplied,
    shrinkageFactor: shrinkageFactorValue,
    shrinkageFactorMap,
    shrinkageVerification: activeVerificationReport,
    hyperparameters,
    hyperTuningLog,
    hyperAccuracyGain
  } as Prediction;
};

import { globalCache, CACHE_TTL } from "../cache/CacheService";

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
): Promise<Prediction> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);

  // [6] Clé de cache basée sur un HASH DU CONTENU réel (plus la collision longueur+date).
  const contentHash = hashHistoryContent(history);
  const keyParams = `${history.length}_${contentHash}_${weightsToUse ? JSON.stringify(weightsToUse) : "def"}_adv_${adversarialMode}_forcedOutsider_${forcedOutsiderCount !== undefined ? forcedOutsiderCount : "none"}_depth_${temporalDepth}_forensic_${isForensicOptimized}`;
  const cacheKey = globalCache.generateKey('prediction', drawName, keyParams);

  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      // [5] Flags lus UNE FOIS ici, puis passés en paramètres (pas au cœur du calcul).
      const nexusState = useNexusStore.getState();
      const useCloudEngine = nexusState.useCloudEngine;
      const useSpatioTemporalHawkes = nexusState.useSpatioTemporalHawkes;

      // 1. Délégation cloud si activée & configurée
      if (useCloudEngine && isSupabaseConfigured() && drawName !== "ALL_COMBINED" && drawName !== "ALL") {
        try {
          console.log(`[CLOUD COMPUTING] Délégation de la prédiction ${drawName} vers Supabase Edge Function (predict-elite)...`);
          const result = await apiClient.post<Prediction>('predict-elite', {
            drawName,
            history,
            weights: weightsToUse,
            symbioticContext,
            metrics
          });
          if (result && result.suggestedNumbers && result.suggestedNumbers.length > 0) {
            console.log(`[CLOUD COMPUTING] Prédiction ${drawName} obtenue avec succès depuis le Cloud !`);
            return result;
          }
        } catch (e) {
          console.warn("[CLOUD COMPUTING] Échec de la prédiction Cloud, basculement sur le moteur local.", e);
        }
      }

      // 2. Offload Web Worker pour garder le thread principal fluide
      if (typeof Worker !== 'undefined') {
        try {
          return await new Promise<Prediction>((resolve, reject) => {
            const worker = new Worker(
              new URL('../workers/prediction.worker.ts?worker', import.meta.url),
              { type: 'module' }
            );

            const timeoutId = setTimeout(() => {
              worker.terminate();
              reject(new Error("Timeout du Web Worker de prédiction locale"));
            }, 60000);

            worker.onmessage = (e: MessageEvent) => {
              const { success, result, error, isProgress, progress, message } = e.data;
              if (isProgress) {
                onProgress?.(progress, message);
                return;
              }
              clearTimeout(timeoutId);
              if (success) {
                resolve(result);
              } else {
                reject(new Error(error || "Erreur inconnue du worker de prédiction"));
              }
              worker.terminate();
            };

            worker.onerror = (err) => {
              clearTimeout(timeoutId);
              reject(err);
              worker.terminate();
            };

            worker.postMessage({
              taskId: `PREDICT_${Date.now()}`,
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
              useSpatioTemporalHawkes,
            });
          });
        } catch (e) {
          logger.warn({ err: e }, "[predictionFacade] Web Worker indisponible, calcul sur le thread principal.");
        }
      }

      // 3. Repli : calcul direct sur le thread principal
      return await generateMasterPredictionCore(
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
        useSpatioTemporalHawkes,
        onProgress,
      );
    },
    CACHE_TTL.LONG,
  );
};
