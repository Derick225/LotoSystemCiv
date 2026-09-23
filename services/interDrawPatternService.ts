/**
 * MODULE EXPERT : DÉTECTEUR DE PATTERNS & COOCCURRENCES INTER-TIRAGES
 * 
 * Principes architecturaux stricts (AGENTS.md) :
 * 1. ZÉRO NOMBRES MAGIQUES :
 *    - Probabilités combinatoires exactes pour le format 5/90 (combinaisons C(n, k)).
 *    - Distribution hypergéométrique pour les rétentions et parités sans remise.
 *    - Lissage de Laplace continu dérivé de la taille d'échantillon.
 *    - Z-scores et sigmoïdes logistiques continues pour toute projection [0, 100].
 * 2. ZÉRO HASARD / 100% DÉTERMINISTE :
 *    - Aucun générateur non seedé (reproductibilité absolue).
 * 3. CONTINUITÉ DES TRANSITIONS ET DÉCISIONS :
 *    - Fonctions différentiables continues, sans bifurcations de seuils binaires arbitraires.
 * 4. ISOLATION DES 3 FAMILLES ÉTANCHES :
 *    - Traitement exclusif sur les historiques appariés au sein de la même famille fermée.
 */

import { LOTTERY_CONSTANTS } from './lotteryService';
import { computeCooccurrenceTensorHpc } from './wasm/lotoEngineBridge';

// ============================================================================
// TYPES & INTERFACES DU DÉTECTEUR
// ============================================================================

export interface InterDrawTargetPairCooccurrence {
  pair: [number, number];
  label: string;
  historicalOccurrences: number;
  jointConditionedProb: number;
  lift: number;
  pmi: number; // Pointwise Mutual Information continu
  zScore: number;
  confidence: number; // [0, 1]
  score: number; // [0, 100]
  triggerSources: number[]; // Numéros sources catalysant cette paire
}

export interface InterDrawCrossDyad {
  sourceNumber: number; // Numéro tiré à W_{t-1}
  targetNumber: number; // Numéro tiré à W_t
  occurrences: number;
  probability: number;
  lift: number;
  jaccard: number;
  zScore: number;
  score: number;
  isActiveInCurrentPred: boolean;
}

export interface InterDrawBivariateTrigger {
  sourcePair: [number, number]; // Paire tirée à W_{t-1}
  targetNumber: number; // Numéro tiré à W_t
  occurrences: number;
  pairOccurrences: number;
  probability: number;
  lift: number;
  score: number;
  isActiveInCurrentPred: boolean;
}

export interface InterDrawCooccurrenceReport {
  sampleSize: number;
  theoreticalPairProb: number; // 10 / 4005 ~ 0.00249688
  topConditionedPairs: InterDrawTargetPairCooccurrence[];
  topCrossDyads: InterDrawCrossDyad[];
  activeCrossDyads: InterDrawCrossDyad[];
  bivariateTriggers: InterDrawBivariateTrigger[];
  activeBivariateTriggers: InterDrawBivariateTrigger[];
}

export interface InterDrawParityPattern {
  predEvenCount: number;
  predOddCount: number;
  predRatioLabel: string;
  transitionDistribution: {
    targetEvenCount: number;
    probability: number;
    historicalCount: number;
    label: string;
  }[];
  expectedTargetEven: number;
  expectedTargetOdd: number;
  dominantTendency: 'EQUILIBRE_REVERSION' | 'INERTIE_PAIR' | 'INERTIE_IMPAIR' | 'INVERSION_POLAIRE';
  tendencyLabel: string;
  tendencyStrength: number;
  transitionEntropy: number;
}

export interface InterDrawDecadeFlux {
  fromDecade: number; // 0..8
  toDecade: number; // 0..8
  fromLabel: string;
  toLabel: string;
  occurrences: number;
  probability: number;
  lift: number;
}

export interface InterDrawDecadePattern {
  predDecadeCounts: number[];
  activeDecades: number[];
  decadeFluxMatrix: number[][]; // 9x9 transitions normalisées
  topDecadeFluxes: InterDrawDecadeFlux[];
  stimulatedDecades: {
    decade: number;
    label: string;
    excitationScore: number;
    lift: number;
    topNumbers: number[];
  }[];
}

export interface InterDrawCascadeNeighbour {
  sourceNumber: number;
  targetNeighbour: number;
  delta: number; // -2, -1, +1, +2
  type: 'VOISIN_DIRECT' | 'SAUT_DOUBLE';
  occurrences: number;
  empiricalRate: number;
  lift: number;
  score: number;
}

export type InterDrawCascadeResonance = InterDrawCascadeNeighbour;

export interface InterDrawCascadePattern {
  activeResonances: InterDrawCascadeNeighbour[];
  overallCascadeRate: number;
  overallCascadeExpected: number;
  overallCascadeLift: number;
  directionalDrift: number; // [-1, +1]
  directionalLabel: 'NEUTRE' | 'PROPAGATION_ASCENDANTE' | 'PROPAGATION_DESCENDANTE';
}

export interface InterDrawCentroidPattern {
  predSum: number;
  predMean: number;
  theoreticalMean: number; // 227.5
  theoreticalStd: number; // ~56.78
  historicalDeltaMean: number;
  historicalDeltaStd: number;
  reversionCorrelation: number;
  projectedSumRange: {
    min: number;
    max: number;
    optimal: number;
  };
  reversionTendency: 'HAUSSE_COMPENSATRICE' | 'BAISSE_COMPENSATRICE' | 'STABLE';
}

export interface InterDrawRetentionPattern {
  repeat0Rate: number;
  repeat1Rate: number;
  repeat2Rate: number;
  repeat3PlusRate: number;
  hypergeometricExpected: {
    p0: number; // ~74.52%
    p1: number; // ~23.39%
    p2: number; // ~2.01%
    p3Plus: number; // ~0.08%
  };
  persistenceIndex: number;
  dominantRetentionMode: 'RENOUVELLEMENT_TOTAL' | 'REPORT_UNITAIRE' | 'REPORT_MULTIPLE';
}

