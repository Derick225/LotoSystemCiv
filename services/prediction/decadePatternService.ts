import { DrawResult } from '../../types';
import { extractDrawNumbers } from './featureExtractor';
import { calculateFractalIndex, calculateShannonEntropy } from '../mathService';

export interface DecadeAnalysisResult {
  // Distribution par décennie (9 décennies : 0=1-10, 1=11-20, ..., 8=81-90)
  distribution: Float32Array;
  
  // Score de déséquilibre continu (0 = parfaitement équilibré, 1 = déséquilibre maximal)
  imbalanceScore: number;
  
  // Matrice de corrélation inter-dizaines (9x9)
  correlationMatrix: Float32Array[];
  
  // Score temporel projeté pour le prochain tirage par décennie (longueur 9)
  projectedTemporalScore: Float32Array;
}

/**
 * Mappe un numéro de loterie (1-90) vers son index de décennie (0-8).
 * Chaque décennie contient exactement 10 numéros :
 * - 0: 1 à 10
 * - 1: 11 à 20
 * ...
 * - 8: 81 à 90
 */
export const getDecadeIndex = (num: number): number => {
  return Math.max(0, Math.min(8, Math.floor((num - 1) / 10)));
};

/**
 * Calcule l'entropie de Shannon continue pour une distribution de fréquences donnée.
 * Utilisée pour mesurer le désordre ou l'imbalance de façon continue et déterministe.
 */
