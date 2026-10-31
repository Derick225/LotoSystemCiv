/**
 * Matrice de transition inter-tirages 90×90 (module pur, sans I/O, déterministe).
 *
 * M[s][t] = P(t ∈ tirage cible | s ∈ tirage source), avec lissage de Laplace dérivé :
 *   p(s,t) = (O(s,t) + 1) / (n_s + TOTAL/PER_DRAW)
 * où O(s,t) est le nombre (pondéré) de paires où s est sorti dans la source et t dans la cible,
 * et n_s le nombre (pondéré) de sorties de s dans la source.
 * L'a priori a pour moyenne 1/(TOTAL/PER_DRAW) = PER_DRAW/TOTAL (= 5/90) et force TOTAL/PER_DRAW (= 18),
 * ce qui est identique au lissage historique du moteur (Rust et fallback TS).
 *
 * Deux portées sont calculées par le même code :
 *  - IMMEDIATE : un seul tirage source (le prédécesseur immédiat), poids 1 ;
 *  - NETWORK   : tous les tirages du réseau fermé, chaque source pondérée par son couplage continu
 *                (AGENTS.md : « toute paire du réseau existe avec un poids continu »).
 *
 * L'alignement chronologique des paires (source strictement avant cible) est fait en amont par
 * `alignConsecutiveDrawHistories` : ce module reçoit des paires déjà alignées.
 */

export const TRANSITION_TOTAL_NUMBERS = 90; // = LOTTERY_CONSTANTS.TOTAL_NUMBERS
export const TRANSITION_NUMBERS_PER_DRAW = 5; // = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW

/** Force de l'a priori de Laplace : TOTAL / PER_DRAW (= 18). */
const PRIOR_STRENGTH = TRANSITION_TOTAL_NUMBERS / TRANSITION_NUMBERS_PER_DRAW;
/** Probabilité marginale théorique d'un numéro dans un tirage (= 5/90). */
export const TRANSITION_BASELINE = TRANSITION_NUMBERS_PER_DRAW / TRANSITION_TOTAL_NUMBERS;

export type TransitionScope = 'IMMEDIATE' | 'NETWORK';

export interface TransitionPair {
  predWinners: number[];
  targetWinners: number[];
}

export interface TransitionPairSource {
  name: string;
  /** Poids de couplage continu (≥ 0). Ignoré (= 1) pour un tirage source unique. */
  weight: number;
  pairs: TransitionPair[];
}

export interface TransitionSourceSummary {
  name: string;
  pairs: number;
  /** Poids normalisé réellement appliqué (moyenne des poids = 1). */
  appliedWeight: number;
}

export interface WeightedTransitionMatrix {
  scope: TransitionScope;
  /** 90×90 aplati, ligne = source (s-1), colonne = cible (t-1). */
  probs: number[];
  /** Cooccurrences pondérées O(s,t), même disposition. */
  counts: number[];
  /** n_s : nombre pondéré de sorties de chaque numéro source (longueur 90). */
  sourceMass: number[];
  /** Nombre de paires de tirages alignées, toutes sources confondues. */
  pairsUsed: number;
  /** Nombre de tirages sources ayant au moins une paire. */
  sourcesUsed: number;
  bySource: TransitionSourceSummary[];
}

export interface TransitionRowCell {
  targetNumber: number;
  /** Probabilité brute (non arrondie) dans [0, 1]. */
  prob: number;
  /** prob / (5/90). */
  lift: number;
  /** Cooccurrences pondérées observées. */
  count: number;
}

const isValidNumber = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= TRANSITION_TOTAL_NUMBERS;

