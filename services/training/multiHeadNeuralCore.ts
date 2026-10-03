import { AlgoKey } from '../../shared/prediction.types';
import { AlgoWeights } from '../../types';

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

const GOLDEN_RATIO = 1.618033988749895;
const LOGISTIC_GELU_SCALE = 1.702;

/**
 * Activation C^∞ GELU (Gaussian Error Linear Unit) : remplace le LeakyReLU par morceaux
 * pour préserver la différentiabilité continue du paysage neuronal (AGENTS.md règle #3).
 */
const gelu = (x: number): number => x / (1.0 + Math.exp(-LOGISTIC_GELU_SCALE * x));

/**
 * Dérivée analytique exacte de GELU(x) = x * sigma(1.702 * x)
 */
const geluDerivative = (x: number): number => {
  const sig = 1.0 / (1.0 + Math.exp(-LOGISTIC_GELU_SCALE * x));
  return sig + LOGISTIC_GELU_SCALE * x * sig * (1.0 - sig);
};

/**
 * Matrice de Distance Spatiale normalisée D_ij ∈ [0, 1] entre boules sur le plateau 9x10 et le tore Z_90 (5/90)
 * Utilisée pour la Wasserstein / Earth Mover's Distance sans facteur arbitraire.
 */
export const buildSpatialDistanceMatrix = (): number[][] => {
  const matrix: number[][] = Array.from({ length: 90 }, () => Array(90).fill(0));
  const maxGridDist = Math.sqrt(Math.pow(8, 2) + Math.pow(9, 2)); // Diagonale maximale d'une grille 9x10 = sqrt(145)
  const maxTorusDist = 45.0; // Demi-période maximale sur le tore circulaire Z_90

  for (let i = 0; i < 90; i++) {
    const rowI = Math.floor(i / 10);
    const colI = i % 10;
    for (let j = 0; j < 90; j++) {
      const rowJ = Math.floor(j / 10);
      const colJ = j % 10;
      const eucDist = Math.sqrt(Math.pow(rowI - rowJ, 2) + Math.pow(colI - colJ, 2)) / maxGridDist;
      const absDiff = Math.abs(i - j);
      const torusDist = Math.min(absDiff, 90 - absDiff) / maxTorusDist;
      matrix[i][j] = 0.5 * (eucDist + torusDist);
    }
  }
  return matrix;
};

const SPATIAL_DISTANCE_MATRIX = buildSpatialDistanceMatrix();

/**
 * Soft Cross-Entropy & Earth Mover's Distance (Wasserstein Loss)
 * Pondération continue gouvernée par l'entropie de Shannon de la distribution prédite (Zéro Nombre Magique).
 */
export const computeWassersteinSoftLoss = (
  predProbabilities: number[],
  targetWinners: number[]
): number => {
  const N = 90;
  if (!predProbabilities || predProbabilities.length < N) return 1.0;

  // Normalisation de la distribution prédite sur le simplexe
  let sumP = 0;
  for (let i = 0; i < N; i++) sumP += Math.max(1e-12, predProbabilities[i]);
  const normP = predProbabilities.slice(0, N).map(p => Math.max(1e-12, p) / (sumP || 1.0));

  // Simplexe cible exact avec lissage de Laplace continu alpha_L = 1/N (somme exactement égale à 1.0)
  const validWinners = targetWinners.filter(w => w >= 1 && w <= N);
  const K = validWinners.length || 5;
  const laplaceAlpha = 1.0 / N;
  const denom = K + N * laplaceAlpha; // K + 1
  const targetVector = new Float64Array(N).fill(laplaceAlpha / denom);
  validWinners.forEach(w => {
    targetVector[w - 1] = (1.0 + laplaceAlpha) / denom;
  });

  let softCrossEntropy = 0;
  let earthMoversDistance = 0;
  let shannonEntropy = 0;

  for (let i = 0; i < N; i++) {
    const p = normP[i];
    const y = targetVector[i];
    softCrossEntropy -= y * Math.log(p);
    shannonEntropy -= p * Math.log(p);

    // Transport optimal pondéré sur la variété (Grille 9x10 x Tore Z_90)
    for (let j = 0; j < N; j++) {
      earthMoversDistance += p * targetVector[j] * SPATIAL_DISTANCE_MATRIX[i][j];
    }
  }

  // Entropie normalisée dans [0, 1] et couplage continu entre divergence KL/CE et transport de Wasserstein
  const normalizedEntropy = Math.min(1.0, Math.max(0.0, shannonEntropy / Math.log(N)));
  const ceWeight = 1.0 / (1.0 + normalizedEntropy);
  const emdWeight = 1.0 - ceWeight;

  // Normalisation de la Cross-Entropy par log(N) pour partager l'échelle [0, 1] de l'EMD
  const scaledCE = softCrossEntropy / Math.log(N);
  return scaledCE * ceWeight + earthMoversDistance * emdWeight;
};

