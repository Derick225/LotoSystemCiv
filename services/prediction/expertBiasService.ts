import {
  AlgoKey,
  AlgoWeights,
  DEFAULT_ALGO_WEIGHTS,
  RETIRED_ALGO_WEIGHT_KEYS,
} from '../../shared/prediction.types';
import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { normalizeWeights, evaluateAlgoEmpiricalProof } from './weightsManager';
import { LABELS_MAP, ALGO_CATEGORIES } from '../../hooks/useAlgorithmSync';

export const getAlgoCategoryName = (algoKey: AlgoKey): string => {
  const cat = ALGO_CATEGORIES.find((c) => c.keys.includes(algoKey));
  return cat ? cat.name : 'Inférence';
};

export interface ExpertBiasConfig {
  algoKey: AlgoKey;
  biasDelta: number; // Modificateur relatif log-échelle [-0.5, +0.5]
  biasMultiplier: number; // Facteur multiplicatif [0.2, 3.0]
  decayHorizon: number; // Durée de validité en nombre de tirages (ex: 1, 3, 5, 10)
  appliedAtDrawIndex: number; // Index de l'historique isolé du tirage lors de l'application
  appliedAtTimestamp: number;
  isActive: boolean;
  expertRationale?: string;
}

export interface AlgoUnderperformanceMetric {
  algoKey: AlgoKey;
  label: string;
  category: string;
  activeWeight: number;
  recentHitRate: number;
  baselineRate: number;
  proofScore: number;
  hasEmpiricalProof: boolean;
  isUnderperforming: boolean;
  suggestedExpertNudge: number;
  statusLabel: string;
}

const STORAGE_PREFIX = 'nexus_expert_bias_v2_';
const BASE_WEIGHTS_STORAGE_PREFIX = 'nexus_expert_base_weights_v2_';

const normalizeDrawStorageSuffix = (drawName: string): string =>
  (drawName || 'default').trim().toLowerCase().replace(/\s+/g, '_');

/**
 * Charge les configurations de biais d'expert pour un tirage isolé.
 */
export const loadExpertBiases = (drawName: string): Record<AlgoKey, ExpertBiasConfig> => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {} as Record<AlgoKey, ExpertBiasConfig>;
  }

  try {
    const key = `${STORAGE_PREFIX}${normalizeDrawStorageSuffix(drawName)}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return {} as Record<AlgoKey, ExpertBiasConfig>;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de chargement pour ${drawName}:`, err);
    return {} as Record<AlgoKey, ExpertBiasConfig>;
  }
};

/**
 * Sauvegarde les configurations de biais d'expert pour un tirage isolé.
 */
export const saveExpertBiases = (
  drawName: string,
  biases: Record<AlgoKey, ExpertBiasConfig>
): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const key = `${STORAGE_PREFIX}${normalizeDrawStorageSuffix(drawName)}`;
    window.localStorage.setItem(key, JSON.stringify(biases));
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de sauvegarde pour ${drawName}:`, err);
  }
};

/**
 * Charge les poids de référence non-biaisés d'un tirage isolé afin d'éviter
 * toute composition cumulative des biais et permettre une restauration exacte.
 */
export const loadExpertBaseWeights = (drawName: string): AlgoWeights | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const key = `${BASE_WEIGHTS_STORAGE_PREFIX}${normalizeDrawStorageSuffix(drawName)}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalizeWeights(parsed as AlgoWeights) : null;
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de chargement des poids de base pour ${drawName}:`, err);
    return null;
  }
};

/**
 * Sauvegarde les poids de référence non-biaisés avant application d'un biais expert.
 */
export const saveExpertBaseWeights = (
  drawName: string,
  baseWeights: AlgoWeights
): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const key = `${BASE_WEIGHTS_STORAGE_PREFIX}${normalizeDrawStorageSuffix(drawName)}`;
    window.localStorage.setItem(key, JSON.stringify(normalizeWeights(baseWeights)));
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de sauvegarde des poids de base pour ${drawName}:`, err);
  }
};

