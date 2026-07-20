import type { AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";

export interface OverfittingDiagnostics {
  isOverfitting: boolean;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  effectSize: number;
  meanTrainError: number;
  meanValError: number;
}

export interface GenomeEvaluation {
  fitness: number;
  avgHits: number;
  brier: number;
  entropy: number;
  instabilityPenalty: number;
  overconcentrationPenalty: number;
}

/**
 * Effectue un bootstrap de percentile pour déterminer si la différence de performance
 * (erreur de validation - erreur d'entraînement) est significativement supérieure à 0 (surapprentissage).
 * Niveau alpha = 0.05 (Intervalle de confiance à 95% unilatéral).
 */
export const runBootstrapOverfittingTest = (
  trainErrors: number[],
  valErrors: number[],
  numResamples: number = 200
): OverfittingDiagnostics => {
  const N = trainErrors.length;
  const M = valErrors.length;

  const trainMean = N > 0 ? trainErrors.reduce((a, b) => a + b, 0) / N : 0;
  const valMean = M > 0 ? valErrors.reduce((a, b) => a + b, 0) / M : 0;

  if (N < 5 || M < 5) {
    return {
      isOverfitting: false,
      pValue: 0.5,
      ciLower: 0,
      ciUpper: 0,
      effectSize: 0,
      meanTrainError: trainMean,
      meanValError: valMean,
    };
  }

  // Calcul de la taille d'effet Cohen's d (décalage normalisé des erreurs)
  const trainVar = trainErrors.reduce((sum, x) => sum + Math.pow(x - trainMean, 2), 0) / N;
  const valVar = valErrors.reduce((sum, x) => sum + Math.pow(x - valMean, 2), 0) / M;
  const pooledStdDev = Math.sqrt((trainVar + valVar) / 2) || Number.EPSILON;
  const effectSize = (valMean - trainMean) / pooledStdDev;

  // Déterminisme par LCG pour le bootstrap (reproductibilité totale)
  let seed = 42;
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const bootstrapDiffMeans: number[] = [];
  for (let b = 0; b < numResamples; b++) {
    let sumTrain = 0;
    for (let i = 0; i < N; i++) {
      const randIdx = Math.floor(lcg() * N);
      sumTrain += trainErrors[randIdx];
    }
    const bTrainMean = sumTrain / N;

    let sumVal = 0;
    for (let i = 0; i < M; i++) {
      const randIdx = Math.floor(lcg() * M);
      sumVal += valErrors[randIdx];
    }
    const bValMean = sumVal / M;

    bootstrapDiffMeans.push(bValMean - bTrainMean);
  }

  bootstrapDiffMeans.sort((a, b) => a - b);

  // Pour un test unilatéral au seuil alpha = 0.05
  const ciLowerIdx = Math.floor(numResamples * 0.05);
  const ciUpperIdx = Math.floor(numResamples * 0.95);
  const ciLower = bootstrapDiffMeans[ciLowerIdx] ?? 0;
  const ciUpper = bootstrapDiffMeans[ciUpperIdx] ?? 0;

  // Calcul de la p-value : proportion de rééchantillonnages où la différence est <= 0
  const countNull = bootstrapDiffMeans.filter((diff) => diff <= 0).length;
  const pValue = countNull / numResamples;

  // Il y a surapprentissage statistiquement significatif si la borne inférieure à 95% est strictement supérieure à 0
  // On pondère aussi avec la taille d'effet pour plus d'honnêteté scientifique
  const isOverfitting = ciLower > 0 && effectSize > 0.1;

  return {
    isOverfitting,
    pValue,
    ciLower,
    ciUpper,
    effectSize: parseFloat(effectSize.toFixed(4)),
    meanTrainError: parseFloat(trainMean.toFixed(4)),
    meanValError: parseFloat(valMean.toFixed(4)),
  };
};

/**
 * Calculateur de Fitness Multi-Objectif sans nombres magiques.
 * Évalue la performance d'un génome par rapport aux votes cumulés de l'historique d'entraînement,
 * en ajoutant des pénalités d'instabilité temporelle et de surconcentration algorithmique.
 */
export const evaluateGenomeFitness = (
  w: AlgoWeights,
  breakdownsByDraw: Record<number, Record<number, Partial<Record<AlgoKey, number>>>>,
  actualWinnersByDraw: Record<number, number[]>,
  hurstExponent: number,
  algoKeys: AlgoKey[]
): GenomeEvaluation => {
  let totalHits = 0;
  let totalBrier = 0;
  let evaluatedDraws = 0;
  const numAlgos = algoKeys.length;

  // 1. Normalisation des poids du génome sur le simplexe de probabilité
  const sumW = Object.values(w).reduce((a, b) => a + b, 0) || Number.EPSILON;
  const normW: Record<AlgoKey, number> = {} as any;
  algoKeys.forEach((k) => {
    normW[k] = (w[k] ?? 0) / sumW;
  });

  // 2. Entropie de Shannon normalisée des estimateurs
  let entropySum = 0;
  algoKeys.forEach((k) => {
    const p = normW[k];
    if (p > Number.EPSILON) {
      entropySum -= p * Math.log2(p);
    }
  });
  const maxEntropy = Math.log2(numAlgos) || 1.0;
  const weightsEntropy = entropySum / maxEntropy;

  // 3. Calcul de la concentration de poids (Indice de Herfindahl-Hirschman standardisé)
  const hhi = Object.values(normW).reduce((sum, p) => sum + p * p, 0);
  const minHHI = 1.0 / numAlgos;
  const concentrationIndex = (hhi - minHHI) / (1.0 - minHHI || 1.0);
  // Pénalité de concentration continue : favorise les solutions diversifiées et complémentaires
  const overconcentrationPenalty = concentrationIndex * 1.5;

  const drawIndices = Object.keys(breakdownsByDraw).map(Number);
  const hitsPerDraw: number[] = [];

  for (const dIdx of drawIndices) {
    const breakdown = breakdownsByDraw[dIdx];
    const winners = actualWinnersByDraw[dIdx];
    if (!breakdown || !winners) continue;

    const scores = new Float32Array(91);
    let sumScore = 0;

    for (let n = 1; n <= 90; n++) {
      const numBreakdown = breakdown[n] || {};
      let score = 0;
      algoKeys.forEach((k) => {
        score += normW[k] * (Number(numBreakdown[k]) || 0);
      });
      scores[n] = score;
      sumScore += score;
    }

    if (sumScore === 0) sumScore = Number.EPSILON;

    const rankedNumbers = Array.from({ length: 90 }, (_, i) => i + 1).sort(
      (a, b) => scores[b] - scores[a]
    );

    const predictedTop5 = rankedNumbers.slice(0, 5);
    const hits = predictedTop5.filter((n) => winners.includes(n)).length;
    totalHits += hits;
    hitsPerDraw.push(hits);

    // --- CALIBRATION DU LOGIT POUR LE SCORE DE BRIER ---
    // Résolution par dichotomie pour trouver C tel que sum(1 / (1 + exp(-(scores[n]*temp - C)))) = 5.0
    let low = -100.0;
    let high = 100.0;
    let scaleC = 0.0;
    
    // Mise à l'échelle des scores pour une variance numérique saine
    const maxScore = Math.max(...Array.from(scores)) || 1.0;
    const scaledScores = Array.from({ length: 90 }, (_, i) => (scores[i + 1] / maxScore) * 10.0);
    
    for (let iter = 0; iter < 15; iter++) {
      scaleC = (low + high) / 2.0;
      let sumP = 0;
      for (let i = 0; i < 90; i++) {
        sumP += 1.0 / (1.0 + Math.exp(-(scaledScores[i] - scaleC)));
      }
      if (sumP > 5.0) {
        low = scaleC;
      } else {
        high = scaleC;
      }
    }
    
    const calibratedP = new Float64Array(91);
    for (let n = 1; n <= 90; n++) {
      calibratedP[n] = 1.0 / (1.0 + Math.exp(-(scaledScores[n - 1] - scaleC)));
    }

    // Brier Score (Mesure d'incertitude et de calibration de probabilité saine [0, 1])
    let brierSum = 0;
    for (let n = 1; n <= 90; n++) {
      const p = calibratedP[n];
      const y = winners.includes(n) ? 1.0 : 0.0;
      const err = p - y;
      brierSum += err * err;
    }
    totalBrier += brierSum / 90.0;
    evaluatedDraws++;
  }

  const avgHits = evaluatedDraws > 0 ? totalHits / evaluatedDraws : 0;
  const meanBrier = evaluatedDraws > 0 ? totalBrier / evaluatedDraws : 0;

  // 4. Pénalité d'instabilité temporelle (variance des performances)
  let hitsVariance = 0;
  if (hitsPerDraw.length > 1) {
    hitsVariance =
      hitsPerDraw.reduce((sum, h) => sum + Math.pow(h - avgHits, 2), 0) /
      hitsPerDraw.length;
  }
  const instabilityPenalty = hitsVariance * 1.5;

  // 5. Formulation de la fitness multi-objectif
  const hFactor = Math.max(0.1, Math.min(0.9, hurstExponent));
  const hitsWeight = hFactor * 40.0; // Priorité à l'exactitude si Hurst est élevé
  const brierWeight = (1.0 - hFactor) * 20.0; // Priorité à la calibration si Hurst est bas
  const entropyWeight = 5.0; // Force d'entropie constante

  const fitness =
    avgHits * hitsWeight -
    meanBrier * brierWeight +
    weightsEntropy * entropyWeight -
    instabilityPenalty -
    overconcentrationPenalty;

  return {
    fitness,
    avgHits,
    brier: meanBrier,
    entropy: weightsEntropy,
    instabilityPenalty,
    overconcentrationPenalty,
  };
};
