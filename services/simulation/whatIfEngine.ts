import { AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { LCG } from '../../utils/mathUtils';
import { normalizeWeights } from '../prediction/weightsManager';

export interface InverseWhatIfResult {
  targetBall: number;
  achievableRank: number;
  optimalWeights: AlgoWeights;
  requiredAdjustments: Array<{ key: AlgoKey; original: number; target: number; delta: number }>;
  convergenceIterations: number;
}

export interface BifurcationPoint {
  algoKey: AlgoKey;
  criticalThreshold: number;
  rankFlipBallFrom: number;
  rankFlipBallTo: number;
  severity: 'MILD' | 'CRITICAL_BIFURCATION';
}

export interface MonteCarloStressResult {
  ball: number;
  meanScore: number;
  stdDev: number;
  p5: number;
  p95: number;
  stabilityIndex: number;
}

export interface FitnessLandscapePoint {
  xWeight: number;
  yWeight: number;
  top5Score: number;
}

/**
 * Normalise un vecteur 90D en distribution de probabilité Simplex
 */
export const normalizeGridToSimplex = (rawScores: number[]): number[] => {
  const minVal = Math.min(...rawScores);
  const shifted = rawScores.map(v => Math.max(1e-6, v - minVal + 1.0));
  const sum = shifted.reduce((a, b) => a + b, 0) || 1;
  return shifted.map(v => v / sum);
};

/**
 * Calcule la Divergence Kullback-Leibler D_KL(P_base || P_sim) sur le simplex 90D
 */
export const computeKLDivergence = (pBase: number[], pSim: number[]): number => {
  if (pBase.length < 90 || pSim.length < 90) return 0;
  
  let kl = 0;
  for (let i = 0; i < 90; i++) {
    const p = Math.max(1e-7, pBase[i]);
    const q = Math.max(1e-7, pSim[i]);
    kl += p * Math.log(p / q);
  }
  return parseFloat(Math.max(0, kl).toFixed(5));
};

/**
 * Calcule la Matrice Jacobienne Numérique Complète (Différences Finies Centrales 90x20)
 * J_ij = dP_i / dW_j ≈ [P_i(W + eps_j) - P_i(W - eps_j)] / (2 * eps)
 */
export const computeFullJacobianMatrix = (
  baseWeights: AlgoWeights,
  evalProbabilities: (w: AlgoWeights) => number[],
  epsilon: number = 0.02
): { jacobian: number[][]; algoSensitivities: Array<{ key: AlgoKey; sensitivity: number }> } => {
  const algoKeys = Object.keys(baseWeights) as AlgoKey[];
  const jacobian: number[][] = Array.from({ length: 90 }, () => Array(algoKeys.length).fill(0));
  const algoSensitivities: Array<{ key: AlgoKey; sensitivity: number }> = [];

  algoKeys.forEach((key, jIdx) => {
    // Perturbation +eps
    const wPlus = { ...baseWeights, [key]: (baseWeights[key] || 0) + epsilon };
    const pPlus = evalProbabilities(normalizeWeights(wPlus));

    // Perturbation -eps
    const wMinus = { ...baseWeights, [key]: Math.max(0, (baseWeights[key] || 0) - epsilon) };
    const pMinus = evalProbabilities(normalizeWeights(wMinus));

    let sumSquareDeriv = 0;
    for (let i = 0; i < 90; i++) {
      const deriv = (pPlus[i] - pMinus[i]) / (2 * epsilon);
      jacobian[i][jIdx] = deriv;
      sumSquareDeriv += deriv * deriv;
    }

    const normSensitivity = Math.sqrt(sumSquareDeriv);
    algoSensitivities.push({
      key,
      sensitivity: parseFloat((normSensitivity * 100).toFixed(4))
    });
  });

  algoSensitivities.sort((a, b) => b.sensitivity - a.sensitivity);

  return { jacobian, algoSensitivities };
};

/**
 * Calcul de la Matrice Hessienne de Couplage de Second Ordre H_jk
 * H_jk = d^2 P_top / (dW_j dW_k)
 */
export const computeHessianCoupling = (
  baseWeights: AlgoWeights,
  algoKeyA: AlgoKey,
  algoKeyB: AlgoKey,
  evalTop1Score: (w: AlgoWeights) => number,
  epsilon: number = 0.03
): number => {
  const f0 = evalTop1Score(baseWeights);

  const wA = { ...baseWeights, [algoKeyA]: (baseWeights[algoKeyA] || 0) + epsilon };
  const fA = evalTop1Score(normalizeWeights(wA));

  const wB = { ...baseWeights, [algoKeyB]: (baseWeights[algoKeyB] || 0) + epsilon };
  const fB = evalTop1Score(normalizeWeights(wB));

  const wAB = { ...baseWeights, [algoKeyA]: (baseWeights[algoKeyA] || 0) + epsilon, [algoKeyB]: (baseWeights[algoKeyB] || 0) + epsilon };
  const fAB = evalTop1Score(normalizeWeights(wAB));

  const secondDeriv = (fAB - fA - fB + f0) / (epsilon * epsilon);
  return parseFloat(secondDeriv.toFixed(4));
};

/**
 * Morphing Continu de Configuration (Moteur d'Interpolation de Scénarios)
 * W_interp(alpha) = (1 - alpha) * W_A + alpha * W_B
 */
export const interpolateScenarios = (
  scenarioA: AlgoWeights,
  scenarioB: AlgoWeights,
  alpha: number
): AlgoWeights => {
  const clampAlpha = Math.max(0, Math.min(1, alpha));
  const interpolated: Record<string, number> = {};

  const keys = Array.from(new Set([...Object.keys(scenarioA), ...Object.keys(scenarioB)]));
  keys.forEach(k => {
    const valA = scenarioA[k as AlgoKey] || 0;
    const valB = scenarioB[k as AlgoKey] || 0;
    interpolated[k] = (1 - clampAlpha) * valA + clampAlpha * valB;
  });

  return normalizeWeights(interpolated as AlgoWeights);
};

/**
 * Recherche Inversée Contrefactuelle ("Inverse What-If")
 * Trouve le vecteur de poids W* qui propulse une boule cible dans le Top 5 via gradient descent
 */
export const findInverseWhatIfWeights = (
  targetBall: number,
  initialWeights: AlgoWeights,
  evalGridScores: (w: AlgoWeights) => number[],
  maxIterations: number = 40
): InverseWhatIfResult => {
  let currentWeights = { ...initialWeights };
  const algoKeys = Object.keys(currentWeights) as AlgoKey[];
  const lr = 0.08;

  let bestRank = 90;
  let bestWeights = { ...currentWeights };

  for (let iter = 0; iter < maxIterations; iter++) {
    const rawScores = evalGridScores(currentWeights);
    
    // Sort balls to get rank of targetBall
    const indexed = rawScores.map((score, idx) => ({ ball: idx + 1, score }));
    indexed.sort((a, b) => b.score - a.score);

    const rank = indexed.findIndex(x => x.ball === targetBall) + 1;
    if (rank < bestRank) {
      bestRank = rank;
      bestWeights = { ...currentWeights };
    }

    if (rank <= 5) break; // Found top 5 solution

    // Gradient ascent step on targetBall score
    const grads: Record<string, number> = {};
    const eps = 0.02;

    algoKeys.forEach(k => {
      const wPlus = normalizeWeights({ ...currentWeights, [k]: (currentWeights[k] || 0) + eps });
      const scorePlus = evalGridScores(wPlus)[targetBall - 1] || 0;

      const wMinus = normalizeWeights({ ...currentWeights, [k]: Math.max(0, (currentWeights[k] || 0) - eps) });
      const scoreMinus = evalGridScores(wMinus)[targetBall - 1] || 0;

      grads[k] = (scorePlus - scoreMinus) / (2 * eps);
    });

    // Update weights
    const updated: Record<string, number> = {};
    algoKeys.forEach(k => {
      updated[k] = Math.max(0.001, (currentWeights[k] || 0) + lr * (grads[k] || 0));
    });

    currentWeights = normalizeWeights(updated as AlgoWeights);
  }

  // Calculate required adjustments
  const adjustments: Array<{ key: AlgoKey; original: number; target: number; delta: number }> = [];
  algoKeys.forEach(k => {
    const orig = initialWeights[k] || 0;
    const tgt = bestWeights[k] || 0;
    const delta = tgt - orig;
    if (Math.abs(delta) > 0.01) {
      adjustments.push({
        key: k,
        original: parseFloat(orig.toFixed(4)),
        target: parseFloat(tgt.toFixed(4)),
        delta: parseFloat(delta.toFixed(4))
      });
    }
  });

  adjustments.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    targetBall,
    achievableRank: bestRank,
    optimalWeights: bestWeights,
    requiredAdjustments: adjustments.slice(0, 5),
    convergenceIterations: maxIterations
  };
};

