/**
 * MOMENTS EXACTS DU TIRAGE 5/90 SOUS L'HYPOTHÈSE NULLE UNIFORME.
 *
 * Source unique de vérité pour toutes les cibles statistiques du moteur. Chaque valeur est
 * soit une forme fermée de la loi hypergéométrique (tirage sans remise de K boules parmi N),
 * soit le résultat d'une énumération exhaustive des C(90,5) = 43 949 268 combinaisons
 * (reproductible via `scripts/computeExactAcMoments.ts`). Aucune valeur n'est estimée sur
 * un échantillon : un prior ne doit jamais dépendre des données qu'il régularise.
 *
 * Références :
 * - Somme  : E = K(N+1)/2 ; Var = K(N²−1)/12 · (N−K)/(N−1)
 * - Étendue: E = (K−1)/(K+1) · (N+1) ; Var = 2(K−1)(N+1)(N−K) / ((K+1)²(K+2))
 * - Paires consécutives : C = Σ_{i=1}^{N−1} 1{i et i+1 présents}, moments dérivés de la
 *   probabilité d'inclusion conjointe de fenêtres adjacentes (chevauchantes ou disjointes).
 * - AC (nombre de différences distinctes − (K−1)) : distribution énumérée exhaustivement.
 */

export const DRAW_DOMAIN_SIZE = 90;
export const DRAW_PICK_SIZE = 5;

export interface ExactMoments {
  mean: number;
  variance: number;
  std: number;
}

const freezeMoments = (mean: number, variance: number): Readonly<ExactMoments> =>
  Object.freeze({ mean, variance, std: Math.sqrt(variance) });

// ---------------------------------------------------------------------------
// Somme des K numéros triés
// ---------------------------------------------------------------------------
const SUM_MEAN = (DRAW_PICK_SIZE * (DRAW_DOMAIN_SIZE + 1)) / 2;
const SUM_VARIANCE =
  ((DRAW_PICK_SIZE * (DRAW_DOMAIN_SIZE * DRAW_DOMAIN_SIZE - 1)) / 12) *
  ((DRAW_DOMAIN_SIZE - DRAW_PICK_SIZE) / (DRAW_DOMAIN_SIZE - 1));

export const EXACT_SUM_MOMENTS: Readonly<ExactMoments> = freezeMoments(SUM_MEAN, SUM_VARIANCE);

// ---------------------------------------------------------------------------
// Étendue (max − min)
// ---------------------------------------------------------------------------
const AMPLITUDE_MEAN =
  ((DRAW_PICK_SIZE - 1) / (DRAW_PICK_SIZE + 1)) * (DRAW_DOMAIN_SIZE + 1);
const AMPLITUDE_VARIANCE =
  (2 * (DRAW_PICK_SIZE - 1) * (DRAW_DOMAIN_SIZE + 1) * (DRAW_DOMAIN_SIZE - DRAW_PICK_SIZE)) /
  (Math.pow(DRAW_PICK_SIZE + 1, 2) * (DRAW_PICK_SIZE + 2));

export const EXACT_AMPLITUDE_MOMENTS: Readonly<ExactMoments> = freezeMoments(
  AMPLITUDE_MEAN,
  AMPLITUDE_VARIANCE
);

// ---------------------------------------------------------------------------
// Nombre de paires consécutives (ex: {3,4,7,8,9} → 3 paires : 3-4, 7-8, 8-9)
// ---------------------------------------------------------------------------
const CONSECUTIVE_MEAN = (DRAW_PICK_SIZE * (DRAW_PICK_SIZE - 1)) / DRAW_DOMAIN_SIZE;

const adjacentWindowCount = DRAW_DOMAIN_SIZE - 1;
const overlappingWindowPairs = DRAW_DOMAIN_SIZE - 2;
const disjointWindowPairs =
  (adjacentWindowCount * (adjacentWindowCount - 1)) / 2 - overlappingWindowPairs;

const overlappingInclusionProb =
  (DRAW_PICK_SIZE * (DRAW_PICK_SIZE - 1) * (DRAW_PICK_SIZE - 2)) /
  (DRAW_DOMAIN_SIZE * (DRAW_DOMAIN_SIZE - 1) * (DRAW_DOMAIN_SIZE - 2));
const disjointInclusionProb =
  (DRAW_PICK_SIZE * (DRAW_PICK_SIZE - 1) * (DRAW_PICK_SIZE - 2) * (DRAW_PICK_SIZE - 3)) /
  (DRAW_DOMAIN_SIZE * (DRAW_DOMAIN_SIZE - 1) * (DRAW_DOMAIN_SIZE - 2) * (DRAW_DOMAIN_SIZE - 3));

const CONSECUTIVE_SECOND_MOMENT =
  CONSECUTIVE_MEAN +
  2 *
    (overlappingWindowPairs * overlappingInclusionProb +
      disjointWindowPairs * disjointInclusionProb);
const CONSECUTIVE_VARIANCE =
  CONSECUTIVE_SECOND_MOMENT - CONSECUTIVE_MEAN * CONSECUTIVE_MEAN;

export const EXACT_CONSECUTIVE_MOMENTS: Readonly<ExactMoments> = freezeMoments(
  CONSECUTIVE_MEAN,
  CONSECUTIVE_VARIANCE
);

// ---------------------------------------------------------------------------
// AC = |{ |x_i − x_j| }| − (K − 1). Distribution exacte des C(90,5) combinaisons.
// ---------------------------------------------------------------------------
export const EXACT_AC_DISTRIBUTION: ReadonlyArray<Readonly<{ ac: number; count: number }>> =
  Object.freeze([
    Object.freeze({ ac: 0, count: 968 }),
    Object.freeze({ ac: 1, count: 3690 }),
    Object.freeze({ ac: 2, count: 165676 }),
    Object.freeze({ ac: 3, count: 311444 }),
    Object.freeze({ ac: 4, count: 4652892 }),
    Object.freeze({ ac: 5, count: 6160570 }),
    Object.freeze({ ac: 6, count: 32654028 }),
  ]);

export const EXACT_COMBINATION_COUNT = EXACT_AC_DISTRIBUTION.reduce(
  (total, bucket) => total + bucket.count,
  0
);

const acMean =
  EXACT_AC_DISTRIBUTION.reduce((sum, bucket) => sum + bucket.ac * bucket.count, 0) /
  EXACT_COMBINATION_COUNT;
const acSecondMoment =
  EXACT_AC_DISTRIBUTION.reduce((sum, bucket) => sum + bucket.ac * bucket.ac * bucket.count, 0) /
  EXACT_COMBINATION_COUNT;

export const EXACT_AC_MOMENTS: Readonly<ExactMoments> = freezeMoments(
  acMean,
  acSecondMoment - acMean * acMean
);

// ---------------------------------------------------------------------------
// Références d'équiprobabilité (utilisées par les métriques de skill)
// ---------------------------------------------------------------------------
export const UNIFORM_SINGLE_NUMBER_PROBABILITY = DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE;
export const UNIFORM_BRIER_REFERENCE =
  UNIFORM_SINGLE_NUMBER_PROBABILITY * (1 - UNIFORM_SINGLE_NUMBER_PROBABILITY);
export const UNIFORM_EXPECTED_HITS_TOP_K =
  (DRAW_PICK_SIZE * DRAW_PICK_SIZE) / DRAW_DOMAIN_SIZE;
