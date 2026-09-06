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
    SEQUENCE_PATTERN = 'sequence_pattern',
    GAP_CADENCE = 'gap_cadence',
    GAP_TREND = 'gap_trend',
    INTER_MONTHLY_RESONANCE = 'inter_monthly_resonance',
    ISOLATION_ANOMALY = 'isolation_anomaly',
    GAP_BAND_SEQUENCE = 'gap_band_sequence',
    MACHINE_TRANSFER = 'machine_transfer',
    JACCARD = 'jaccard'
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
export const DEFAULT_ALGO_WEIGHTS: AlgoWeights = {
    [AlgoKey.SHADOW_PROBABILITY]: 1.50,       // Lift@5 +10.5% (Preuve empirique #1 Hit@5)
    [AlgoKey.NETWORK_CORRELATION]: 1.40,     // Lift@5 +7.6% (Topologie de réseau)
    [AlgoKey.SEQUENCE_PATTERN]: 1.35,        // Lift@5 +6.2% (Transitions différentielles)
    [AlgoKey.GAP_PATTERN]: 1.35,             // FLAGSHIP UNIFIÉ GAP DYNAMICS (Lift@10 +2.5%, Lift@5 +2.5%)
    [AlgoKey.MARKOV]: 1.30,                  // Lift@10 +5.1% (Chaînes de Markov)
    [AlgoKey.TEMPORAL]: 1.25,                // Lift@10 +3.3% (Déclin temporel continu)
    [AlgoKey.INTER_MONTHLY_RESONANCE]: 1.25, // Lift@10 +3.3% (Résonance mensuelle)
    [AlgoKey.SPATIAL]: 1.15,                 // Lift@5 +4.7% (Proximité spatiale)
    [AlgoKey.DERIVED_NEIGHBOR]: 1.10,        // Lift@5 +1.1% (Voisins modulaires)
    [AlgoKey.ECHO_STATE]: 1.10,              // Lift@10 +0.7% (Réservoir stochastique)
    [AlgoKey.MOMENTUM]: 1.05,                // Harmonisé StateDynamicsEngine (Ordre 1 Vélocité)
    [AlgoKey.FREQUENCY]: 1.00,               // Harmonisé StateDynamicsEngine (Ordre 0 Position)
    [AlgoKey.MACHINE_TRANSFER]: 1.00,        // Actif uniquement si flux machine présent (isolé)
    [AlgoKey.BAYES]: 0.95,                   // Harmonisé StateDynamicsEngine (Ordre 2 Prior Conjugué)
    [AlgoKey.JACCARD]: 0.85,
    [AlgoKey.SPECTRAL]: 0.85,
    [AlgoKey.FRACTAL]: 0.85,
    [AlgoKey.ISOLATION_ANOMALY]: 0.80,
    [AlgoKey.GAP_TREND]: 0.40,               // Consolidé satellite sous GapDynamicsEngine
    [AlgoKey.GAP_BAND_SEQUENCE]: 0.40,        // Consolidé satellite sous GapDynamicsEngine
    [AlgoKey.GAP_CADENCE]: 0.40,             // Consolidé satellite sous GapDynamicsEngine
    [AlgoKey.GAPS]: 0.40,                    // Consolidé satellite sous GapDynamicsEngine
    [AlgoKey.AFFINITY]: 0.00,                // DÉSACTIVÉ : -10.9% Lift@10 (Destructeur de valeur)
    [AlgoKey.GAP_SEQUENCE]: 0.00             // DÉSACTIVÉ : -13.8% Lift@10 (Destructeur de valeur)
};

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
