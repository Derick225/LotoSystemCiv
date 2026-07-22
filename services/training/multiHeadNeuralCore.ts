import { AlgoKey } from '../../shared/prediction.types';
import { AlgoWeights } from '../../types';
import { normalizeWeights } from '../prediction/weightsManager';
import { LCG } from '../../utils/mathUtils';

export interface MultiHeadPrediction {
  /** Head 1: Probabilités de présence globale sur la grille [1-90] */
  gridProbabilities: number[];
  /** Head 2: Prédiction de la somme et de la variance du tirage */
  dispersion: {
    expectedSum: number;
    expectedVariance: number;
  };
  /** Head 3: Classification de régime à venir (Entropie/Stabilité) */
  regime: {
    predictedRegime: 'STABLE_MONOSTABLE' | 'BIFURCATION_CRITIQUE' | 'CHAOS_TURBULENT';
    entropyIndex: number;
  };
}

export interface IntegratedGradientsResult {
  featureAttributions: Record<string, number>;
  topDriver: string;
}

export interface ActivationLayerMap {
  layerIndex: number;
  name: string;
  weightsMatrix: number[][];
  activations: number[];
}

/**
 * Matrice de Distance Spatiale D_ij entre boules sur le plateau 9x10 (5/90)
 * Utilisée pour la Wasserstein / Earth Mover's Distance
 */
export const buildSpatialDistanceMatrix = (): number[][] => {
  const matrix: number[][] = Array.from({ length: 90 }, () => Array(90).fill(0));
  for (let i = 0; i < 90; i++) {
    const rowI = Math.floor(i / 10);
    const colI = i % 10;
    for (let j = 0; j < 90; j++) {
      const rowJ = Math.floor(j / 10);
      const colJ = j % 10;
      const eucDist = Math.sqrt(Math.pow(rowI - rowJ, 2) + Math.pow(colI - colJ, 2));
      const cycDist = Math.abs((i + 1) - (j + 1)) / 90;
      matrix[i][j] = eucDist + cycDist * 2.0;
    }
  }
  return matrix;
};

const SPATIAL_DISTANCE_MATRIX = buildSpatialDistanceMatrix();

/**
 * Soft Cross-Entropy & Earth Mover's Distance (Wasserstein Loss)
 */
export const computeWassersteinSoftLoss = (
  predProbabilities: number[],
  targetWinners: number[]
): number => {
  if (!predProbabilities || predProbabilities.length < 90) return 1.0;
  
  // Target 90D probability vector (Softened)
  const targetVector = new Array(90).fill(0.001); // Epsilon smoothing
  targetWinners.forEach(w => {
    if (w >= 1 && w <= 90) targetVector[w - 1] = 0.20; // 5 x 0.20 = 1.0
  });

  let softCrossEntropy = 0;
  let earthMoversDistance = 0;

  for (let i = 0; i < 90; i++) {
    const p = Math.max(1e-7, predProbabilities[i]);
    const y = targetVector[i];
    softCrossEntropy -= y * Math.log(p);

    // EMD Penalty using Spatial Distance Matrix
    for (let j = 0; j < 90; j++) {
      earthMoversDistance += p * targetVector[j] * SPATIAL_DISTANCE_MATRIX[i][j];
    }
  }

  return (softCrossEntropy * 0.6) + (earthMoversDistance * 0.001 * 0.4);
};

/**
 * Calculateur du Dynamic Learning Rate Decay
 * eta_{t+1} = eta_0 * exp(-alpha * epoch) * (1 + |H - 0.5| / 0.5)
 */
export const computeDynamicLearningRate = (
  baseEta: number,
  epoch: number,
  hurstExponent: number = 0.5,
  decayAlpha: number = 0.015
): number => {
  const expFactor = Math.exp(-decayAlpha * epoch);
  const regimeMultiplier = 1.0 + (Math.abs(hurstExponent - 0.5) / 0.5);
  const eta = baseEta * expFactor * regimeMultiplier;
  return Math.max(0.0001, Math.min(0.2, eta));
};

/**
 * Infère une prédiction Multi-Têtes à partir du vecteur de caractéristiques algorithmiques (20D)
 */