const calculateShannonImbalance = (probabilities: Float32Array): number => {
  let entropy = 0;
  const N = probabilities.length;
  for (let i = 0; i < N; i++) {
    const p = probabilities[i];
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  // L'entropie maximale théorique pour N catégories est log2(N)
  const maxEntropy = Math.log2(N);
  const normalizedEntropy = entropy / maxEntropy;
  // Déséquilibre continu = 1 - entropie normalisée
  return Math.max(0.0, Math.min(1.0, 1.0 - normalizedEntropy));
};

/**
 * Service d'analyse statistique et de prédiction des patterns de décennies.
 * Conforme aux règles d'isolation de tirage et zéro hasard.
 */
export const analyzeDecadePatterns = (
  drawName: string,
  history: DrawResult[]
): DecadeAnalysisResult => {
  const NUM_DECADES = 9;
  
  // Filtrage strict selon la règle d'isolation (TIRAGE ISOLATION RULE), sauf pseudo-tirage agrégé
  const normalizedDrawName = drawName ? drawName.trim().toLowerCase() : "";
  const isAggregatePseudoDraw = normalizedDrawName === "all" || normalizedDrawName === "all_combined";
  const filteredHistory = (drawName && !isAggregatePseudoDraw)
    ? history.filter(d => d.drawName === drawName)
    : history;

  const distribution = new Float32Array(NUM_DECADES);
  const correlationMatrix: Float32Array[] = Array.from({ length: NUM_DECADES }, () => new Float32Array(NUM_DECADES));
  const projectedTemporalScore = new Float32Array(NUM_DECADES);

  if (filteredHistory.length === 0) {
    return {
      distribution,
      imbalanceScore: 0,
      correlationMatrix,
      projectedTemporalScore: new Float32Array(NUM_DECADES).fill(1.0 / NUM_DECADES)
    };
  }

  // 1. CALCUL DU FACTEUR DE DÉCROISSANCE EXPONENTIELLE ADAPTATIF (Zéro Nombre Magique)
  const h = calculateFractalIndex(filteredHistory); // Exposant de Hurst
  const e = calculateShannonEntropy(filteredHistory).normalized; // Entropie de Shannon [0, 1]
  const adaptiveHalfLife = Math.max(5, Math.floor(15 * (1.0 + (h - 0.5) + (1.0 - e))));
  const TIME_DECAY = Math.pow(0.5, 1.0 / adaptiveHalfLife);

  // 2. DISTRIBUTION STATISTIQUE ET PRÉPARATION DES MATRICES DE VARIANCE-COVARIANCE
  const decadeCountsHistory: number[][] = [];
  let totalDecaySum = 0;

  for (let t = 0; t < filteredHistory.length; t++) {
    const draw = filteredHistory[t];
    const { winners } = extractDrawNumbers(draw);
    const decayWeight = Math.pow(TIME_DECAY, t);

    const counts = new Array(NUM_DECADES).fill(0);
    winners.forEach(num => {
      const d = getDecadeIndex(num);
      counts[d] += 1;
      distribution[d] += decayWeight;
    });

    decadeCountsHistory.push(counts);
    totalDecaySum += decayWeight;
  }

  // Normalisation de la distribution de base
  if (totalDecaySum > 0) {
    for (let d = 0; d < NUM_DECADES; d++) {
      distribution[d] = distribution[d] / totalDecaySum;
    }
  }

  // 3. SCORE DE DÉSÉQUILIBRE CONTINU
  // Normaliser la distribution pour former une vraie PDF de probabilités cumulées à 1.0
  const distributionSum = distribution.reduce((sum, val) => sum + val, 0);
  const pdfDistribution = new Float32Array(NUM_DECADES);
  if (distributionSum > 0) {
    for (let d = 0; d < NUM_DECADES; d++) {
      pdfDistribution[d] = distribution[d] / distributionSum;
    }
  } else {
    pdfDistribution.fill(1.0 / NUM_DECADES);
  }
  const imbalanceScore = calculateShannonImbalance(pdfDistribution);

  // 4. CALCUL DE LA MATRICE DE CORRÉLATION INTER-DIZAINES
  // Étape A : Calcul des moyennes (μ_d)
  const means = new Float32Array(NUM_DECADES);
  const T = decadeCountsHistory.length;
  for (let t = 0; t < T; t++) {
    for (let d = 0; d < NUM_DECADES; d++) {
      means[d] += decadeCountsHistory[t][d];
    }
  }
  for (let d = 0; d < NUM_DECADES; d++) {
    means[d] /= T;
  }

  // Étape B : Calcul des variances (Var_d) et de la covariance
  const variances = new Float32Array(NUM_DECADES);
  const covariance: Float32Array[] = Array.from({ length: NUM_DECADES }, () => new Float32Array(NUM_DECADES));

  for (let t = 0; t < T; t++) {
    const counts = decadeCountsHistory[t];
    for (let i = 0; i < NUM_DECADES; i++) {
      const devI = counts[i] - means[i];
      variances[i] += devI * devI;
      for (let j = 0; j < NUM_DECADES; j++) {
        const devJ = counts[j] - means[j];
        covariance[i][j] += devI * devJ;
      }
    }
  }

  for (let i = 0; i < NUM_DECADES; i++) {
    variances[i] /= T;
    for (let j = 0; j < NUM_DECADES; j++) {
      covariance[i][j] /= T;
    }
  }

  // Étape C : Normalisation en matrice de corrélation de Pearson
  for (let i = 0; i < NUM_DECADES; i++) {
    const stdDevI = Math.sqrt(variances[i]);
    for (let j = 0; j < NUM_DECADES; j++) {
      const stdDevJ = Math.sqrt(variances[j]);
      const denom = stdDevI * stdDevJ;
      if (denom > 1e-12) {
        correlationMatrix[i][j] = covariance[i][j] / denom;
      } else {
        correlationMatrix[i][j] = i === j ? 1.0 : 0.0;
      }
    }
  }

  // 5. CALCUL DU SCORE TEMPOREL (MODÈLE DE TRANSITION MARKOVIENNE INTER-TIRAGES)
  // On modélise la transition de l'état des décennies d'un tirage t+1 vers le tirage t.
  const transitionMatrix: Float32Array[] = Array.from({ length: NUM_DECADES }, () => new Float32Array(NUM_DECADES));
  const transitionDenominators = new Float32Array(NUM_DECADES);

  for (let t = 0; t < T - 1; t++) {
    const prevCounts = decadeCountsHistory[t + 1]; // Tirage précédent chronologique
    const currCounts = decadeCountsHistory[t];     // Tirage suivant
    const decayWeight = Math.pow(TIME_DECAY, t);

    for (let i = 0; i < NUM_DECADES; i++) {
      if (prevCounts[i] > 0) {
        for (let j = 0; j < NUM_DECADES; j++) {
          // Co-occurrence temporelle pondérée
          const transitionIntensity = prevCounts[i] * currCounts[j] * decayWeight;
          transitionMatrix[i][j] += transitionIntensity;
          transitionDenominators[i] += transitionIntensity;
        }
      }
    }
  }

  // Normalisation des lignes de la matrice de transition avec Prior Uniforme (Régularisation Bayésienne)
  const priorAlpha = Math.max(0.01, 1.0 * Math.pow(e, 2)); // Régularisé par l'entropie de Shannon globale
  for (let i = 0; i < NUM_DECADES; i++) {
    const rowSum = transitionDenominators[i];
    for (let j = 0; j < NUM_DECADES; j++) {
      const prior = pdfDistribution[j]; // Prior basé sur la distribution globale
      transitionMatrix[i][j] = (transitionMatrix[i][j] + priorAlpha * prior) / (rowSum + priorAlpha);
    }
  }

  // Projection pour le prochain tirage basé sur le tirage le plus récent (t = 0)
  const lastDrawCounts = decadeCountsHistory[0];
  if (lastDrawCounts) {
    const lastDrawSum = lastDrawCounts.reduce((sum, val) => sum + val, 0);
    if (lastDrawSum > 0) {
      for (let j = 0; j < NUM_DECADES; j++) {
        let sum = 0;
        for (let i = 0; i < NUM_DECADES; i++) {
          const pLastI = lastDrawCounts[i] / lastDrawSum;
          sum += pLastI * transitionMatrix[i][j];
        }
        projectedTemporalScore[j] = sum;
      }
    } else {
      projectedTemporalScore.set(pdfDistribution);
    }
  } else {
    projectedTemporalScore.set(pdfDistribution);
  }

  return {
    distribution,
    imbalanceScore,
    correlationMatrix,
    projectedTemporalScore
  };
};
