import { DrawResult } from "../../types";

export interface GridCoord {
  row: number;
  col: number;
}

/**
 * Maps a number (1-90) to its coordinates on a standard 10-column grid.
 */
export function getGridCoordinates(num: number): GridCoord {
  const row = Math.floor((num - 1) / 10);
  const col = (num - 1) % 10;
  return { row, col };
}

/**
 * Computes the Euclidean distance between two numbers on the standard grid.
 */
export function getEuclideanDistance(num1: number, num2: number): number {
  const coord1 = getGridCoordinates(num1);
  const coord2 = getGridCoordinates(num2);
  return Math.sqrt(
    Math.pow(coord1.row - coord2.row, 2) + Math.pow(coord1.col - coord2.col, 2)
  );
}

// Thread-safe and Draw-isolated internal cache to preserve pure performance
const hawkesIntensityCache = new Map<string, Record<number, number>>();

/**
 * Spatio-Temporal Hawkes Process (Processus de Hawkes Spatio-Temporel)
 * Modélise la contagion spatio-temporelle et les répliques ("aftershocks")
 * de manière 100% déterministe et auto-calibrée sans constantes arbitraires.
 */
export function calculateSpatioTemporalHawkes(
  history: DrawResult[],
  drawName: string
): Record<number, number> {
  if (!history || history.length === 0) {
    const fallback: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) fallback[i] = 50.0;
    return fallback;
  }

  // 1. Isolation & Caching Rule (Unique per draw name + history signature)
  const newestDraw = history[0];
  const cacheKey = `${drawName}_${history.length}_${newestDraw?.date || "nodate"}`;
  if (hawkesIntensityCache.has(cacheKey)) {
    return hawkesIntensityCache.get(cacheKey)!;
  }

  const N = history.length;
  const DOMAIN_SIZE = 90;

  // 2. Dynamic Estimation of Spatial Standard Deviation (sigmaSpatial)
  // Computes the empirical dispersion of the winning clusters in the draw history.
  let sumOfPairwiseDistances = 0;
  let countOfPairs = 0;
  const distancesList: number[] = [];

  for (const draw of history) {
    const winners = draw.gagnants;
    if (!winners || winners.length < 2) continue;
    for (let i = 0; i < winners.length; i++) {
      for (let j = i + 1; j < winners.length; j++) {
        const d = getEuclideanDistance(winners[i], winners[j]);
        distancesList.push(d);
        sumOfPairwiseDistances += d;
        countOfPairs++;
      }
    }
  }

  const meanDistance = countOfPairs > 0 ? sumOfPairwiseDistances / countOfPairs : 4.5;
  const varianceDistance = distancesList.length > 0
    ? distancesList.reduce((acc, val) => acc + Math.pow(val - meanDistance, 2), 0) / distancesList.length
    : 4.0;
  const sigmaSpatial = Math.max(1e-4, Math.sqrt(varianceDistance));

  // 3. Extraction of chronological occurrences per number
  const numIndices: Record<number, number[]> = {};
  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    numIndices[i] = [];
  }

  // history[0] is newest, history[N-1] is oldest.
  // Chronological index: oldest is 0, newest is N-1.
  for (let k = 0; k < N; k++) {
    const chronoIndex = N - 1 - k;
    const winners = history[k].gagnants;
    if (!winners) continue;
    for (const num of winners) {
      if (num >= 1 && num <= DOMAIN_SIZE) {
        numIndices[num].push(chronoIndex);
      }
    }
  }

  // 4. Continuous Parameter Estimation per Number (Background Rate, Decay, Amplitude)
  const mus = new Float64Array(DOMAIN_SIZE + 1);
  const betas = new Float64Array(DOMAIN_SIZE + 1);
  const alphas = new Float64Array(DOMAIN_SIZE + 1);

  // Compute overall Shannon Entropy to derive continuous fallbacks
  const occurrencesCounts = Object.values(numIndices).map(arr => arr.length);
  const totalOccurrences = occurrencesCounts.reduce((a, b) => a + b, 0) || 1;
  let entropySum = 0;
  for (const count of occurrencesCounts) {
    if (count > 0) {
      const p = count / totalOccurrences;
      entropySum -= p * Math.log2(p);
    }
  }
  const maxEntropy = Math.log2(DOMAIN_SIZE);
  const normalizedEntropy = Math.max(0.01, Math.min(1.0, entropySum / (maxEntropy || 1.0)));

  for (let num = 1; num <= DOMAIN_SIZE; num++) {
    const indices = numIndices[num];
    const K_num = indices.length;

    // Background rate (μ) with Laplace-style smoothing
    mus[num] = (K_num + 1) / (N + 2);

    // Mean and Variance of gaps to calibrate decay (β) and excitation (α)
    let meanGap = N;
    let varGap = 0;

    if (K_num >= 2) {
      const gaps: number[] = [];
      for (let i = 0; i < K_num - 1; i++) {
        gaps.push(indices[i + 1] - indices[i]);
      }
      meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const mG = meanGap;
      varGap = gaps.reduce((acc, val) => acc + Math.pow(val - mG, 2), 0) / gaps.length;
    } else {
      meanGap = N / Math.max(1, K_num + 1);
      varGap = Math.pow(meanGap, 2) / 2.0;
    }

    // β is inversely proportional to the mean recurrence return time
    betas[num] = 1.0 / Math.max(Number.EPSILON, meanGap);

    // α is modulated continuously by the gap Coefficient of Variation (burstiness metric)
    const stdDevGap = Math.sqrt(varGap);
    const cv = stdDevGap / Math.max(Number.EPSILON, meanGap);
    // Continuous differentiable activation to scale alpha:
    alphas[num] = mus[num] * (1.0 + Math.tanh(cv - 1.0)) * (1.0 - normalizedEntropy);
  }

  // 5. Spatio-Temporal Hawkes Convolution
  const scores: Record<number, number> = {};
  const horizon = Math.min(100, N);

  for (let num = 1; num <= DOMAIN_SIZE; num++) {
    let excitation = 0.0;
    const beta = betas[num];
    const alpha = alphas[num];

    // Convolve through historical draws
    for (let step = 0; step < horizon; step++) {
      const deltaT = step + 1; // 1 draw ago, 2 draws ago...
      const winners = history[step].gagnants;
      if (!winners) continue;

      let spatialExcitationSum = 0.0;
      for (const w of winners) {
        const dist = getEuclideanDistance(num, w);
        // Gaussian spatial influence kernel
        const spatialWeight = Math.exp(-(dist * dist) / (2.0 * sigmaSpatial * sigmaSpatial));
        spatialExcitationSum += spatialWeight;
      }

      // Self-exciting temporal exponential decay
      excitation += alpha * spatialExcitationSum * Math.exp(-beta * deltaT);
    }

    const totalIntensity = mus[num] + excitation;

    // Smooth, differentiable, continuous logistic scaling to [0-100]
    scores[num] = 100.0 * (1.0 - Math.exp(-totalIntensity));
  }

  // Cache results to guard performance limits
  hawkesIntensityCache.set(cacheKey, scores);

  return scores;
}
