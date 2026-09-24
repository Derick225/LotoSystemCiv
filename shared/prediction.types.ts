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
 * CANAUX D'ÉCARTS REDONDANTS RETIRÉS DE L'ENSEMBLE ACTIF (déduplication ALGO-6).
 *
 * GAP_SEQUENCE (autocorrélation lag-1 + retour à la moyenne), GAP_PATTERN (AR(1) lag-1)
 * et SEQUENCE_PATTERN (fenêtre glissante) modélisent tous le MÊME signal : la dynamique
 * d'autocorrélation de la séquence d'écarts individuelle de chaque numéro. Cette
 * colinéarité faisait compter un signal unique ~4x dans l'ensemble pondéré, gonflant
 * artificiellement sa confiance. GAP_TREND (lissage de Holt niveau + tendance, paramètres
 * optimisés par SSE) est conservé comme représentant orthogonal et plus rigoureux de cette
 * famille ; GAPS (niveau statique), GAP_BAND_SEQUENCE (Markov collectif sur tranches) et
 * GAP_CADENCE (régime collectif) couvrent des signaux structurellement distincts.
 *
 * Les clés sont mises à zéro (et non supprimées de l'enum) afin de préserver les types,
 * les ScoreBreakdown persistés et l'affichage UI : les plugins restent enregistrés et
 * continuent de produire leurs scores bruts pour les tableaux de diagnostic (matrice de
 * corrélation des écarts, dashboards), mais ne contribuent plus au score final.
 */
export const RETIRED_REDUNDANT_ALGOS: ReadonlySet<AlgoKey> = new Set<AlgoKey>([
    AlgoKey.GAP_SEQUENCE,
    AlgoKey.GAP_PATTERN,
    AlgoKey.SEQUENCE_PATTERN,
]);

/**
 * CANAUX PSEUDO-SCIENTIFIQUES RETIRÉS DE L'ENSEMBLE ACTIF (refonte ALGO-7, changement
 * produit autorisé par l'utilisateur).
 *
 * INTER_MONTHLY_RESONANCE prétend détecter des « périodicités calendaires mensuelles,
 * trimestrielles, lunaires/synodiques et multi-annuelles ». Un tirage de loto physique est
 * un processus aléatoire : la phase lunaire, le mois civil ou l'anniversaire de tirages
 * passés n'ont AUCUN mécanisme causal sur les boules tirées. Ces corrélations sont du
 * bruit d'échantillonnage (sur-apprentissage), et leur présence dans l'ensemble donnait une
 * crédibilité indue à une prédiction qui n'en a pas. Ce canal n'est PAS l'une des trois
 * relations inter-tirages sanctionnées par AGENTS.md (Markov, report direct carry-over,
 * résonances harmoniques au sein des familles étanches) — il est donc retiré sans violer
 * l'invariant architectural.
 *
 * Comme pour les canaux redondants, la clé est mise à zéro plutôt que supprimée : le plugin
 * reste enregistré et continue d'alimenter l'affichage UI / les tableaux de diagnostic, mais
 * ne contribue plus au score final.
 *
 * NOTE : INTER_DRAW_RESONANCE (miroirs décimaux / compléments 91) n'est PAS retirée ici car
 * AGENTS.md autorise explicitement les « résonances harmoniques » inter-tirages au sein des
 * familles étanches ; la supprimer violerait un invariant non négociable du projet.
 */
export const RETIRED_PSEUDOSCIENCE_ALGOS: ReadonlySet<AlgoKey> = new Set<AlgoKey>([
    AlgoKey.INTER_MONTHLY_RESONANCE,
]);

/**
 * Union des canaux retirés (redondants + pseudo-scientifiques). C'est cet ensemble qui fait
 * foi pour l'annulation des poids, tant dans les poids par défaut que dans le point de
 * passage unique de normalisation (normalizeWeights), afin qu'aucun poids persisté ou
 * recalibré ne puisse réactiver un canal retiré.
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
