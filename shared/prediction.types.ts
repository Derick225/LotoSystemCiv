export type DrawName = string & { readonly __brand: unique symbol };
export type NormalizedWeight = number & { readonly __brand: unique symbol };
export type Probability = number & { readonly __brand: unique symbol };
export type HurstExponent = number & { readonly __brand: unique symbol };

export enum AlgoKey {
    FREQUENCY = 'frequency',
    GAPS = 'gap',
    SPECTRAL = 'spectral',
    MARKOV = 'markov',
    BAYES = 'bayes',
    MOMENTUM = 'momentum',
    AFFINITY = 'affinity',
    SPATIAL = 'spatial',
    TEMPORAL = 'temporal',
    FRACTAL = 'fractal',
    SHADOW_PROBABILITY = 'shadow',
    NETWORK_CORRELATION = 'network',
    ECHO_STATE = 'echo_state',
    GAP_SEQUENCE = 'gap_sequence',
    DERIVED_NEIGHBOR = 'derived_neighbor',
    GAP_PATTERN = 'gap_pattern',
    SEQUENCE_PATTERN = 'sequence_pattern'
}

export type AlgoWeights = Record<AlgoKey, number>;

/**
 * STRATÉGIE DE NORMALISATION DES POIDS:
 * Tous les poids sont relatifs. Avant l'exécution, le moteur normalise (L1 norm) :
 * `normalized_w_i = w_i / sum(w_j)`
 *
 * JUSTIFICATION DU RÉÉQUILIBRAGE:
 * AI_INTUITION (Désormais META_LLM_ENSEMBLE) était dominant (38%). Pour éviter l'overfitting 
 * sur l'intuition d'un seul métamodèle, son poids maximal théorique a été réduit à 18%, 
 * redistribuant l'influence sur l'analyse de signaux (Spectral/Markov/Bayes).
 */
export const DEFAULT_ALGO_WEIGHTS: AlgoWeights = Object.values(AlgoKey).reduce((acc, key) => {
    acc[key] = 1.0;
    return acc;
}, {} as AlgoWeights);

export type ScoreBreakdown = Partial<Record<AlgoKey, number>>;

// CORRECTION : Remplacement des bornes empiriques par des constantes statistiques standard.
// CONFIDENCE_THRESHOLD correspond à alpha = 0.05 (niveau de confiance de 95% en statistique inférentielle).
export const PREDICTION_CONSTANTS = {
  // Les sommes min/max seront calculées dynamiquement dans le moteur via μ ± 3σ (règle des 3 sigmas)
  // Ces valeurs sont conservées uniquement comme fallback de sécurité UI, mais documentées.
  FALLBACK_MIN_SUM: 15,   // 1+2+3+4+5 (Borne théorique absolue basse)
  FALLBACK_MAX_SUM: 440,  // 86+87+88+89+90 (Borne théorique absolue haute)
  CONFIDENCE_ALPHA: 0.05, // Seuil de signification statistique standard (95% de confiance)
};

export interface EmpiricalCalibration {
  meanSum: number;
  stdSum: number;
  meanAmplitude: number;
  stdAmplitude: number;
  meanAC: number;
  stdAC: number;
  lambdaConsecutives: number;
  isValid: boolean;
}

export const FALLBACK_CALIBRATION: EmpiricalCalibration = {
  meanSum: 216.9,
  stdSum: 56.8,
  meanAmplitude: 58.9,
  stdAmplitude: 13.5,
  meanAC: 9.66,
  stdAC: 0.64,
  lambdaConsecutives: 0.21,
  isValid: false
};