export interface InterDrawPatternReport {
  parity: InterDrawParityPattern;
  decades: InterDrawDecadePattern;
  cascade: InterDrawCascadePattern;
  centroid: InterDrawCentroidPattern;
  retention: InterDrawRetentionPattern;
}

// ============================================================================
// OUTILS MATHÉMATIQUES DÉTERMINISTES & DIFFÉRENTIABLES (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

/**
 * Calcul exact du nombre de combinaisons C(n, k)
 */
export const nCr = (n: number, r: number): number => {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  let p = 1;
  for (let i = 1; i <= r; i++) {
    p = (p * (n - (r - i))) / i;
  }
  return Math.round(p);
};

/**
 * Sigmoïde logistique continue standardisée sur [0, 100]
 */
export const continuousSigmoid = (z: number): number => {
  return 100 / (1 + Math.exp(-z));
};

/**
 * Dénombrement théorique exact pour le format 5/90
 */
const TOTAL_NUMBERS = LOTTERY_CONSTANTS.TOTAL_NUMBERS; // 90
const NUMBERS_PER_DRAW = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW; // 5

// Nombre total de combinaisons possibles C(90, 5) = 43 949 268
const TOTAL_COMBINATIONS_5_90 = nCr(TOTAL_NUMBERS, NUMBERS_PER_DRAW);
// Nombre total de paires possibles C(90, 2) = 4 005
const TOTAL_PAIRS_90 = nCr(TOTAL_NUMBERS, 2);
// Nombre de paires formées par les 5 gagnants C(5, 2) = 10
const PAIRS_PER_DRAW = nCr(NUMBERS_PER_DRAW, 2);
// Probabilité théorique a priori d'une paire quelconque dans un tirage = 10 / 4005 ~ 0.0024968789
const THEORETICAL_PAIR_PROB = PAIRS_PER_DRAW / TOTAL_PAIRS_90;
// Probabilité marginale d'un numéro individuel = 5 / 90 ~ 0.05555556
const THEORETICAL_SINGLE_PROB = NUMBERS_PER_DRAW / TOTAL_NUMBERS;

/**
 * Probabilités hypergéométriques théoriques exactes de rétention (0, 1, 2, >= 3)
 * P(k) = [C(5, k) * C(85, 5 - k)] / C(90, 5)
 */
const HYPERGEOMETRIC_RETENTION_EXPECTED = {
  p0: (nCr(5, 0) * nCr(85, 5)) / TOTAL_COMBINATIONS_5_90, // ~ 0.74522
  p1: (nCr(5, 1) * nCr(85, 4)) / TOTAL_COMBINATIONS_5_90, // ~ 0.23394
  p2: (nCr(5, 2) * nCr(85, 3)) / TOTAL_COMBINATIONS_5_90, // ~ 0.02008
  p3Plus: (
    (nCr(5, 3) * nCr(85, 2) +
     nCr(5, 4) * nCr(85, 1) +
     nCr(5, 5) * nCr(85, 0)) / TOTAL_COMBINATIONS_5_90
  ) // ~ 0.00076
};

/**
 * Quantile gaussien exact à 95% (ancrage statistique canonique de significativité).
 * Toute référence de seuil dans ce module est exprimée en unités de ce quantile.
 */
export const Z95_GAUSS = 1.959964;

/**
 * Espérance théorique EXACTE de « au moins un voisin ±1/±2 » pour un numéro source,
 * corrigée des effets de bord : avec c voisins candidats dans [1, 90],
 * P = 1 - C(90 - c, 5) / C(90, 5). Moyenne exacte sur les 90 positions sources
 * (86 positions intérieures à 4 candidats, 2 bordures à 3, 2 coins à 2) ≈ 20.43%.
 * Cette définition correspond exactement au dénombrement empirique (deltas ±1 et ±2).
 */
const CASCADE_NEIGHBOUR_CANDIDATES = Array.from({ length: 91 }, (_, p) => {
  let c = 0;
  for (const d of [-2, -1, 1, 2]) {
    const q = p + d;
    if (q >= 1 && q <= 90) c++;
  }
  return c;
});
const THEORETICAL_CASCADE_EXPECTED = (() => {
  let sum = 0;
  for (let p = 1; p <= 90; p++) {
    sum += 1.0 - nCr(TOTAL_NUMBERS - CASCADE_NEIGHBOUR_CANDIDATES[p], NUMBERS_PER_DRAW) / TOTAL_COMBINATIONS_5_90;
  }
  return (sum / TOTAL_NUMBERS) * 100; // ≈ 20.43%
})();

/**
 * Probabilités hypergéométriques théoriques exactes de parité (45 pairs, 45 impairs)
 * P(k pairs) = [C(45, k) * C(45, 5 - k)] / C(90, 5)
 */
const HYPERGEOMETRIC_PARITY_EXPECTED = Array.from({ length: 6 }, (_, k) =>
  (nCr(45, k) * nCr(45, 5 - k)) / TOTAL_COMBINATIONS_5_90
);

/**
 * Index de dizaine canonique pour les numéros 1 à 90 :
 * 0: 1..9 (9 numéros)
 * 1..7: 10..19, ..., 70..79 (10 numéros chacun)
 * 8: 80..90 (11 numéros)
 */
export const getNumberDecade = (n: number): number => {
  if (n <= 9) return 0;
  return Math.min(8, Math.floor(n / 10));
};

export const DECADE_LABELS = [
  '01-09',
  '10-19',
  '20-29',
  '30-39',
  '40-49',
  '50-59',
  '60-69',
  '70-79',
  '80-90'
];