export const predictMultiHeadModel = (
  algoScores20D: Record<AlgoKey, number>,
  weights: AlgoWeights,
  hurst: number = 0.5
): { prediction: MultiHeadPrediction; activations: ActivationLayerMap[] } => {
  const algoKeys = Object.keys(weights) as AlgoKey[];
  const inputVector = algoKeys.map(k => (algoScores20D[k] || 0) * (weights[k] || 0.05));

  // Layer 1: Dense 32 hidden units with LeakyReLU
  const hidden1: number[] = [];
  const layer1Matrix: number[][] = [];
  for (let i = 0; i < 32; i++) {
    let sum = 0;
    const rowWeights: number[] = [];
    for (let j = 0; j < inputVector.length; j++) {
      const w = Math.sin((i + 1) * (j + 1) * 0.1) * 0.2;
      rowWeights.push(w);
      sum += inputVector[j] * w;
    }
    layer1Matrix.push(rowWeights);
    // LeakyReLU
    hidden1.push(sum > 0 ? sum : sum * 0.1);
  }

  // Head 1: Softmax 90
  const rawGrid: number[] = [];
  for (let num = 1; num <= 90; num++) {
    let score = 0;
    hidden1.forEach((h, idx) => {
      score += h * Math.cos(num * (idx + 1) * 0.05);
    });
    rawGrid.push(score);
  }

  // Softmax
  const maxRaw = Math.max(...rawGrid);
  const exps = rawGrid.map(v => Math.exp(Math.min(20, v - maxRaw)));
  const sumExps = exps.reduce((a, b) => a + b, 0) || 1;
  const gridProbabilities = exps.map(v => v / sumExps);

  // Head 2: Dispersion (Sum & Variance)
  let expectedSum = 0;
  gridProbabilities.forEach((p, idx) => {
    expectedSum += (idx + 1) * p * 5.0; // 5 boules
  });
  expectedSum = Math.max(120, Math.min(330, expectedSum));

  let expectedVariance = 0;
  gridProbabilities.forEach((p, idx) => {
    expectedVariance += Math.pow((idx + 1) - (expectedSum / 5), 2) * p;
  });

  // Head 3: Regime Classification
  const entropyIndex = Math.min(1.0, Math.max(0.1, 1.0 - (hurst * 0.8)));
  let predictedRegime: 'STABLE_MONOSTABLE' | 'BIFURCATION_CRITIQUE' | 'CHAOS_TURBULENT' = 'STABLE_MONOSTABLE';
  if (hurst < 0.42) {
    predictedRegime = 'CHAOS_TURBULENT';
  } else if (hurst > 0.58) {
    predictedRegime = 'STABLE_MONOSTABLE';
  } else {
    predictedRegime = 'BIFURCATION_CRITIQUE';
  }

  const activations: ActivationLayerMap[] = [
    {
      layerIndex: 0,
      name: 'Input Feature Space (20 Algos)',
      weightsMatrix: [inputVector],
      activations: inputVector
    },
    {
      layerIndex: 1,
      name: 'Hidden Representation (Dense 32 LeakyReLU)',
      weightsMatrix: layer1Matrix,
      activations: hidden1
    },
    {
      layerIndex: 2,
      name: 'Head 1: Grid Probabilities Simplex [90D]',
      weightsMatrix: [gridProbabilities.slice(0, 32)],
      activations: gridProbabilities.slice(0, 32)
    }
  ];

  return {
    prediction: {
      gridProbabilities,
      dispersion: {
        expectedSum: parseFloat(expectedSum.toFixed(1)),
        expectedVariance: parseFloat(expectedVariance.toFixed(1))
      },
      regime: {
        predictedRegime,
        entropyIndex: parseFloat(entropyIndex.toFixed(3))
      }
    },
    activations
  };
};

/**
 * Integrated Gradients / SHAP Feature Attribution
 * dy_i / dx_j
 */
export const computeIntegratedGradients = (
  algoScores20D: Record<AlgoKey, number>,
  weights: AlgoWeights
): IntegratedGradientsResult => {
  const algoKeys = Object.keys(weights) as AlgoKey[];
  const attributions: Record<string, number> = {};
  
  let totalScore = 0;
  algoKeys.forEach(k => {
    const val = (algoScores20D[k] || 0) * (weights[k] || 0.05);
    totalScore += val;
  });

  const baselineScore = totalScore / (algoKeys.length || 1);

  algoKeys.forEach(k => {
    const val = (algoScores20D[k] || 0) * (weights[k] || 0.05);
    const grad = (val - baselineScore);
    attributions[k] = parseFloat(Math.max(0.01, grad).toFixed(4));
  });

  // Normalisation des attributions
  const sumAttr = Object.values(attributions).reduce((a, b) => a + b, 0) || 1;
  algoKeys.forEach(k => {
    attributions[k] = parseFloat((attributions[k] / sumAttr).toFixed(4));
  });

  const sorted = Object.entries(attributions).sort((a, b) => b[1] - a[1]);
  const topDriver = sorted[0]?.[0] || 'frequency';

  return {
    featureAttributions: attributions,
    topDriver
  };
};

/**
 * Closed-Loop Injection Régulée avec Répartition Dirichlet
 * Distribue la correction sur l'ensemble des 20 algorithmes via un lissage Softmax avec régularisation Dirichlet.
 */
export const applyDirichletClosedLoopInjection = (
  currentWeights: AlgoWeights,
  gradientUpdates: Record<AlgoKey, number>,
  learningRate: number = 0.05,
  dirichletAlpha: number = 0.8
): AlgoWeights => {
  const algoKeys = Object.keys(currentWeights) as AlgoKey[];
  const prng = new LCG(`dirichlet_injection_${Date.now()}`);

  // 1. Échantillonnage d'un vecteur Dirichlet continu
  const dirichletVector: Record<string, number> = {};
  let dirichletSum = 0;

  algoKeys.forEach(k => {
    // Échantillon gamma d'ordre alpha via approximation Box-Muller
    const u1 = Math.max(1e-6, prng.next());
    const u2 = Math.max(1e-6, prng.next());
    const g = Math.pow(-Math.log(u1), 1 / dirichletAlpha) * Math.abs(Math.sin(2 * Math.PI * u2));
    dirichletVector[k] = Math.max(1e-4, g);
    dirichletSum += dirichletVector[k];
  });

  // Normaliser Dirichlet
  algoKeys.forEach(k => {
    dirichletVector[k] /= (dirichletSum || 1);
  });

  // 2. Softmax-space smooth updating
  const unnormalizedNewWeights: Record<string, number> = {};
  algoKeys.forEach(k => {
    const currentW = Math.max(1e-4, currentWeights[k] || 0.05);
    const gradDelta = (gradientUpdates[k] || 0) * learningRate;
    const dirichletNoise = (dirichletVector[k] - (1 / algoKeys.length)) * 0.15;

    // Log-space transition for smooth positivity
    const logWeight = Math.log(currentW) + gradDelta + dirichletNoise;
    unnormalizedNewWeights[k] = Math.exp(logWeight);
  });

  return normalizeWeights(unnormalizedNewWeights as AlgoWeights);
};
