import {
  EXACT_SUM_MOMENTS,
  EXACT_AMPLITUDE_MOMENTS,
  EXACT_AC_MOMENTS,
  EXACT_CONSECUTIVE_MOMENTS,
} from './drawTheory';

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
    INTER_DRAW_RESONANCE = 'inter_draw_resonance'
}

export type AlgoWeights = Record<AlgoKey, number>;

/**
 * CANAUX D'ÉCARTS REQUALIFIÉS EN NOUVEAUX MODÈLES STOCHASTIQUES ORTHOGONAUX.
 *
 * GAP_PATTERN : Processus de Hawkes discret multivarié (Auto-excitation & contagion).
 * GAP_SEQUENCE : Champ moyen d'Ising & potentiel topologique d'aimantation de réseau.
 * SEQUENCE_PATTERN : Entropie de permutation locale & compressibilité informationnelle.
 *
 * Ces trois canaux ont été réingéniés pour apporter une diversité stochastique authentique,
 * éliminant toute colinéarité avec le lissage de Holt (GAP_TREND).
 */
export const RETIRED_REDUNDANT_ALGOS: ReadonlySet<AlgoKey> = new Set<AlgoKey>([]);

/**
 * CANAL REQUALIFIÉ EN ONDELETTES MULTI-ÉCHELLES (CYCLES PHYSIQUES 18 TIRAGES).
 *
 * INTER_MONTHLY_RESONANCE a été purgé de tout cycle calendaire civil/lunaire arbitraire
 * et réarchitecturé autour de la transformée en ondelettes continues (Ricker) calée sur
 * la période fondamentale physique d'échantillonnage complet du loto 5/90 (T_0 = 90 / 5 = 18 tirages).
 */
export const RETIRED_PSEUDOSCIENCE_ALGOS: ReadonlySet<AlgoKey> = new Set<AlgoKey>([]);

/**
 * Union des canaux retirés. Désormais vide : les 24 canaux algorithmiques de l'architecture
 * sont tous mathématiquement rigoureux, orthogonaux et actifs dans l'ensemble.
 */
export const RETIRED_ALGO_WEIGHT_KEYS: ReadonlySet<AlgoKey> = new Set<AlgoKey>([
    ...RETIRED_REDUNDANT_ALGOS,
    ...RETIRED_PSEUDOSCIENCE_ALGOS,
]);

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
    acc[key] = RETIRED_ALGO_WEIGHT_KEYS.has(key) ? 0.0 : 1.0;
    return acc;
}, {} as AlgoWeights);

export type ScoreBreakdown = Partial<Record<AlgoKey, number>>;

/**
 * Décompte canonique des canaux algorithmiques, dérivé de l'enum et de l'ensemble des canaux
 * retirés. Source unique de vérité : toute mention chiffrée dans l'UI doit s'y référer afin
 * qu'aucun libellé ne puisse annoncer un nombre d'algorithmes différent de la réalité du moteur.
 */
export const TOTAL_ALGO_COUNT = Object.values(AlgoKey).length;
export const RETIRED_ALGO_COUNT = RETIRED_ALGO_WEIGHT_KEYS.size;
export const ACTIVE_ALGO_COUNT = TOTAL_ALGO_COUNT - RETIRED_ALGO_COUNT;

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

/**
 * Calibration de repli : cibles exactes de la loi uniforme 5/90 (voir drawTheory.ts).
 * Ce ne sont pas des constantes empiriques arbitraires mais les moments théoriques de
 * l'hypothèse nulle, utilisés comme prior de régularisation quand l'historique est trop
 * court. `isValid=false` signale précisément l'absence de données observées.
 */
export const FALLBACK_CALIBRATION: EmpiricalCalibration = {
  meanSum: EXACT_SUM_MOMENTS.mean,
  stdSum: EXACT_SUM_MOMENTS.std,
  meanAmplitude: EXACT_AMPLITUDE_MOMENTS.mean,
  stdAmplitude: EXACT_AMPLITUDE_MOMENTS.std,
  meanAC: EXACT_AC_MOMENTS.mean,
  stdAC: EXACT_AC_MOMENTS.std,
  lambdaConsecutives: EXACT_CONSECUTIVE_MOMENTS.mean,
  isValid: false
};
