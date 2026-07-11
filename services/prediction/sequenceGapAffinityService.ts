import { DrawResult } from "../../types";

/*
 * ============================================================================
 *  sequenceGapAffinityService.ts
 * ============================================================================
 *  Deux features descriptives HONNÊTES pour un tirage 1..90 :
 *   1) calculateSequenceGapAffinity  — écarts (gaps) + affinité de séquence.
 *   2) (voir differentialAffinityService.ts pour les relations +1/-1/ombre/miroir)
 *
 *  Note de recherche : sur un tirage équitable ces scores ne battent pas 5/90.
 *  Ils quantifient une STRUCTURE observée dans l'historique (retards, suites,
 *  co-occurrences), pas une probabilité de gain. À consommer comme signal
 *  descriptif au même titre que les autres AlgoKey, jamais comme oracle.
 *
 *  Convention de l'historique : history[0] = tirage le plus RÉCENT
 *  (identique au reste de l'application).
 * ============================================================================
 */

const MAX_NUM = 90;

// --- Réglages nommés (pas de nombres magiques épars) ---
const TUNING = {
  // Fenêtre glissante (en tirages) pour l'affinité de co-occurrence de séquence.
  SEQUENCE_WINDOW: 3,
  // Écarts arithmétiques considérés comme "séquence" (suites +1, +2).
  ARITHMETIC_STEPS: [1, 2] as number[],
  // Poids relatif des deux composantes dans le score final [0..1].
  GAP_WEIGHT: 0.5,
  AFFINITY_WEIGHT: 0.5,
  // Lissage de Laplace pour éviter les divisions par zéro sur petits historiques.
  LAPLACE: 1.0,
} as const;

/** Normalise un Record<number,number> sur une échelle 0..100 (min-max robuste). */
const normalizeScores = (raw: Record<number, number>): Record<number, number> => {
  const values = Object.values(raw);
  if (values.length === 0) return raw;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const out: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) {
    const v = raw[n] ?? min;
    out[n] = span > 1e-9 ? ((v - min) / span) * 100 : 50;
  }
  return out;
};

/**
 * Écarts : pour chaque numéro, on calcule
 *   - currentGap : nombre de tirages depuis sa dernière sortie (0 = sorti au dernier tirage)
 *   - meanGap    : écart moyen historique entre deux sorties
 *   - retard normalisé = currentGap / meanGap  (>1 => en retard vs son propre rythme)
 * On renvoie un score continu : plus le numéro est "en retard vs lui-même", plus il monte.
 */
export const calculateGapAffinity = (history: DrawResult[]): Record<number, number> => {
  const raw: Record<number, number> = {};
  const total = history.length;

  for (let n = 1; n <= MAX_NUM; n++) {
    const appearances: number[] = []; // indices (âge) où n est sorti
    for (let age = 0; age < total; age++) {
      if ((history[age]?.gagnants || []).includes(n)) {
        appearances.push(age);
      }
    }

    // currentGap = âge de la dernière apparition (ou "jamais vu" => total)
    const currentGap = appearances.length > 0 ? appearances[0] : total;

    // meanGap = moyenne des intervalles entre apparitions successives
    let meanGap: number;
    if (appearances.length >= 2) {
      let sumIntervals = 0;
      for (let k = 1; k < appearances.length; k++) {
        sumIntervals += appearances[k] - appearances[k - 1];
      }
      meanGap = sumIntervals / (appearances.length - 1);
    } else {
      // Fréquence théorique 5/90 => écart moyen attendu ≈ 90/5 = 18 tirages
      meanGap = MAX_NUM / 5;
    }

    // Retard relatif borné (log-ratio lissé pour éviter l'explosion)
    const ratio = (currentGap + TUNING.LAPLACE) / (meanGap + TUNING.LAPLACE);
    raw[n] = Math.log(ratio); // >0 en retard, <0 en avance
  }

  return normalizeScores(raw);
};

/**
 * Affinité de séquence : combine deux signaux observés dans l'historique.
 *   (a) Co-occurrence en fenêtre glissante : deux numéros qui reviennent souvent
 *       à quelques tirages d'intervalle "s'attirent".
 *   (b) Affinité arithmétique : présence de suites (n, n+1) ou (n, n+2) dans un
 *       même tirage — mesurée, pas supposée.
 * Le score d'un numéro = somme de ses affinités avec les numéros récemment sortis.
 */
export const calculateSequenceAffinity = (history: DrawResult[]): Record<number, number> => {
  const total = history.length;

  // Matrice de co-occurrence en fenêtre glissante (symétrique).
  const coOcc: Float64Array = new Float64Array((MAX_NUM + 1) * (MAX_NUM + 1));
  const idx = (a: number, b: number) => a * (MAX_NUM + 1) + b;

  for (let age = 0; age < total; age++) {
    const windowNums = new Set<number>();
    for (let w = 0; w < TUNING.SEQUENCE_WINDOW && age + w < total; w++) {
      ((history[age + w]?.gagnants || []) as number[]).forEach((n: number) => {
        if (n >= 1 && n <= MAX_NUM) windowNums.add(n);
      });
    }
    const arr = Array.from(windowNums);
    // Poids décroissant avec l'ancienneté de la fenêtre
    const recency = Math.exp(-age / Math.max(1, total));
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        coOcc[idx(arr[i], arr[j])] += recency;
        coOcc[idx(arr[j], arr[i])] += recency;
      }
    }
  }

  // Affinité arithmétique : compte les suites (n, n+step) dans un même tirage.
  const arithAffinity: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) arithAffinity[n] = 0;
  for (let age = 0; age < total; age++) {
    const nums = new Set<number>((history[age]?.gagnants || []) as number[]);
    const recency = Math.exp(-age / Math.max(1, total));
    for (const n of nums) {
      for (const step of TUNING.ARITHMETIC_STEPS) {
        if (nums.has(n + step)) {
          arithAffinity[n] += recency;
          if (n + step <= MAX_NUM) {
            arithAffinity[n + step] += recency;
          }
        }
      }
    }
  }

  // Numéros du dernier tirage : "graines" d'attraction pour la co-occurrence.
  const seeds = new Set<number>((history[0]?.gagnants || []) as number[]);

  const raw: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) {
    let coScore = 0;
    seeds.forEach((s: number) => { coScore += coOcc[idx(n, s)]; });
    raw[n] = coScore + arithAffinity[n];
  }

  return normalizeScores(raw);
};

/**
 * Score combiné exposé comme feature unique (clé AlgoKey.GAPS / AFFINITY selon
 * la façon dont tu la câbles dans le scoringEngine). Combinaison linéaire des
 * deux composantes, renormalisée 0..100.
 */
export const calculateSequenceGapAffinity = (
  history: DrawResult[],
): Record<number, number> => {
  if (!history || history.length < 5) {
    // Historique trop court : score neutre uniforme (honnête, pas d'invention).
    const flat: Record<number, number> = {};
    for (let n = 1; n <= MAX_NUM; n++) flat[n] = 50;
    return flat;
  }

  const gap = calculateGapAffinity(history);
  const seq = calculateSequenceAffinity(history);

  const raw: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) {
    raw[n] = TUNING.GAP_WEIGHT * (gap[n] ?? 50) + TUNING.AFFINITY_WEIGHT * (seq[n] ?? 50);
  }
  return normalizeScores(raw);
};
