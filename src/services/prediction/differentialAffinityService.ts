import { DrawResult } from "../../types";

/*
 * ============================================================================
 *  differentialAffinityService.ts
 * ============================================================================
 *  Algorithme DIFFÉRENTIEL : prend les numéros déjà sélectionnés par les autres
 *  algorithmes de l'application et calcule un score de diffusion sur leurs
 *  relations d'écart :
 *     - Voisins    : n-1 et n+1 (bouclage circulaire 1<->90)
 *     - Miroir     : 91 - n (symétrie centrale de la grille 1..90)
 *     - Ombre      : inversion des chiffres (23->32, 5->50), bornée [1..90]
 *
 *  Note de recherche : ces relations sont des STRUCTURES de grille réelles,
 *  utiles pour diversifier ou pondérer une sélection existante. Sur un tirage
 *  équitable elles n'améliorent pas la probabilité au-delà de 5/90. À utiliser
 *  comme post-traitement descriptif d'une sélection, pas comme oracle.
 * ============================================================================
 */

const MAX_NUM = 90;

const TUNING = {
  NEIGHBOR_WEIGHT: 1.0,  // poids diffusé vers n-1 / n+1
  MIRROR_WEIGHT: 0.8,    // poids diffusé vers 91 - n
  SHADOW_WEIGHT: 0.6,    // poids diffusé vers l'inversion digitale
  SELF_WEIGHT: 1.5,      // renforcement du numéro source lui-même
  // Diffusion gaussienne optionnelle autour des voisins (0 = voisins stricts).
  NEIGHBOR_SIGMA: 0.0,
} as const;

/** Voisins circulaires d'un numéro : n-1 et n+1 avec bouclage 1<->90. */
export const getNeighbors = (n: number): number[] => {
  const left = n > 1 ? n - 1 : MAX_NUM;
  const right = n < MAX_NUM ? n + 1 : 1;
  return [left, right];
};

/** Miroir central : 91 - n (1<->90, 2<->89, …, 45<->46). */
export const getMirror = (n: number): number => {
  const m = (MAX_NUM + 1) - n;
  return m >= 1 && m <= MAX_NUM ? m : n;
};

/**
 * Ombre : inversion des chiffres. 23->32, 41->14, 5->50, 90->9.
 * Si l'inversion sort de [1..90] on retombe sur n (pas d'invention hors grille).
 */
export const getShadow = (n: number): number => {
  if (n < 10) return n * 10;
  const rev = parseInt(String(n).split("").reverse().join(""), 10);
  return Number.isFinite(rev) && rev >= 1 && rev <= MAX_NUM ? rev : n;
};

/**
 * Cœur de l'algorithme : à partir d'une sélection de numéros (fournie par les
 * autres algos), construit un vecteur de score 0..100 diffusé sur les relations
 * d'écart. Chaque numéro source injecte de l'énergie vers lui-même + ses
 * voisins + son miroir + son ombre.
 *
 * @param selectedNumbers  numéros choisis par les autres algorithmes
 * @param sourceScores     (optionnel) score de chaque numéro source pour
 *                         pondérer sa diffusion (défaut : 1 pour tous)
 */
export const calculateDifferentialAffinity = (
  selectedNumbers: number[],
  sourceScores?: Record<number, number>,
): Record<number, number> => {
  const raw: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) raw[n] = 0;

  if (!selectedNumbers || selectedNumbers.length === 0) {
    for (let n = 1; n <= MAX_NUM; n++) raw[n] = 50;
    return raw;
  }

  const addEnergy = (target: number, amount: number) => {
    if (target >= 1 && target <= MAX_NUM) raw[target] += amount;
  };

  for (const src of selectedNumbers) {
    if (src < 1 || src > MAX_NUM) continue;
    const w = sourceScores?.[src] ?? 1.0;

    // 1. Renforcement du numéro source
    addEnergy(src, TUNING.SELF_WEIGHT * w);

    // 2. Voisins (stricts, ou diffusion gaussienne si NEIGHBOR_SIGMA > 0)
    if (TUNING.NEIGHBOR_SIGMA > 0) {
      for (let d = 1; d <= 3; d++) {
        const g = Math.exp(-(d * d) / (2 * TUNING.NEIGHBOR_SIGMA * TUNING.NEIGHBOR_SIGMA));
        addEnergy(src - d < 1 ? MAX_NUM + (src - d) : src - d, TUNING.NEIGHBOR_WEIGHT * w * g);
        addEnergy(src + d > MAX_NUM ? (src + d) - MAX_NUM : src + d, TUNING.NEIGHBOR_WEIGHT * w * g);
      }
    } else {
      getNeighbors(src).forEach((nb) => addEnergy(nb, TUNING.NEIGHBOR_WEIGHT * w));
    }

    // 3. Miroir
    addEnergy(getMirror(src), TUNING.MIRROR_WEIGHT * w);

    // 4. Ombre
    addEnergy(getShadow(src), TUNING.SHADOW_WEIGHT * w);
  }

  // Normalisation 0..100
  const values = Object.values(raw);
  const max = Math.max(...values, 1e-9);
  const out: Record<number, number> = {};
  for (let n = 1; n <= MAX_NUM; n++) out[n] = (raw[n] / max) * 100;
  return out;
};

/**
 * Variante enrichie : renvoie, pour chaque numéro source, le détail de ses
 * relations — pratique pour l'explicabilité (UI) et le debug.
 */
export interface DifferentialRelation {
  source: number;
  neighbors: number[];
  mirror: number;
  shadow: number;
}

export const explainDifferentialRelations = (
  selectedNumbers: number[],
): DifferentialRelation[] =>
  selectedNumbers
    .filter((n) => n >= 1 && n <= MAX_NUM)
    .map((src) => ({
      source: src,
      neighbors: getNeighbors(src),
      mirror: getMirror(src),
      shadow: getShadow(src),
    }));

/**
 * Adaptateur pour le scoringEngine : signature homogène avec tes autres algos
 * (history, options). On extrait la sélection de départ depuis les gagnants du
 * dernier tirage OU depuis une sélection injectée via options.selection.
 */
export const calculateDifferentialAffinityScores = (
  history: DrawResult[],
  options?: { selection?: number[]; sourceScores?: Record<number, number> },
): Record<number, number> => {
  const selection =
    options?.selection && options.selection.length > 0
      ? options.selection
      : history?.[0]?.gagnants || [];
  return calculateDifferentialAffinity(selection, options?.sourceScores);
};