export const getDecadeTheoreticalCapacity = (decade: number): number => {
  if (decade === 0) return 9 / 90; // 0.10
  if (decade === 8) return 11 / 90; // ~0.1222
  return 10 / 90; // ~0.1111
};

// ============================================================================
// CALCULATEUR DÉTERMINISTE DES COOCCURRENCES INTER-TIRAGES
// ============================================================================

export const analyzeInterDrawCooccurrences = (
  pairedPairs: { predWinners: number[]; targetWinners: number[] }[],
  activePredNumbers: number[],
  sampleSize: number = pairedPairs.length,
  laplaceAlpha: number = 1.0
): InterDrawCooccurrenceReport => {
  const activePredSet = new Set(activePredNumbers.filter(n => n >= 1 && n <= 90));

  // Capacité de rapport dérivée : √n (heuristique statistique canonique de cadrage),
  // plancher = format du tirage (5 numéros). Remplace les troncatures fixes.
  const reportCap = Math.max(NUMBERS_PER_DRAW, Math.ceil(Math.sqrt(Math.max(1, sampleSize))));

  // Préparation vectorielle pour l'accélérateur WebAssembly (WASM HPC)
  const numDraws = pairedPairs.length;
  const predFlat = new Int32Array(numDraws * NUMBERS_PER_DRAW);
  const targetFlat = new Int32Array(numDraws * NUMBERS_PER_DRAW);
  for (let d = 0; d < numDraws; d++) {
    const pw = pairedPairs[d].predWinners;
    const tw = pairedPairs[d].targetWinners;
    for (let c = 0; c < NUMBERS_PER_DRAW; c++) {
      predFlat[d * NUMBERS_PER_DRAW + c] = pw[c] ?? 0;
      targetFlat[d * NUMBERS_PER_DRAW + c] = tw[c] ?? 0;
    }
  }

  // Calcul tensoriel optimisé via Rust WASM (avec fallback vectorisé)
  const hpcTensor = computeCooccurrenceTensorHpc(
    predFlat,
    targetFlat,
    numDraws,
    NUMBERS_PER_DRAW,
    activePredNumbers
  );

  // Matrices et maps de dénombrement
  const targetNumberCounts = new Int32Array(91);
  const predNumberCounts = new Int32Array(91);
  const dyadCounts = Array.from({ length: 91 }, (_, p) => {
    const arr = new Int32Array(91);
    const rowOffset = p * 91;
    for (let t = 0; t <= 90; t++) {
      arr[t] = hpcTensor.dyadMatrix[rowOffset + t];
    }
    return arr;
  });

  const targetPairCounts = new Map<number, number>();
  const activeConditionedPairHits = new Map<number, number>();

  // Reconstruction des 4005 paires depuis le tenseur compact
  let pIdx = 0;
  for (let t1 = 1; t1 <= 89; t1++) {
    for (let t2 = t1 + 1; t2 <= 90; t2++) {
      const occ = hpcTensor.targetPairHits[pIdx];
      if (occ > 0) {
        const pairKey = t1 * 100 + t2;
        targetPairCounts.set(pairKey, occ);
        const condHits = hpcTensor.conditionedPairHits[pIdx];
        if (condHits > 0) {
          activeConditionedPairHits.set(pairKey, condHits);
        }
      }
      pIdx++;
    }
  }

  // 4. Fréquence des déclencheurs bivariés (paire source p1, p2 -> t)
  const activeBivariateHits = new Map<number, number>();
  const bivariatePairTotalObservations = new Map<string, number>();
  const bivariateTargetTransitions = new Map<string, Int32Array>();

  // Évaluation chronologique des marges et déclencheurs bivariés
  for (const pair of pairedPairs) {
    const pw = pair.predWinners.filter(n => n >= 1 && n <= 90);
    const tw = pair.targetWinners.filter(n => n >= 1 && n <= 90);

    for (const p of pw) {
      predNumberCounts[p]++;
    }

    for (const t of tw) {
      targetNumberCounts[t]++;
    }

    // Déclencheurs bivariés sources (p1, p2)
    const nPreds = pw.length;
    for (let i = 0; i < nPreds; i++) {
      for (let j = i + 1; j < nPreds; j++) {
        const p1 = Math.min(pw[i], pw[j]);
        const p2 = Math.max(pw[i], pw[j]);
        const pairKeyStr = `${p1}_${p2}`;
        bivariatePairTotalObservations.set(
          pairKeyStr,
          (bivariatePairTotalObservations.get(pairKeyStr) || 0) + 1
        );

        let targetArr = bivariateTargetTransitions.get(pairKeyStr);
        if (!targetArr) {
          targetArr = new Int32Array(91);
          bivariateTargetTransitions.set(pairKeyStr, targetArr);
        }
        for (const t of tw) {
          targetArr[t]++;
        }
      }
    }
  }

  // A. Construction des Paires Cibles Conditionnées (Top Paires)
  const conditionedPairsList: InterDrawTargetPairCooccurrence[] = [];
  const totalActivePredWeight = Array.from(activePredSet).reduce(
    (acc, p) => acc + (predNumberCounts[p] || 0),
    0
  );
  const activePredWeightNorm = Math.max(1, totalActivePredWeight);

  for (const [pairKey, occ] of targetPairCounts.entries()) {
    const t1 = Math.floor(pairKey / 100);
    const t2 = pairKey % 100;
    const condHits = activeConditionedPairHits.get(pairKey) || 0;

    // Probabilité conditionnée lissée de Laplace
    const jointConditionedProb = (condHits + laplaceAlpha * THEORETICAL_PAIR_PROB) /
      (activePredWeightNorm + laplaceAlpha);

    const lift = jointConditionedProb / THEORETICAL_PAIR_PROB;
    const pmi = Math.log(Math.max(1e-4, lift));

    // Z-score binomial standardisé
    const variance = (THEORETICAL_PAIR_PROB * (1.0 - THEORETICAL_PAIR_PROB)) / (sampleSize + 1);
    const zScore = (jointConditionedProb - THEORETICAL_PAIR_PROB) / Math.max(1e-6, Math.sqrt(variance));

    // Confiance continue ancrée sur la significativité statistique réelle du z-score :
    // logistic(z − z95) vaut exactement 0.5 au seuil gaussien 95%, et encode
    // simultanément l'amplitude de l'écart et la taille d'échantillon (via la variance).
    const confidence = Math.round((1.0 / (1.0 + Math.exp(-(zScore - Z95_GAUSS)))) * 100) / 100;

    const score = Math.round(continuousSigmoid(zScore) * 10) / 10;

    // Détection des numéros déclencheurs parmi le prédécesseur actif
    const triggers: number[] = [];
    for (const p of activePredSet) {
      if (dyadCounts[p][t1] > 0 && dyadCounts[p][t2] > 0) {
        triggers.push(p);
      }
    }

    conditionedPairsList.push({
      pair: [t1, t2],
      label: `${t1 < 10 ? '0' + t1 : t1} - ${t2 < 10 ? '0' + t2 : t2}`,
      historicalOccurrences: occ,
      jointConditionedProb: Number((jointConditionedProb * 100).toFixed(3)),
      lift: Number(lift.toFixed(2)),
      pmi: Number(pmi.toFixed(3)),
      zScore: Number(zScore.toFixed(2)),
      confidence,
      score,
      triggerSources: triggers
    });
  }

  conditionedPairsList.sort((a, b) => b.score - a.score || b.lift - a.lift || b.historicalOccurrences - a.historicalOccurrences);
  const topConditionedPairs = conditionedPairsList.slice(0, reportCap);

  // B. Construction des Dyades Croisées (p -> t)
  const crossDyadsList: InterDrawCrossDyad[] = [];
  for (let p = 1; p <= 90; p++) {
    const pTotal = predNumberCounts[p];
    if (pTotal === 0) continue;

    for (let t = 1; t <= 90; t++) {
      const occ = dyadCounts[p][t];
      if (occ === 0) continue;

      const prob = (occ + laplaceAlpha * THEORETICAL_SINGLE_PROB) / (pTotal + laplaceAlpha);
      const lift = prob / THEORETICAL_SINGLE_PROB;

      const tTotal = targetNumberCounts[t];
      const union = pTotal + tTotal - occ;
      const jaccard = union > 0 ? occ / union : 0;

      const variance = (THEORETICAL_SINGLE_PROB * (1.0 - THEORETICAL_SINGLE_PROB)) / (pTotal + 1);
      const zScore = (prob - THEORETICAL_SINGLE_PROB) / Math.max(1e-6, Math.sqrt(variance));
      const score = Math.round(continuousSigmoid(zScore) * 10) / 10;

      crossDyadsList.push({
        sourceNumber: p,
        targetNumber: t,
        occurrences: occ,
        probability: Number((prob * 100).toFixed(2)),
        lift: Number(lift.toFixed(2)),
        jaccard: Number(jaccard.toFixed(3)),
        zScore: Number(zScore.toFixed(2)),
        score,
        isActiveInCurrentPred: activePredSet.has(p)
      });
    }
  }

  crossDyadsList.sort((a, b) => b.score - a.score || b.lift - a.lift || b.occurrences - a.occurrences);
  const topCrossDyads = crossDyadsList.slice(0, reportCap);
  const activeCrossDyads = crossDyadsList.filter(d => d.isActiveInCurrentPred).slice(0, reportCap);

  // C. Déclencheurs Bivariés Sources (p1, p2 -> t)
  const bivariateTriggersList: InterDrawBivariateTrigger[] = [];
  for (const [pairKeyStr, targetArr] of bivariateTargetTransitions.entries()) {
    const [p1Str, p2Str] = pairKeyStr.split('_');
    const p1 = parseInt(p1Str, 10);
    const p2 = parseInt(p2Str, 10);
    const pairOcc = bivariatePairTotalObservations.get(pairKeyStr) || 0;
    if (pairOcc === 0) continue;

    const isActive = activePredSet.has(p1) && activePredSet.has(p2);

    for (let t = 1; t <= 90; t++) {
      const occ = targetArr[t];
      if (occ === 0) continue;

      const prob = (occ + laplaceAlpha * THEORETICAL_SINGLE_PROB) / (pairOcc + laplaceAlpha);
      const lift = prob / THEORETICAL_SINGLE_PROB;
      const zScore = (prob - THEORETICAL_SINGLE_PROB) /
        Math.max(1e-6, Math.sqrt((THEORETICAL_SINGLE_PROB * (1.0 - THEORETICAL_SINGLE_PROB)) / (pairOcc + 1)));
      const score = Math.round(continuousSigmoid(zScore) * 10) / 10;

      bivariateTriggersList.push({
        sourcePair: [p1, p2],
        targetNumber: t,
        occurrences: occ,
        pairOccurrences: pairOcc,
        probability: Number((prob * 100).toFixed(2)),
        lift: Number(lift.toFixed(2)),
        score,
        isActiveInCurrentPred: isActive
      });
    }
  }

  bivariateTriggersList.sort((a, b) => b.score - a.score || b.lift - a.lift || b.occurrences - a.occurrences);
  const bivariateTriggers = bivariateTriggersList.slice(0, reportCap);
  const activeBivariateTriggers = bivariateTriggersList.filter(bt => bt.isActiveInCurrentPred).slice(0, reportCap);

  return {
    sampleSize,
    theoreticalPairProb: THEORETICAL_PAIR_PROB,
    topConditionedPairs,
    topCrossDyads,
    activeCrossDyads,
    bivariateTriggers,
    activeBivariateTriggers
  };
};

