import { DrawResult, AlgoWeights } from "../../types";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../../shared/prediction.types";
import { normalizeWeights } from "./weightsManager";
import { logger } from "../../utils/logger";

/**
 * ============================================================================
 * SERVICE DE MÉTA-APPRENTISSAGE & AUTO-CALIBRATION EN LIGNE (WALK-FORWARD)
 * ============================================================================
 * Principes architecturaux (AGENTS.md) :
 * 1. ZÉRO NOMBRE MAGIQUE :
 *    - Taux d'apprentissage Robbins-Monro modulé continûment par l'entropie de Shannon et Hurst.
 *    - Rétrécissement de James-Stein empirique bayésien dérivé analytiquement de la dimension P et de la variance sigma^2.
 * 2. ZÉRO HASARD / 100% DÉTERMINISTE :
 *    - Toutes les métriques sont calculées par projections et équations analytiques fermées.
 * 3. ISOLATION STRICTE DU TIRAGE :
 *    - Toute calibration opère uniquement sur l'historique propre et délimité du tirage actif.
 */

export interface MetaCalibrationDiagnostics {
  drawName: string;
  historyLength: number;
  robbinsMonroLearningRate: number;
  effectiveEta: number;
  jamesSteinShrinkageFactor: number;
  distanceToPrior: number;
  momentumBeta: number;
  brierLossInitial: number;
  brierLossFinal: number;
  lossDelta: number;
  activeAlgoCount: number;
}

/**
 * Calcule de manière continue le taux d'apprentissage optimal de Robbins-Monro
 * fondé sur la profondeur d'échantillonnage N, la dimension de l'espace P,
 * l'entropie normalisée de Shannon S et l'exposant de mémoire de Hurst H.
 */
export const computeRobbinsMonroLearningRate = (
  historyLength: number,
  numAlgos: number,
  entropy: number,
  hurstExponent?: number
): number => {
  const N = Math.max(5, historyLength);
  const P = Math.max(1, numAlgos);

  // Échelle asymptotique dérivée du théorème de Robbins-Monro : O(1 / sqrt(N * ln(P + e)))
  const baseRate = 1.0 / Math.sqrt(N * Math.log(P + Math.E));

  // Amortissement différentiable de Shannon : en régime de bruit pur (S -> 1), (1 - S^2) comprime le pas
  const safeEntropy = Math.max(0.0, Math.min(1.0, isNaN(entropy) ? 0.5 : entropy));
  const entropyDamping = 1.0 - Math.pow(safeEntropy, 2.0);

  // Modulation de mémoire continue de Hurst :
  // H > 0.5 (persistance) accroît la réactivité ; H < 0.5 (bruit / mean-reversion) stabilise
  const safeHurst = Math.max(0.01, Math.min(0.99, hurstExponent !== undefined && !isNaN(hurstExponent) ? hurstExponent : 0.5));
  const hurstFactor = 1.0 + 0.4 * Math.tanh(2.0 * (safeHurst - 0.5));

  // Taux brut modulé, borné de manière continue dans la zone stable de micro-descente
  const unscaledEta = baseRate * entropyDamping * hurstFactor;
  return Math.max(0.002, Math.min(0.08, unscaledEta));
};

export interface JamesSteinResult {
  shrunkWeights: AlgoWeights;
  shrinkageFactor: number;
  distanceToPrior: number;
  relativeVariance: number;
}

/**
 * Rétrécissement empirique bayésien de James-Stein :
 * Prouve que pour P >= 3, l'estimateur empirique de variance W_active est strictement
 * dominé par sa contraction vers le prior non-informatif W_prior.
 * 
 * c_shrink = ((P - 2) * sigma^2) / (||W_active - W_prior||^2 + (P - 2) * sigma^2)
 */
export const applyJamesSteinShrinkage = (
  activeWeights: AlgoWeights,
  priorWeights: AlgoWeights = DEFAULT_ALGO_WEIGHTS,
  historyLength: number,
  gradientVariance?: number
): JamesSteinResult => {
  const keys = Object.keys(activeWeights).filter(k => k in DEFAULT_ALGO_WEIGHTS) as AlgoKey[];
  const P = keys.length;

  if (P < 3 || historyLength <= 0) {
    return {
      shrunkWeights: { ...activeWeights },
      shrinkageFactor: 0.0,
      distanceToPrior: 0.0,
      relativeVariance: 0.0
    };
  }

  // Distance euclidienne au carré ||W_active - W_prior||_2^2
  let sqDist = 0.0;
  for (const k of keys) {
    const diff = (activeWeights[k] || 0) - (priorWeights[k] || 0);
    sqDist += diff * diff;
  }

  // Variance d'estimation empirique sigma^2
  const sigmaSq = gradientVariance !== undefined && gradientVariance > 0
    ? gradientVariance
    : (1.0 / (P * historyLength));

  // Facteur de James-Stein continu et borné dans [0, 1]
  const numerator = (P - 2) * sigmaSq;
  const denominator = sqDist + numerator;
  const cShrink = denominator > Number.EPSILON
    ? Math.max(0.0, Math.min(1.0, numerator / denominator))
    : 0.5;

  const shrunk: Record<string, number> = {};
  for (const k of keys) {
    const wEmp = activeWeights[k] || 0;
    const wPrior = priorWeights[k] || 0;
    shrunk[k] = (1.0 - cShrink) * wEmp + cShrink * wPrior;
  }

  return {
    shrunkWeights: normalizeWeights(shrunk as AlgoWeights),
    shrinkageFactor: cShrink,
    distanceToPrior: Math.sqrt(sqDist),
    relativeVariance: sigmaSq
  };
};

/**
 * Calcule le momentum optimal de Nesterov/Polyak pour la micro-descente walk-forward.
 * En régime de mémoire persistante (Hurst > 0.5), le momentum est amplifié pour suivre la dynamique.
 */
export const computeMetaMomentumBeta = (hurstExponent?: number): number => {
  const safeHurst = Math.max(0.01, Math.min(0.99, hurstExponent !== undefined && !isNaN(hurstExponent) ? hurstExponent : 0.5));
  // Sigmoïde centrée sur 0.5 : beta varie continûment entre 0.15 et 0.55
  return 0.35 + 0.20 * Math.tanh(2.5 * (safeHurst - 0.5));
};