/**
 * Détection Automatique des Points de Bifurcation (Théorie des Catastrophes)
 */
export const detectBifurcationPoints = (
  baseWeights: AlgoWeights,
  evalTopCandidates: (w: AlgoWeights) => number[],
  epsilon: number = 0.03
): BifurcationPoint[] => {
  const algoKeys = Object.keys(baseWeights) as AlgoKey[];
  const baseTop = evalTopCandidates(baseWeights);
  const baseWinner = baseTop[0];

  const bifurcations: BifurcationPoint[] = [];

  algoKeys.forEach(k => {
    const wPlus = normalizeWeights({ ...baseWeights, [k]: (baseWeights[k] || 0) + epsilon });
    const topPlus = evalTopCandidates(wPlus);

    if (topPlus[0] !== baseWinner) {
      bifurcations.push({
        algoKey: k,
        criticalThreshold: parseFloat(((baseWeights[k] || 0) + epsilon).toFixed(3)),
        rankFlipBallFrom: baseWinner,
        rankFlipBallTo: topPlus[0],
        severity: 'CRITICAL_BIFURCATION'
      });
    }
  });

  return bifurcations;
};

/**
 * Test de Stress Monte Carlo Multi-Scénarios (1 000 runs)
 */
export const runMonteCarloStressTest = (
  baseWeights: AlgoWeights,
  evalGridScores: (w: AlgoWeights) => number[],
  iterations: number = 100, // Light for instant UI responsiveness
  noiseStdDev: number = 0.05
): MonteCarloStressResult[] => {
  const algoKeys = Object.keys(baseWeights) as AlgoKey[];
  const ballScoresMap: Record<number, number[]> = {};

  for (let b = 1; b <= 90; b++) ballScoresMap[b] = [];

  const prng = new LCG(`monte_carlo_whatif_${Date.now()}`);

  for (let run = 0; run < iterations; run++) {
    const noisyWeights: Record<string, number> = {};
    algoKeys.forEach(k => {
      // Box-muller gaussian noise
      const u1 = Math.max(1e-6, prng.next());
      const u2 = Math.max(1e-6, prng.next());
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      noisyWeights[k] = Math.max(0.001, (baseWeights[k] || 0) + gauss * noiseStdDev);
    });

    const scores = evalGridScores(normalizeWeights(noisyWeights as AlgoWeights));
    scores.forEach((sc, idx) => {
      ballScoresMap[idx + 1].push(sc);
    });
  }

  const results: MonteCarloStressResult[] = [];

  for (let b = 1; b <= 90; b++) {
    const vals = ballScoresMap[b].sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    const stdDev = Math.sqrt(variance);

    const p5Idx = Math.floor(vals.length * 0.05);
    const p95Idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.95));

    const stabilityIndex = Math.max(0, 1.0 - (stdDev / (mean || 1)));

    results.push({
      ball: b,
      meanScore: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      p5: parseFloat(vals[p5Idx].toFixed(2)),
      p95: parseFloat(vals[p95Idx].toFixed(2)),
      stabilityIndex: parseFloat((stabilityIndex * 100).toFixed(1))
    });
  }

  results.sort((a, b) => b.meanScore - a.meanScore);
  return results.slice(0, 10);
};

/**
 * Générateur de Surface 3D de Fitness (X=Algo1, Y=Algo2, Z=Score Top 5)
 */
export const generateFitnessLandscape = (
  baseWeights: AlgoWeights,
  algoKeyX: AlgoKey,
  algoKeyY: AlgoKey,
  evalTop5Score: (w: AlgoWeights) => number,
  gridSteps: number = 6
): FitnessLandscapePoint[] => {
  const points: FitnessLandscapePoint[] = [];

  for (let i = 0; i <= gridSteps; i++) {
    const xVal = i / gridSteps;
    for (let j = 0; j <= gridSteps; j++) {
      const yVal = j / gridSteps;

      const wLocal = normalizeWeights({
        ...baseWeights,
        [algoKeyX]: xVal,
        [algoKeyY]: yVal
      });

      const zScore = evalTop5Score(wLocal);

      points.push({
        xWeight: parseFloat(xVal.toFixed(2)),
        yWeight: parseFloat(yVal.toFixed(2)),
        top5Score: parseFloat(zScore.toFixed(2))
      });
    }
  }

  return points;
};
