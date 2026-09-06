import { DrawResult, AlgoWeights } from "../../types";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../../shared/prediction.types";
import { EnhancedMetrics } from "./metrics.types";
import { logger } from "../../utils/logger";
import { normalizeWeights, evaluateAlgoEmpiricalProof } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { calculateScores } from "./scoringEngine";
import { computeAdvancedMetrics } from "./advancedMetricsCalculator";
import {
  computeRobbinsMonroLearningRate,
  applyJamesSteinShrinkage,
  computeMetaMomentumBeta
} from "./onlineMetaCalibrationService";

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

export const buildAlgoBundle = async (
  subHistory: DrawResult[],
  drawName: string,
  useSpatioTemporalHawkes: boolean,
): Promise<AlgoBundle> => {
  return await computeAdvancedMetrics(subHistory, drawName, {}, useSpatioTemporalHawkes);
};

/**
 * Micro-ajustement continu des poids par descente de gradient (SGD)
 * avec méta-apprentissage de Robbins-Monro, momentum de Hurst et rétrécissement de James-Stein.
 */
export const applyDeterministicMicroSgd = async (
  drawName: string,
  weights: AlgoWeights,
  history: DrawResult[],
  entropyValue: number,
  learningRateOverride: number | undefined,
  useSpatioTemporalHawkes: boolean,
  hurstExponent?: number
): Promise<AlgoWeights> => {
  let adjustedWeights = { ...weights };

  // Guard 1: Ne l'exécuter que si history.length >= 25
  if (history.length < 25) {
    return adjustedWeights;
  }

  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  // Évaluation des preuves empiriques propres au tirage actif
  const proofMap = evaluateAlgoEmpiricalProof(drawName, history);

  const numAlgos = Object.keys(adjustedWeights).length || 1;
  const safeEntropy = (typeof entropyValue === 'number' && !isNaN(entropyValue)) ? entropyValue : 0.5;

  // Taux d'apprentissage continu dérivé du théorème de Robbins-Monro et Shannon/Hurst
  const eta = learningRateOverride !== undefined
    ? learningRateOverride * (1.0 - Math.pow(safeEntropy, 2.0))
    : computeRobbinsMonroLearningRate(history.length, numAlgos, safeEntropy, hurstExponent);

  // Momentum adaptatif dérivé de l'exposant de mémoire de Hurst
  const momentumBeta = computeMetaMomentumBeta(hurstExponent);
  const momentum: Record<string, number> = {};
  const algoKeysList = Object.keys(adjustedWeights);
  algoKeysList.forEach(k => { momentum[k] = 0.0; });
  const allGrads: number[][] = [];

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
        subMetrics = await buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
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

      // Gradient de Brier Score vs poids avec régularisation Elastic-Net adaptative C^infinity
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

      allGrads.push(algoKeys.map(k => gradients[k] || 0));

      // Elastic-Net régularisation continue : alpha * L1 + (1 - alpha) * L2
      // alpha augmente continûment avec l'entropie pour forcer la parcimonie en régime de bruit
      const elasticAlpha = 1.0 / (1.0 + Math.exp(-6.0 * (safeEntropy - 0.6)));
      const lambdaReg = 0.001 * (1.0 - safeEntropy * 0.5);

      // Pas de gradient avec momentum Polyak + projection sur le simplexe avec garde-fou de preuve empirique
      algoKeys.forEach(algo => {
        const key = algo as AlgoKey;
        const oldWeight = adjustedWeights[key] || 0;
        if (oldWeight <= 0.0001) {
          adjustedWeights[key] = 0.0;
          return;
        }
        const proof = proofMap[key];
        const hasProof = proof && proof.hasProof && proof.proofScore > 0;
        
        // Termes de pénalité Elastic-Net différentiables
        const l1Grad = Math.sign(oldWeight) * elasticAlpha;
        const l2Grad = 2.0 * oldWeight * (1.0 - elasticAlpha);
        const totalGrad = gradients[algo] + lambdaReg * (l1Grad + l2Grad);
        
        // Accumulation du momentum Nesterov/Polyak
        momentum[algo] = momentumBeta * (momentum[algo] || 0) + (1.0 - momentumBeta) * totalGrad;

        let newWeight = Math.max(0, oldWeight - eta * momentum[algo]);
        
        // Variation clamp dérivé de la théorie de l'information
        const variationBase = 1.0 / (2.0 * numAlgos);
        const variationMax = 1.0 / Math.sqrt(numAlgos);
        const variationClamp = variationBase + (variationMax - variationBase) * safeEntropy;
        const minW = oldWeight * (1.0 - variationClamp);
        const maxW = oldWeight * (1.0 + variationClamp);
        newWeight = Math.max(minW, Math.min(maxW, newWeight));

        // RÈGLE ABSOLUE : Qu'aucun algorithme ne voie son poids augmenté s'il ne fait pas ses preuves
        if (!hasProof) {
          newWeight = Math.min(oldWeight, newWeight);
          if (proof && proof.proofScore < 0) {
            const dampener = 1.0 / (1.0 + Math.exp(-2.0 * proof.proofScore));
            newWeight = newWeight * Math.max(0.1, dampener);
          }
        } else {
          if (newWeight > oldWeight) {
            const boostFactor = Math.tanh(proof.proofScore);
            newWeight = oldWeight + (newWeight - oldWeight) * boostFactor;
          }
        }
        
        adjustedWeights[key] = newWeight;
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

  // Rétrécissement de James-Stein empirique bayésien
  // Unifie l'estimateur walk-forward propre au tirage avec les priors robustes selon la taille d'échantillon N
  let gradVariance = 0.001;
  if (allGrads.length > 0) {
    let totalVar = 0;
    let varCount = 0;
    for (let a = 0; a < algoKeysList.length; a++) {
      const gSeries = allGrads.map(g => g[a] || 0);
      const gMean = gSeries.reduce((s, v) => s + v, 0) / gSeries.length;
      const gVar = gSeries.reduce((s, v) => s + Math.pow(v - gMean, 2), 0) / Math.max(1, gSeries.length - 1);
      totalVar += gVar;
      varCount++;
    }
    gradVariance = varCount > 0 ? (totalVar / varCount) : 0.001;
  }

  const jsResult = applyJamesSteinShrinkage(
    adjustedWeights,
    DEFAULT_ALGO_WEIGHTS,
    history.length,
    gradVariance
  );
  adjustedWeights = jsResult.shrunkWeights;

  logger.info(
    {
      drawName,
      historyLength: history.length,
      robbinsMonroEta: parseFloat(eta.toFixed(5)),
      momentumBeta: parseFloat(momentumBeta.toFixed(3)),
      jamesSteinShrinkage: parseFloat(jsResult.shrinkageFactor.toFixed(4)),
      distanceToPrior: parseFloat(jsResult.distanceToPrior.toFixed(4))
    },
    "[microSgd] Walk-forward micro-calibration achevée avec rétrécissement de James-Stein."
  );

  return adjustedWeights;
};
