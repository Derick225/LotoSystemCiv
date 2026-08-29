import { AlgoKey, AlgoWeights, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';
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
  biasDelta: number; // Modificateur manuel [-0.5, +0.5] ou multiplicateur
  biasMultiplier: number; // Facteur multiplicatif [0.2, 3.0]
  decayHorizon: number; // Durée de validité en nombre de tirages (ex: 1, 3, 5, 10)
  appliedAtDrawIndex: number; // Index de l'historique lors de l'application
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

/**
 * Charge les configurations de biais d'expert pour un tirage isolé.
 */
export const loadExpertBiases = (drawName: string): Record<AlgoKey, ExpertBiasConfig> => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {} as Record<AlgoKey, ExpertBiasConfig>;
  }

  try {
    const key = `${STORAGE_PREFIX}${drawName.toLowerCase().replace(/\s+/g, '_')}`;
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
    const key = `${STORAGE_PREFIX}${drawName.toLowerCase().replace(/\s+/g, '_')}`;
    window.localStorage.setItem(key, JSON.stringify(biases));
  } catch (err) {
    console.warn(`[ExpertBiasService] Erreur de sauvegarde pour ${drawName}:`, err);
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
  if (!bias.isActive || bias.decayHorizon <= 0) return 0.0;
  
  const elapsed = Math.max(0, currentHistoryLength - bias.appliedAtDrawIndex);
  if (elapsed >= bias.decayHorizon) return 0.0;

  // Décroissance exponentielle continue sans rupture
  const decayFactor = Math.exp(-elapsed / Math.max(1, bias.decayHorizon));
  return Math.max(0.0, Math.min(1.0, decayFactor));
};

/**
 * Applique les biais d'experts aux poids de prédiction en respectant
 * la normalisation L1 et la continuité différentiable.
 */
export const applyExpertBiasesToWeights = (
  baseWeights: AlgoWeights,
  biases: Record<AlgoKey, ExpertBiasConfig>,
  currentHistoryLength: number
): AlgoWeights => {
  const validKeys = Object.values(AlgoKey);
  const modulated: Partial<Record<AlgoKey, number>> = {};

  validKeys.forEach((key) => {
    const w0 = baseWeights[key] || 0;
    const bias = biases[key];

    if (!bias || !bias.isActive) {
      modulated[key] = w0;
      return;
    }

    const decay = calculateExpertBiasDecay(bias, currentHistoryLength);
    if (decay <= 0.001) {
      modulated[key] = w0;
      return;
    }

    // Modulation continue : combinaison de multiplicateur et de delta lissé par sigmoïde
    const multFactor = 1.0 + (bias.biasMultiplier - 1.0) * decay;
    const delta = bias.biasDelta * decay;
    
    // Application souple du delta logistique
    const effectiveVal = Math.max(0.0001, (w0 * multFactor) + delta);
    modulated[key] = effectiveVal;
  });

  return normalizeWeights(modulated as AlgoWeights);
};

/**
 * Évalue les sous-algorithmes sous-performants récents afin de guider l'expert
 * dans ses ajustements manuels ciblés.
 */
export const analyzeUnderperformingSubAlgos = (
  drawName: string,
  history: DrawResult[],
  activeWeights: AlgoWeights
): AlgoUnderperformanceMetric[] => {
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);
  const proofMap = evaluateAlgoEmpiricalProof(drawName, pureHistory);
  const validKeys = Object.values(AlgoKey);
  const results: AlgoUnderperformanceMetric[] = [];

  validKeys.forEach((algoKey) => {
    const label = LABELS_MAP[algoKey] || algoKey;
    const category = getAlgoCategoryName(algoKey);
    const activeWeight = activeWeights[algoKey] || 0;
    const proof = proofMap[algoKey];

    const proofScore = proof?.proofScore || 0;
    const recentHitRate = proof?.empiricalHitRate || 0;
    const baselineRate = proof?.baselineRate || 0.0556;
    const hasEmpiricalProof = Boolean(proof?.hasProof && proofScore > 0);

    // Un algo est considéré sous-performant s'il a un hit-rate inférieur à la baseline
    // ou si son Z-score est négatif, tout en ayant un poids actif non nul.
    const isUnderperforming = (recentHitRate < baselineRate || proofScore < 0) && activeWeight > 0.01;

    // Suggestion d'ajustement expert basée sur la distance à la moyenne
    let suggestedExpertNudge = 0;
    let statusLabel = "Régime Nominal";

    if (proofScore > 1.5) {
      statusLabel = "Sur-Performance Confirmée";
      suggestedExpertNudge = 0.15;
    } else if (proofScore < -1.0) {
      statusLabel = "Forte Dérive Stochastique";
      suggestedExpertNudge = -0.20;
    } else if (isUnderperforming) {
      statusLabel = "Sous-Performance Récente";
      suggestedExpertNudge = 0.10; // Suggestion de coup de pouce exploratoire si l'expert observe un cycle favorable
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
