import { DrawResult, AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { EnhancedMetrics } from "./metrics.types";
import { logger } from "../../utils/logger";
import { normalizeWeights } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { calculateScores } from "./scoringEngine";
import {
  calculatePoissonScores, calculateBayesianScore, calculateTemporalScores,
  calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores,
  calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance,
  calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores,
  calculateHawkesExcitation, calculateTopologicalLyapunov
} from "../advancedMathService";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";

// ============================================================================
// CONFIGURATION EXPLICITE (Zéro Nombre Magique)
// ============================================================================
export const TUNING = {
  DEFAULT_SGD_LEARNING_RATE: 0.015,
  DEFAULT_HAWKES_DECAY: 0.15,
  FORENSIC_DAMPING_CENTER: 2.5,
  FORENSIC_DAMPING_SLOPE: 1.5,
  FORENSIC_MAX_BOOST: 1.5,
  BACKPROP_LEARNING_RATE: 0.05,
  ALIGNMENT_MIN: 10,
  ALIGNMENT_MAX: 99,
} as const;

export const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const getStdDev = (arr: number[], mean: number): number => {
  if (arr.length === 0) return 1;
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length) || 1;
};

/**
 * Hash déterministe du contenu réel des tirages (FNV-1a 32 bits)
 * Évite les collisions "même longueur + même date"
 */
export const hashHistoryContent = (history: DrawResult[]): string => {
  let h = 0x811c9dc5;
  for (const d of history) {
    const s = `${d.date}|${(d.gagnants || []).join(",")}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16);
};

type AlgoBundle = EnhancedMetrics;

export const buildAlgoBundle = (
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
 * Micro-ajustement continu des poids par descente de gradient (SGD)
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

  // Guard 1: Ne l'exécuter que si history.length >= 25
  if (history.length < 25) {
    return adjustedWeights;
  }

  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  const baseEta = learningRateOverride !== undefined ? learningRateOverride : TUNING.DEFAULT_SGD_LEARNING_RATE;
  const safeEntropy = (typeof entropyValue === 'number' && !isNaN(entropyValue)) ? entropyValue : 0.5;
  const eta = baseEta * (1.0 - Math.pow(safeEntropy, 2.0));

  // Cache des bundles d'algos par hash de sous-historique
  const bundleCache = new Map<string, AlgoBundle>();
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
      // Bundle mémoïsé par hash du sous-historique
      const subHash = `${subHistory.length}_${hashHistoryContent(subHistory)}`;
      let subMetrics = bundleCache.get(subHash);
      if (!subMetrics) {
        subMetrics = buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
        bundleCache.set(subHash, subMetrics);
      }

      const subFeatures = await extractFeatures(drawName, subHistory);
      const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);

      // Normalisation Z-score
      const subScores = scoredNumbers.map(s => s.score);
      const subMedian = getMedian(subScores);
      const subStd = getStdDev(subScores, subMedian);

      const probs: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        const z = (s.score - subMedian) / (subStd + Number.EPSILON);
        probs[s.num] = 1.0 / (1.0 + Math.exp(-z));
      });

      // Gradient de Brier Score vs poids
      const gradients: Record<string, number> = {};
      const algoKeys = Object.keys(adjustedWeights);
      algoKeys.forEach(algo => { gradients[algo] = 0; });

      scoredNumbers.forEach(s => {
        const isWinner = gagnants.includes(s.num);
        const y_i = isWinner ? 1.0 : 0.0;
        const diff = probs[s.num] - y_i;
        const p_i = probs[s.num];
        const ds_factor = (2.0 / 90.0) * diff * p_i * (1.0 - p_i) / (subStd + Number.EPSILON);

        algoKeys.forEach(algo => {
          const C_ia = (s.breakdown?.[algo as AlgoKey] as number) || 0;
          gradients[algo] += ds_factor * C_ia;
        });
      });

      // Pas de gradient + projection sur le simplexe avec garde-fou de variation
      algoKeys.forEach(algo => {
        const oldWeight = adjustedWeights[algo as AlgoKey] || 0;
        let newWeight = Math.max(0, oldWeight - eta * gradients[algo]);
        
        const variationClamp = 0.05 + 0.20 * (1.0 - safeEntropy); 
        const minW = oldWeight * (1.0 - variationClamp);
        const maxW = oldWeight * (1.0 + variationClamp);
        newWeight = Math.max(minW, Math.min(maxW, newWeight));
        
        adjustedWeights[algo as AlgoKey] = newWeight;
      });
      adjustedWeights = normalizeWeights(adjustedWeights);

    } catch (e) {
      failedDraws++;
      logger.debug({ err: e, t }, "[microSgd] SGD: échec sur un tirage");
    }
  }

  const dynamicFailureTolerance = 0.15 + 0.20 * safeEntropy;
  if (attempted > 0 && failedDraws / attempted > dynamicFailureTolerance) {
    logger.warn(
      { failedDraws, attempted, rate: failedDraws / attempted, threshold: dynamicFailureTolerance },
      "[microSgd] SGD: Taux d'échec supérieur au seuil dynamique de sécurité. Annulation de l'ajustement."
    );
    return weights;
  }

  return adjustedWeights;
};