// ============================================================================
// CALCULATEUR DÉTERMINISTE DES PATTERNS STRUCTURELS INTER-TIRAGES
// ============================================================================

export const analyzeInterDrawPatterns = (
  pairedPairs: { predWinners: number[]; targetWinners: number[] }[],
  activePredNumbers: number[],
  sampleSize: number = pairedPairs.length,
  laplaceAlpha: number = 1.0
): InterDrawPatternReport => {
  const activePred = activePredNumbers.filter(n => n >= 1 && n <= 90);

  // Capacité de rapport dérivée : √n (heuristique statistique canonique), plancher = 5.
  const reportCap = Math.max(NUMBERS_PER_DRAW, Math.ceil(Math.sqrt(Math.max(1, sampleSize))));

  // --------------------------------------------------------------------------
  // 1. PATTERN DE PARITÉ
  // --------------------------------------------------------------------------
  const predEvenCount = activePred.filter(n => n % 2 === 0).length;
  const predOddCount = 5 - predEvenCount;
  const predRatioLabel = `${predEvenCount}P - ${predOddCount}I`;

  // Matrice de transition paritaire 6x6 (nb pairs source -> nb pairs cible)
  const parityTransitionCounts = Array.from({ length: 6 }, () => new Int32Array(6));
  const parityPredTotals = new Int32Array(6);

  for (const pair of pairedPairs) {
    const pwEvens = pair.predWinners.filter(n => n % 2 === 0).length;
    const twEvens = pair.targetWinners.filter(n => n % 2 === 0).length;
    if (pwEvens >= 0 && pwEvens <= 5 && twEvens >= 0 && twEvens <= 5) {
      parityTransitionCounts[pwEvens][twEvens]++;
      parityPredTotals[pwEvens]++;
    }
  }

  // Distribution conditionnelle des transitions pour la parité active
  const activeParityTotal = parityPredTotals[predEvenCount];
  const parityTransitions: {
    targetEvenCount: number;
    probability: number;
    historicalCount: number;
    label: string;
  }[] = [];

  let expectedTargetEven = 0;
  let transitionEntropy = 0;

  for (let k = 0; k <= 5; k++) {
    const occ = parityTransitionCounts[predEvenCount][k];
    const prior = HYPERGEOMETRIC_PARITY_EXPECTED[k];
    const prob = activeParityTotal > 0
      ? (occ + laplaceAlpha * prior) / (activeParityTotal + laplaceAlpha)
      : prior;

    parityTransitions.push({
      targetEvenCount: k,
      probability: Number((prob * 100).toFixed(2)),
      historicalCount: occ,
      label: `${k}P - ${5 - k}I`
    });

    expectedTargetEven += k * prob;
    if (prob > 1e-6) {
      transitionEntropy -= prob * Math.log2(prob);
    }
  }

  expectedTargetEven = Number(expectedTargetEven.toFixed(2));
  const expectedTargetOdd = Number((5 - expectedTargetEven).toFixed(2));

  // Qualification continue de la tendance dominante — bandes dérivées de la loi hypergéométrique
  const medianEven = 2.5; // Espérance théorique exacte (45 pairs / 45 impairs)
  let parityVariance = 0;
  for (let k = 0; k <= 5; k++) {
    parityVariance += Math.pow(k - medianEven, 2) * HYPERGEOMETRIC_PARITY_EXPECTED[k];
  }
  // Erreur standard de l'espérance estimée (σ/√n) : bande d'équilibre à 1 erreur standard
  const paritySeMean = Math.sqrt(parityVariance / Math.max(1, activeParityTotal));
  let dominantTendency: 'EQUILIBRE_REVERSION' | 'INERTIE_PAIR' | 'INERTIE_IMPAIR' | 'INVERSION_POLAIRE';
  let tendencyLabel: string;

  if (Math.abs(expectedTargetEven - medianEven) <= paritySeMean) {
    dominantTendency = 'EQUILIBRE_REVERSION';
    tendencyLabel = 'Retour à l’Équilibre Harmonique (2.5P / 2.5I)';
  } else if (predEvenCount > medianEven && expectedTargetEven > medianEven) {
    dominantTendency = 'INERTIE_PAIR';
    tendencyLabel = 'Inertie Structurale aux Numéros Pairs';
  } else if (predEvenCount < medianEven && expectedTargetEven < medianEven) {
    dominantTendency = 'INERTIE_IMPAIR';
    tendencyLabel = 'Inertie Structurale aux Numéros Impairs';
  } else {
    dominantTendency = 'INVERSION_POLAIRE';
    tendencyLabel = 'Inversion de Polarité Paritaire';
  }

  // Force de tendance en unités d'erreurs standard, ancrée au seuil gaussien 95%
  const tendencyStrength = Math.round(
    continuousSigmoid((Math.abs(expectedTargetEven - medianEven) / Math.max(1e-6, paritySeMean)) - Z95_GAUSS) * 10
  ) / 10;

  const parityPattern: InterDrawParityPattern = {
    predEvenCount,
    predOddCount,
    predRatioLabel,
    transitionDistribution: parityTransitions,
    expectedTargetEven,
    expectedTargetOdd,
    dominantTendency,
    tendencyLabel,
    tendencyStrength,
    transitionEntropy: Number(transitionEntropy.toFixed(3))
  };

  // --------------------------------------------------------------------------
  // 2. PATTERN DE FLUX INTER-DIZAINES
  // --------------------------------------------------------------------------
  const predDecadeCounts = new Array(9).fill(0);
  for (const n of activePred) {
    predDecadeCounts[getNumberDecade(n)]++;
  }
  const activeDecades = predDecadeCounts
    .map((cnt, idx) => (cnt > 0 ? idx : -1))
    .filter(idx => idx >= 0);

  // Matrice de transition 9x9 des dizaines
  const decadeTransitionCounts = Array.from({ length: 9 }, () => new Int32Array(9));
  const decadeSourceTotals = new Int32Array(9);

  for (const pair of pairedPairs) {
    for (const p of pair.predWinners) {
      const dp = getNumberDecade(p);
      decadeSourceTotals[dp]++;
      for (const t of pair.targetWinners) {
        const dt = getNumberDecade(t);
        decadeTransitionCounts[dp][dt]++;
      }
    }
  }

  // Matrice de flux normalisée et détection des transferts dominants
  const decadeFluxMatrix: number[][] = Array.from({ length: 9 }, () => new Array(9).fill(0));
  const topDecadeFluxes: InterDrawDecadeFlux[] = [];

  for (let d1 = 0; d1 < 9; d1++) {
    const sTot = decadeSourceTotals[d1];
    for (let d2 = 0; d2 < 9; d2++) {
      const occ = decadeTransitionCounts[d1][d2];
      const cap = getDecadeTheoreticalCapacity(d2);
      const prob = sTot > 0 ? (occ + laplaceAlpha * cap) / (sTot + laplaceAlpha) : cap;
      decadeFluxMatrix[d1][d2] = Number(prob.toFixed(4));

      const lift = prob / cap;
      if (occ > 0 && activeDecades.includes(d1)) {
        topDecadeFluxes.push({
          fromDecade: d1,
          toDecade: d2,
          fromLabel: DECADE_LABELS[d1],
          toLabel: DECADE_LABELS[d2],
          occurrences: occ,
          probability: Number((prob * 100).toFixed(2)),
          lift: Number(lift.toFixed(2))
        });
      }
    }
  }

  topDecadeFluxes.sort((a, b) => b.lift - a.lift || b.occurrences - a.occurrences);

  // Excitation globale de chaque dizaine cible stimulée par les dizaines actives
  const stimulatedDecades = Array.from({ length: 9 }, (_, dTarget) => {
    let weightedProbSum = 0;
    let totalWeight = 0;

    for (const dSource of activeDecades) {
      const weight = predDecadeCounts[dSource];
      weightedProbSum += weight * decadeFluxMatrix[dSource][dTarget];
      totalWeight += weight;
    }

    const capTarget = getDecadeTheoreticalCapacity(dTarget);
    const avgProb = totalWeight > 0 ? weightedProbSum / totalWeight : capTarget;
    const lift = avgProb / capTarget;
    // Z-score binomial exact : écart à la capacité théorique normalisé par
    // l'erreur standard du flux agrégé (√(cap(1−cap)/n)) — aucun multiplicateur arbitraire.
    const fluxSe = Math.sqrt((capTarget * (1.0 - capTarget)) / Math.max(1, totalWeight));
    const zScore = (avgProb - capTarget) / Math.max(1e-6, fluxSe);
    const excitationScore = Math.round(continuousSigmoid(zScore) * 10) / 10;

    // Numéros appartenant à cette dizaine
    const startNum = dTarget === 0 ? 1 : dTarget * 10;
    const endNum = dTarget === 8 ? 90 : dTarget * 10 + 9;
    const topNums: number[] = [];
    for (let num = startNum; num <= endNum; num++) {
      topNums.push(num);
    }

    return {
      decade: dTarget,
      label: DECADE_LABELS[dTarget],
      excitationScore,
      lift: Number(lift.toFixed(2)),
      topNumbers: topNums.slice(0, NUMBERS_PER_DRAW)
    };
  });

  stimulatedDecades.sort((a, b) => b.excitationScore - a.excitationScore);

  const decadePattern: InterDrawDecadePattern = {
    predDecadeCounts,
    activeDecades,
    decadeFluxMatrix,
    topDecadeFluxes: topDecadeFluxes.slice(0, reportCap),
    stimulatedDecades
  };

  // --------------------------------------------------------------------------
  // 3. PATTERN DE CASCADE & VOISINAGE UNITAIRE (+1, -1, +2, -2)
  // --------------------------------------------------------------------------
  let cascadeTotalOpportunities = 0;
  let cascadeHits = 0;
  let plusOneHits = 0;
  let minusOneHits = 0;

  // Fréquence empirique des transitions par pas relatif delta dans [-2, +2]
  const deltaCounts = new Map<string, number>(); // `${sourceNum}_${delta}` -> count
  const sourceAttemptTotals = new Int32Array(91);

  for (const pair of pairedPairs) {
    const targetSet = new Set(pair.targetWinners);
    for (const p of pair.predWinners) {
      if (p < 1 || p > 90) continue;
      sourceAttemptTotals[p]++;
      cascadeTotalOpportunities++;

      let hasNeighbour = false;
      const deltas = [-1, 1, -2, 2];

      for (const d of deltas) {
        const candidate = p + d;
        if (candidate >= 1 && candidate <= 90 && targetSet.has(candidate)) {
          hasNeighbour = true;
          const k = `${p}_${d}`;
          deltaCounts.set(k, (deltaCounts.get(k) || 0) + 1);

          if (d === 1) plusOneHits++;
          if (d === -1) minusOneHits++;
        }
      }

      if (hasNeighbour) {
        cascadeHits++;
      }
    }
  }

  // Espérance théorique exacte « au moins un voisin ±1/±2 » (constante module, ≈ 20.43%),
  // définie de manière strictement identique au dénombrement empirique ci-dessus.
  const overallCascadeRate = cascadeTotalOpportunities > 0
    ? (cascadeHits / cascadeTotalOpportunities) * 100
    : THEORETICAL_CASCADE_EXPECTED;
  const overallCascadeLift = overallCascadeRate / THEORETICAL_CASCADE_EXPECTED;

  // Biais directionnel continu — bande de neutralité à 1 erreur standard sous H0 (Var[drift] = 1/n)
  const totalDirectionalHits = plusOneHits + minusOneHits;
  const directionalDrift = totalDirectionalHits > 0
    ? (plusOneHits - minusOneHits) / totalDirectionalHits
    : 0;
  const directionalSe = totalDirectionalHits > 0 ? 1.0 / Math.sqrt(totalDirectionalHits) : 1.0;

  let directionalLabel: 'NEUTRE' | 'PROPAGATION_ASCENDANTE' | 'PROPAGATION_DESCENDANTE';
  if (directionalDrift > directionalSe) {
    directionalLabel = 'PROPAGATION_ASCENDANTE';
  } else if (directionalDrift < -directionalSe) {
    directionalLabel = 'PROPAGATION_DESCENDANTE';
  } else {
    directionalLabel = 'NEUTRE';
  }

  // Résonances actives pour les numéros du tirage précédent
  const activeResonances: InterDrawCascadeNeighbour[] = [];
  for (const p of activePred) {
    const deltas = [-1, 1, -2, 2];
    for (const d of deltas) {
      const target = p + d;
      if (target >= 1 && target <= 90) {
        const occ = deltaCounts.get(`${p}_${d}`) || 0;
        const pTot = sourceAttemptTotals[p] || 0;
        const singleExpected = (NUMBERS_PER_DRAW / TOTAL_NUMBERS) * 100; // exact 5/90 ≈ 5.55%
        const rate = pTot > 0 ? (occ / pTot) * 100 : singleExpected;
        const lift = rate / singleExpected;
        // Z-score binomial exact du taux empirique vs espérance théorique (aucun multiplicateur arbitraire)
        const singleSe = Math.sqrt(
          ((singleExpected / 100) * (1.0 - singleExpected / 100)) / Math.max(1, pTot)
        ) * 100;
        const z = (rate - singleExpected) / Math.max(1e-6, singleSe);
        const score = Math.round(continuousSigmoid(z) * 10) / 10;

        activeResonances.push({
          sourceNumber: p,
          targetNeighbour: target,
          delta: d,
          type: Math.abs(d) === 1 ? 'VOISIN_DIRECT' : 'SAUT_DOUBLE',
          occurrences: occ,
          empiricalRate: Number(rate.toFixed(1)),
          lift: Number(lift.toFixed(2)),
          score
        });
      }
    }
  }

  activeResonances.sort((a, b) => b.score - a.score || b.lift - a.lift);

  const cascadePattern: InterDrawCascadePattern = {
    activeResonances: activeResonances.slice(0, reportCap),
    overallCascadeRate: Number(overallCascadeRate.toFixed(1)),
    overallCascadeExpected: Number(THEORETICAL_CASCADE_EXPECTED.toFixed(1)),
    overallCascadeLift: Number(overallCascadeLift.toFixed(2)),
    directionalDrift: Number(directionalDrift.toFixed(3)),
    directionalLabel
  };

  // --------------------------------------------------------------------------
  // 4. PATTERN DE DÉRIVE DES SOMMES & CENTROÏDE (RÉGRESSION VERS LA MOYENNE)
  // --------------------------------------------------------------------------
  const theoreticalMean = (NUMBERS_PER_DRAW * (TOTAL_NUMBERS + 1)) / 2; // 5 * 45.5 = 227.5
  // Variance théorique d'une somme de n numéros tirés sans remise parmi N
  const theoreticalVar = NUMBERS_PER_DRAW * ((TOTAL_NUMBERS * TOTAL_NUMBERS - 1) / 12) * ((TOTAL_NUMBERS - NUMBERS_PER_DRAW) / (TOTAL_NUMBERS - 1));
  const theoreticalStd = Math.sqrt(theoreticalVar); // ~56.78

  const predSum = activePred.reduce((a, b) => a + b, 0);
  const predMean = Number((predSum / Math.max(1, activePred.length)).toFixed(1));

  const deltas: number[] = [];
  const predSumsHist: number[] = [];

  for (const pair of pairedPairs) {
    const sP = pair.predWinners.reduce((a, b) => a + b, 0);
    const sT = pair.targetWinners.reduce((a, b) => a + b, 0);
    predSumsHist.push(sP);
    deltas.push(sT - sP);
  }

  const nPairs = deltas.length;
  let historicalDeltaMean = 0;
  let historicalDeltaStd = theoreticalStd;
  let reversionCorrelation = -0.5; // Corrélation typique de retour à la moyenne
  let predSumStd = theoreticalStd;

  if (nPairs > 1) {
    historicalDeltaMean = deltas.reduce((a, b) => a + b, 0) / nPairs;
    const varDelta = deltas.reduce((acc, d) => acc + Math.pow(d - historicalDeltaMean, 2), 0) / (nPairs - 1);
    historicalDeltaStd = Math.max(1.0, Math.sqrt(varDelta));

    // Corrélation de Pearson entre somme précédente et delta
    const meanSP = predSumsHist.reduce((a, b) => a + b, 0) / nPairs;
    let cov = 0;
    let varSP = 0;
    for (let i = 0; i < nPairs; i++) {
      cov += (predSumsHist[i] - meanSP) * (deltas[i] - historicalDeltaMean);
      varSP += Math.pow(predSumsHist[i] - meanSP, 2);
    }
    predSumStd = Math.sqrt(varSP / nPairs);
    if (varSP > 0 && varDelta > 0) {
      reversionCorrelation = cov / Math.sqrt(varSP * varDelta);
    }
  }

  // Projection optimale de la somme cible via régression linéaire continue
  // Pente = r · (σ_delta / σ_sommesPrécédentes), les deux échelles étant empiriques.
  const regressionSlope = reversionCorrelation * (historicalDeltaStd / Math.max(1e-6, predSumStd));
  const predictedDelta = historicalDeltaMean + regressionSlope * (predSum - theoreticalMean);
  // Bornes combinatoires exactes : somme minimale 1+2+3+4+5 = 15, maximale 86+87+88+89+90 = 435.
  const optimalProjectedSum = Math.max(15, Math.min(435, Math.round(predSum + predictedDelta)));

  // Incertitude résiduelle exacte de la régression : σ_delta · √(1 − r²)
  const residualStd = historicalDeltaStd * Math.sqrt(Math.max(0, 1 - reversionCorrelation * reversionCorrelation));
  const projectedMin = Math.max(15, Math.round(optimalProjectedSum - residualStd));
  const projectedMax = Math.min(435, Math.round(optimalProjectedSum + residualStd));

  // Mouvement compensateur significatif : |delta prédit| dépasse 1 erreur standard résiduelle
  let reversionTendency: 'HAUSSE_COMPENSATRICE' | 'BAISSE_COMPENSATRICE' | 'STABLE';
  if (predictedDelta > residualStd) {
    reversionTendency = 'HAUSSE_COMPENSATRICE';
  } else if (predictedDelta < -residualStd) {
    reversionTendency = 'BAISSE_COMPENSATRICE';
  } else {
    reversionTendency = 'STABLE';
  }

  const centroidPattern: InterDrawCentroidPattern = {
    predSum,
    predMean,
    theoreticalMean,
    theoreticalStd: Number(theoreticalStd.toFixed(2)),
    historicalDeltaMean: Number(historicalDeltaMean.toFixed(1)),
    historicalDeltaStd: Number(historicalDeltaStd.toFixed(1)),
    reversionCorrelation: Number(reversionCorrelation.toFixed(3)),
    projectedSumRange: {
      min: projectedMin,
      max: projectedMax,
      optimal: optimalProjectedSum
    },
    reversionTendency
  };

  // --------------------------------------------------------------------------
  // 5. PATTERN DE RÉTENTION MULTI-ORDRES (DISTRIBUTION DES REPETS 0, 1, 2, 3+)
  // --------------------------------------------------------------------------
  const retentionCounts = [0, 0, 0, 0]; // 0, 1, 2, >=3
  let totalRetentionPairs = 0;

  for (const pair of pairedPairs) {
    totalRetentionPairs++;
    const setP = new Set(pair.predWinners);
    let common = 0;
    for (const tw of pair.targetWinners) {
      if (setP.has(tw)) common++;
    }
    if (common === 0) retentionCounts[0]++;
    else if (common === 1) retentionCounts[1]++;
    else if (common === 2) retentionCounts[2]++;
    else retentionCounts[3]++;
  }

  const rTotal = Math.max(1, totalRetentionPairs);
  const repeat0Rate = Number(((retentionCounts[0] / rTotal) * 100).toFixed(1));
  const repeat1Rate = Number(((retentionCounts[1] / rTotal) * 100).toFixed(1));
  const repeat2Rate = Number(((retentionCounts[2] / rTotal) * 100).toFixed(1));
  const repeat3PlusRate = Number(((retentionCounts[3] / rTotal) * 100).toFixed(1));

  const expectedNonZero = (1.0 - HYPERGEOMETRIC_RETENTION_EXPECTED.p0) * 100;
  const observedNonZero = 100 - repeat0Rate;
  const persistenceIndex = Number((observedNonZero / expectedNonZero).toFixed(2));

  // Z-scores binomiaux exacts vs attentes hypergéométriques (zéro seuil arbitraire) :
  // le mode dominant est le signal statistiquement significatif (≥ z95) le plus fort.
  const p1Theory = HYPERGEOMETRIC_RETENTION_EXPECTED.p1;
  const zRepeat1 = (repeat1Rate / 100 - p1Theory) /
    Math.max(1e-9, Math.sqrt((p1Theory * (1 - p1Theory)) / rTotal));
  const p23Theory = HYPERGEOMETRIC_RETENTION_EXPECTED.p2 + HYPERGEOMETRIC_RETENTION_EXPECTED.p3Plus;
  const zRepeat23 = ((repeat2Rate + repeat3PlusRate) / 100 - p23Theory) /
    Math.max(1e-9, Math.sqrt((p23Theory * (1 - p23Theory)) / rTotal));

  let dominantRetentionMode: 'RENOUVELLEMENT_TOTAL' | 'REPORT_UNITAIRE' | 'REPORT_MULTIPLE';
  if (zRepeat1 >= Z95_GAUSS && zRepeat1 >= zRepeat23) {
    dominantRetentionMode = 'REPORT_UNITAIRE';
  } else if (zRepeat23 > Z95_GAUSS) {
    dominantRetentionMode = 'REPORT_MULTIPLE';
  } else {
    dominantRetentionMode = 'RENOUVELLEMENT_TOTAL';
  }

  const retentionPattern: InterDrawRetentionPattern = {
    repeat0Rate,
    repeat1Rate,
    repeat2Rate,
    repeat3PlusRate,
    hypergeometricExpected: {
      p0: Number((HYPERGEOMETRIC_RETENTION_EXPECTED.p0 * 100).toFixed(1)),
      p1: Number((HYPERGEOMETRIC_RETENTION_EXPECTED.p1 * 100).toFixed(1)),
      p2: Number((HYPERGEOMETRIC_RETENTION_EXPECTED.p2 * 100).toFixed(1)),
      p3Plus: Number((HYPERGEOMETRIC_RETENTION_EXPECTED.p3Plus * 100).toFixed(2))
    },
    persistenceIndex,
    dominantRetentionMode
  };

  return {
    parity: parityPattern,
    decades: decadePattern,
    cascade: cascadePattern,
    centroid: centroidPattern,
    retention: retentionPattern
  };
};