/**
 * Calculateur du Dynamic Learning Rate Decay
 * eta_{t+1} = eta_0 * exp(-alpha * epoch) * (1 + |H - 0.5| / 0.5)
 */
export const computeDynamicLearningRate = (
  baseEta: number,
  epoch: number,
  hurstExponent: number = 0.5,
  decayAlpha?: number
): number => {
  // Taux d'amortissement dérivé de la persistance de Hurst si non spécifié
  const effectiveAlpha = decayAlpha ?? (1.0 - Math.abs(hurstExponent - 0.5)) / 90.0;
  const expFactor = Math.exp(-effectiveAlpha * epoch);
  const regimeMultiplier = 1.0 + (Math.abs(hurstExponent - 0.5) / 0.5);
  const eta = baseEta * expFactor * regimeMultiplier;
  const minEta = baseEta / 90.0;
  const maxEta = Math.min(1.0, baseEta * Math.sqrt(90.0));
  return Math.max(minEta, Math.min(maxEta, eta));
};

/**
 * Infère une prédiction Multi-Têtes à partir du vecteur de caractéristiques algorithmiques (20D)
 * Architecture : Dense 32 avec initialisation Glorot/Nombre d'Or et activation C^∞ GELU.
 */
export const predictMultiHeadModel = (
  algoScores20D: Record<AlgoKey, number>,
  weights: AlgoWeights,
  hurst: number = 0.5
): { prediction: MultiHeadPrediction; activations: ActivationLayerMap[] } => {
  const N = 90;
  const hiddenDim = 32;
  const algoKeys = Object.keys(weights) as AlgoKey[];
  const inDim = Math.max(1, algoKeys.length);
  const defaultWeight = 1.0 / inDim;
  const inputVector = algoKeys.map(k => (algoScores20D[k] || 0) * (weights[k] ?? defaultWeight));

  // Initialisation déterministe de Xavier/Glorot par harmoniques du Nombre d'Or
  const glorotScale1 = Math.sqrt(2.0 / (inDim + hiddenDim));
  const hidden1: number[] = [];
  const layer1Matrix: number[][] = [];
  for (let i = 0; i < hiddenDim; i++) {
    let sum = 0;
    const rowWeights: number[] = [];
    for (let j = 0; j < inputVector.length; j++) {
      const phase = ((i + 1) * GOLDEN_RATIO + (j + 1) * Math.PI) % (2.0 * Math.PI);
      const w = Math.sin(phase) * glorotScale1;
      rowWeights.push(w);
      sum += inputVector[j] * w;
    }
    layer1Matrix.push(rowWeights);
    // Activation continue C^∞ GELU
    hidden1.push(gelu(sum));
  }

  // Head 1: Projection vers le simplexe 90D avec échelle Glorot
  const glorotScale2 = Math.sqrt(2.0 / (hiddenDim + N));
  const rawGrid: number[] = [];
  for (let num = 1; num <= N; num++) {
    let score = 0;
    hidden1.forEach((h, idx) => {
      const phase = (num * GOLDEN_RATIO + (idx + 1)) / Math.sqrt(N);
      score += h * Math.cos(phase) * glorotScale2;
    });
    rawGrid.push(score);
  }

  // Softmax continu avec température dérivée de l'exposant de Hurst
  const maxRaw = Math.max(...rawGrid);
  const temperature = Math.max(0.25, 1.0 - (hurst - 0.5));
  const exps = rawGrid.map(v => Math.exp((v - maxRaw) / temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0) || 1;
  const gridProbabilities = exps.map(v => v / sumExps);

  // Head 2: Dispersion analytique (Somme & Variance sur tirage de 5 boules sans remise)
  const ballsDrawn = 5.0;
  let expectedSum = 0;
  gridProbabilities.forEach((p, idx) => {
    expectedSum += (idx + 1) * p * ballsDrawn;
  });
  // Bornes combinatoires exactes d'une somme de 5 boules sur [1..90] : min = 1+2+3+4+5 = 15, max = 86+87+88+89+90 = 440
  expectedSum = Math.max(15, Math.min(440, expectedSum));

  let expectedVariance = 0;
  const meanBall = expectedSum / ballsDrawn;
  gridProbabilities.forEach((p, idx) => {
    expectedVariance += Math.pow((idx + 1) - meanBall, 2) * p;
  });

  // Head 3: Classification thermodynamique continue du régime (Softmax d'états sans seuils arbitraires 0.42/0.58)
  let shannonGrid = 0;
  for (let i = 0; i < N; i++) {
    const p = Math.max(1e-12, gridProbabilities[i]);
    shannonGrid -= p * Math.log(p);
  }
  const normGridEntropy = shannonGrid / Math.log(N);
  const safeHurst = Math.max(0.01, Math.min(0.99, hurst));
  const rawEntropyMix = 0.5 * (normGridEntropy + (1.0 - safeHurst));
  const entropyIndex = 1.0 / (1.0 + Math.exp(-LOGISTIC_GELU_SCALE * 2.0 * (rawEntropyMix - 0.5)));

  // Potentiels thermodynamiques continus des 3 régimes
  const pStable = Math.exp(2.0 * (safeHurst - 0.5) + (1.0 - entropyIndex));
  const pBifurcation = Math.exp(1.0 - 4.0 * Math.abs(safeHurst - 0.5));
  const pChaos = Math.exp(2.0 * (0.5 - safeHurst) + entropyIndex);

  let predictedRegime: 'STABLE_MONOSTABLE' | 'BIFURCATION_CRITIQUE' | 'CHAOS_TURBULENT' = 'STABLE_MONOSTABLE';
  if (pChaos >= pStable && pChaos >= pBifurcation) {
    predictedRegime = 'CHAOS_TURBULENT';
  } else if (pBifurcation >= pStable && pBifurcation >= pChaos) {
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
      name: 'Hidden Representation (Dense 32 C^∞ GELU)',
      weightsMatrix: layer1Matrix,
      activations: hidden1
    },
    {
      layerIndex: 2,
      name: 'Head 1: Grid Probabilities Simplex [90D]',
      weightsMatrix: [gridProbabilities.slice(0, hiddenDim)],
      activations: gridProbabilities.slice(0, hiddenDim)
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
 * Integrated Gradients / SHAP Feature Attribution par intégration de Riemann le long du chemin droit
 * x(alpha) = baseline + alpha * (x - baseline) à travers la couche GELU différentiable,
 * projetée sur le simplexe par Softplus continu (sans plancher binaire 0.01).
 */
export const computeIntegratedGradients = (
  algoScores20D: Record<AlgoKey, number>,
  weights: AlgoWeights
): IntegratedGradientsResult => {
  const algoKeys = Object.keys(weights) as AlgoKey[];
  const inDim = Math.max(1, algoKeys.length);
  const hiddenDim = 32;
  const defaultWeight = 1.0 / inDim;
  const glorotScale1 = Math.sqrt(2.0 / (inDim + hiddenDim));

  const xInput = algoKeys.map(k => (algoScores20D[k] || 0) * (weights[k] ?? defaultWeight));
  const baseline = xInput.reduce((a, b) => a + b, 0) / inDim;

  // Intégration de Riemann sur M pas le long du segment [baseline, xInput]
  const steps = 16;
  const rawIG = new Float64Array(inDim);

  for (let j = 0; j < inDim; j++) {
    const deltaX = xInput[j] - baseline;
    let pathGradSum = 0;

    for (let s = 1; s <= steps; s++) {
      const alpha = s / steps;
      let stepSensitivity = 0;

      for (let i = 0; i < hiddenDim; i++) {
        let preAct = 0;
        for (let f = 0; f < inDim; f++) {
          const xAlphaF = baseline + alpha * (xInput[f] - baseline);
          const phase = ((i + 1) * GOLDEN_RATIO + (f + 1) * Math.PI) % (2.0 * Math.PI);
          const wIF = Math.sin(phase) * glorotScale1;
          preAct += xAlphaF * wIF;
        }
        const phaseIJ = ((i + 1) * GOLDEN_RATIO + (j + 1) * Math.PI) % (2.0 * Math.PI);
        const wIJ = Math.sin(phaseIJ) * glorotScale1;
        stepSensitivity += geluDerivative(preAct) * Math.abs(wIJ);
      }

      pathGradSum += stepSensitivity / hiddenDim;
    }

    const avgGrad = pathGradSum / steps;
    rawIG[j] = deltaX * avgGrad;
  }

  // Projection continue C^∞ sur le simplexe positif via Softplus normalisé par l'écart-type empirique
  const meanIG = rawIG.reduce((a, b) => a + b, 0) / inDim;
  let varIG = 0;
  for (let j = 0; j < inDim; j++) varIG += Math.pow(rawIG[j] - meanIG, 2);
  const stdIG = Math.sqrt(varIG / inDim) || 1.0;

  const attributions: Record<string, number> = {};
  let sumSoftplus = 0;
  const softplusVals = new Float64Array(inDim);

  for (let j = 0; j < inDim; j++) {
    const z = (rawIG[j] - meanIG) / stdIG;
    // Softplus continu : log(1 + exp(z))
    const sp = Math.log(1.0 + Math.exp(Math.max(-20, Math.min(20, z))));
    softplusVals[j] = sp;
    sumSoftplus += sp;
  }

  const denom = sumSoftplus || 1.0;
  algoKeys.forEach((k, idx) => {
    attributions[k] = parseFloat((softplusVals[idx] / denom).toFixed(4));
  });

  const sorted = Object.entries(attributions).sort((a, b) => b[1] - a[1]);
  const topDriver = sorted[0]?.[0] || 'frequency';

  return {
    featureAttributions: attributions,
    topDriver
  };
};