export function buildWeightedTransitionMatrix(
  sources: TransitionPairSource[],
  scope: TransitionScope
): WeightedTransitionMatrix {
  const N = TRANSITION_TOTAL_NUMBERS;
  const counts = new Array<number>(N * N).fill(0);
  const sourceMass = new Array<number>(N).fill(0);

  const active = sources.filter(s => s.pairs.length > 0);

  // Normalisation des poids : moyenne = 1 sur les sources actives. Les masses n_s gardent ainsi
  // l'échelle d'un effectif réel de paires, et l'a priori de Laplace ne domine pas artificiellement
  // quand les couplages sont tous petits (ex. 0,05).
  const safeW = (w: number) => (Number.isFinite(w) && w > 0 ? w : 0);
  const totalW = active.reduce((acc, s) => acc + safeW(s.weight), 0);
  const applied = (s: TransitionPairSource): number => {
    if (scope === 'IMMEDIATE' || active.length === 1) return 1;
    if (totalW <= 0) return 1; // aucun couplage exploitable : poids uniforme
    return (safeW(s.weight) * active.length) / totalW;
  };

  let pairsUsed = 0;
  const bySource: TransitionSourceSummary[] = [];

  for (const src of active) {
    const w = applied(src);
    for (const pair of src.pairs) {
      // Dédoublonnage défensif pour immuniser contre les paires avec numéros corrompus répétés
      const uniquePred = Array.from(new Set((pair.predWinners || []).filter(isValidNumber)));
      const uniqueTarget = Array.from(new Set((pair.targetWinners || []).filter(isValidNumber)));

      for (const s of uniquePred) {
        sourceMass[s - 1] += w;
        const row = (s - 1) * N;
        for (const t of uniqueTarget) {
          counts[row + (t - 1)] += w;
        }
      }
    }
    pairsUsed += src.pairs.length;
    bySource.push({ name: src.name, pairs: src.pairs.length, appliedWeight: w });
  }

  bySource.sort((a, b) => b.appliedWeight - a.appliedWeight || b.pairs - a.pairs || a.name.localeCompare(b.name));

  const probs = new Array<number>(N * N);
  for (let s = 0; s < N; s++) {
    const denom = sourceMass[s] + PRIOR_STRENGTH;
    for (let t = 0; t < N; t++) {
      probs[s * N + t] = (counts[s * N + t] + 1) / denom;
    }
  }

  return {
    scope,
    probs,
    counts,
    sourceMass,
    pairsUsed,
    sourcesUsed: active.length,
    bySource,
  };
}

/**
 * Classe la ligne `source` de la matrice. Tri : probabilité décroissante, puis cooccurrences
 * pondérées décroissantes, puis numéro croissant. Aucun arrondi avant le tri : les égalités
 * ne sont donc plus résolues par l'ordre 1, 2, 3… de l'index.
 */
export function rankTransitionRow(
  matrix: WeightedTransitionMatrix,
  source: number,
  targetFilter?: number
): TransitionRowCell[] {
  if (!isValidNumber(source)) return [];
  const N = TRANSITION_TOTAL_NUMBERS;
  const row = (source - 1) * N;
  const cells: TransitionRowCell[] = [];
  for (let t = 1; t <= N; t++) {
    if (targetFilter !== undefined && t !== targetFilter) continue;
    const prob = matrix.probs[row + (t - 1)] ?? 0;
    cells.push({
      targetNumber: t,
      prob,
      lift: TRANSITION_BASELINE > 0 ? prob / TRANSITION_BASELINE : 1,
      count: matrix.counts[row + (t - 1)] ?? 0,
    });
  }
  return cells.sort(
    (a, b) => b.prob - a.prob || b.count - a.count || a.targetNumber - b.targetNumber
  );
}

/**
 * Une ligne est « informative » si le numéro source a réellement été observé dans au moins un
 * tirage source aligné. Sinon la ligne vaut l'a priori uniforme et aucun classement n'a de sens.
 */
export function isTransitionRowInformative(
  matrix: WeightedTransitionMatrix,
  source: number
): boolean {
  if (!isValidNumber(source)) return false;
  return matrix.pairsUsed >= 2 && matrix.sourceMass[source - 1] > 0;
}