/**
 * Efface l'instantané des poids de base lors d'une réinitialisation complète.
 */
export const clearExpertBaseWeights = (drawName: string): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const key = `${BASE_WEIGHTS_STORAGE_PREFIX}${normalizeDrawStorageSuffix(drawName)}`;
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de suppression des poids de base pour ${drawName}:`, err);
  }
};

/**
 * Calcule l'amortissement continu du biais d'expert basé sur l'horizon temporel.
 * Utilise une décroissance exponentielle : decay(k) = exp(-k / horizon)
 */
export const calculateExpertBiasDecay = (
  bias: ExpertBiasConfig,
  currentHistoryLength: number
): number => {
  if (!bias || !bias.isActive || bias.decayHorizon <= 0) return 0.0;

  const elapsed = Math.max(0, currentHistoryLength - bias.appliedAtDrawIndex);
  if (elapsed >= bias.decayHorizon) return 0.0;

  // Décroissance exponentielle continue sans rupture
  const decayFactor = Math.exp(-elapsed / Math.max(1, bias.decayHorizon));
  return Math.max(0.0, Math.min(1.0, decayFactor));
};

/**
 * Applique les biais d'experts aux poids de prédiction en respectant
 * l'échelle relative des poids, la préservation des poids nuls/retirés
 * et un plancher continu supérieur au seuil d'extinction de normalizeWeights.
 */
export const applyExpertBiasesToWeights = (
  baseWeights: AlgoWeights,
  biases: Record<AlgoKey, ExpertBiasConfig>,
  currentHistoryLength: number
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);
  const modulated: Partial<Record<AlgoKey, number>> = {};

  const activeKeysCount = validKeys.filter(
    (k) => !RETIRED_ALGO_WEIGHT_KEYS.has(k) && (Number.isFinite(baseWeights[k]) ? baseWeights[k] : 0) > 0
  ).length;
  const meanActiveWeight = 1.0 / Math.max(1, activeKeysCount);

  validKeys.forEach((key) => {
    if (RETIRED_ALGO_WEIGHT_KEYS.has(key)) {
      modulated[key] = 0;
      return;
    }

    const w0 = Number.isFinite(baseWeights[key]) ? Math.max(0, baseWeights[key]) : 0;
    const bias = biases?.[key];

    if (!bias || !bias.isActive) {
      modulated[key] = w0;
      return;
    }

    const decay = calculateExpertBiasDecay(bias, currentHistoryLength);
    if (decay <= 0.001) {
      modulated[key] = w0;
      return;
    }

    const clampedMult = Math.max(0.2, Math.min(3.0, Number.isFinite(bias.biasMultiplier) ? bias.biasMultiplier : 1.0));
    const clampedDelta = Math.max(-0.5, Math.min(0.5, Number.isFinite(bias.biasDelta) ? bias.biasDelta : 0));

    // Modulation continue multiplico-exponentielle à l'échelle du poids de référence :
    // - `multFactor` interpole continûment entre 1.0 et `biasMultiplier` selon `decay`
    // - `deltaFactor = exp(2 * delta * decay)` agit en proportion du poids (ex: +0.15 -> x1.35, -0.20 -> x0.67)
    //   sans jamais écraser l'échelle ~0.04 ni provoquer une mise à zéro brutale dans normalizeWeights (seuil 0.0002).
    const multFactor = 1.0 + (clampedMult - 1.0) * decay;
    const deltaFactor = Math.exp(2.0 * clampedDelta * decay);

    if (w0 <= 0) {
      modulated[key] =
        clampedDelta > 0
          ? Math.max(0.0005, meanActiveWeight * (clampedDelta * decay) * multFactor)
          : 0;
      return;
    }

    const effectiveVal = Math.max(0.0005, w0 * multFactor * deltaFactor);
    modulated[key] = effectiveVal;
  });

  return normalizeWeights(modulated as AlgoWeights);
};

/**
 * Résout dynamiquement les poids effectifs d'un tirage dans le pipeline de prédiction
 * en appliquant la décroissance temporelle des biais experts actifs sur les poids de base non-biaisés.
 */
export const resolveWeightsWithExpertBiasDecay = (
  drawName: string | undefined,
  currentWeights: AlgoWeights,
  isolatedHistoryLength: number
): AlgoWeights => {
  if (!drawName) return currentWeights;
  const biases = loadExpertBiases(drawName);
  const biasEntries = Object.values(biases || {}).filter(
    (b) => b && b.isActive && (b.biasMultiplier !== 1.0 || b.biasDelta !== 0)
  );
  if (biasEntries.length === 0) {
    return currentWeights;
  }

  const baseWeights = loadExpertBaseWeights(drawName) ?? currentWeights;
  return applyExpertBiasesToWeights(baseWeights, biases, isolatedHistoryLength);
};

/**
 * Évalue les sous-algorithmes sous-performants récents afin de guider l'expert
 * dans ses ajustements manuels ciblés en cohérence stricte avec la règle de preuve empirique.
 */
export const analyzeUnderperformingSubAlgos = (
  drawName: string,
  history: DrawResult[],
  activeWeights: AlgoWeights
): AlgoUnderperformanceMetric[] => {
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);
  const proofMap = evaluateAlgoEmpiricalProof(drawName, pureHistory);
  const validKeys = Object.values(AlgoKey).filter((k) => !RETIRED_ALGO_WEIGHT_KEYS.has(k));
  const results: AlgoUnderperformanceMetric[] = [];

  validKeys.forEach((algoKey) => {
    const label = LABELS_MAP[algoKey] || algoKey;
    const category = getAlgoCategoryName(algoKey);
    const activeWeight = Number.isFinite(activeWeights[algoKey])
      ? activeWeights[algoKey]
      : DEFAULT_ALGO_WEIGHTS[algoKey] ?? 0;
    const proof = proofMap[algoKey];

    const proofScore = Number.isFinite(proof?.proofScore) ? proof.proofScore : 0;
    const recentHitRate = Number.isFinite(proof?.empiricalHitRate) ? proof.empiricalHitRate : 0;
    const baselineRate = Number.isFinite(proof?.baselineRate) ? proof.baselineRate : 5.0 / 90.0;
    const hasEmpiricalProof = Boolean(proof?.hasProof && proofScore > 0);

    // Un algo est considéré sous-performant s'il a un hit-rate inférieur à la baseline
    // ou si son Z-score est négatif, tout en ayant un poids actif significatif.
    const isUnderperforming =
      (recentHitRate < baselineRate || proofScore < 0) && activeWeight > 0.01;

    // Suggestion d'ajustement expert strictement alignée avec la règle de preuve :
    // - Positive uniquement si preuve empirique confirmée (proofScore > 0)
    // - Négative (amortissement) si sous-performance ou dérive stochastique (proofScore < 0)
    let suggestedExpertNudge = 0;
    let statusLabel = 'Régime Nominal';

    if (hasEmpiricalProof && proofScore > 1.5) {
      statusLabel = 'Sur-Performance Confirmée';
      suggestedExpertNudge = 0.15;
    } else if (hasEmpiricalProof && proofScore > 0.5) {
      statusLabel = 'Preuve Positive';
      suggestedExpertNudge = 0.08;
    } else if (proofScore < -1.0) {
      statusLabel = 'Forte Dérive Stochastique';
      suggestedExpertNudge = -0.20;
    } else if (isUnderperforming) {
      statusLabel = 'Sous-Performance Récente';
      suggestedExpertNudge = -0.10;
    }

    results.push({
      algoKey,
      label,
      category,
      activeWeight,
      recentHitRate,
      baselineRate,
      proofScore,
      hasEmpiricalProof,
      isUnderperforming,
      suggestedExpertNudge,
      statusLabel,
    });
  });

  return results.sort((a, b) => a.proofScore - b.proofScore);
};
