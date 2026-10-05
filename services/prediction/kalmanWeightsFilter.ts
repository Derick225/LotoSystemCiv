import { AlgoWeights, DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { normalizeWeights, getDefaultWeights } from './weightsManager';
import { calculateShannonEntropy, calculateVariance } from './deterministicCore';

export interface KalmanFilterState {
  drawName: string;
  stateVector: Record<string, number>; // Poids estimes x_t
  covarianceMatrix: number[][]; // Matrice de covariance P_t (K x K)
  stepCount: number;
  lastUpdated: string;
  innovationVector?: Record<string, number>;
  kalmanGains?: Record<string, number>;
  errorHistory?: number[]; // Historique glissant des erreurs de prédiction
  innovationHistory?: number[]; // Historique glissant de la norme de l'innovation
  innovationVectorsHistory?: number[][]; // Historique glissant des vecteurs d'innovation complets (K-D)
}

export interface KalmanUpdateResult {
  updatedWeights: AlgoWeights;
  kalmanState: KalmanFilterState;
  innovationNorm: number;
  traceCovariance: number;
  offDiagonalNorm: number;
  driftDamped: boolean;
}

const KALMAN_CACHE: Record<string, KalmanFilterState> = {};

/**
 * Inversion matricielle exacte de Gauss-Jordan avec pivot partiel et régularisation de Tikhonov
 * pour l'opérateur d'innovation S_t = P_{t|t-1} + R_t (K x K, K <= 24).
 */
function invertSymmetricPositiveMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const aug: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array(2 * n).fill(0);
    for (let j = 0; j < n; j++) {
      row[j] = matrix[i][j] + (i === j ? 1e-9 : 0);
    }
    row[n + i] = 1.0;
    return row;
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const absVal = Math.abs(aug[row][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        pivotRow = row;
      }
    }

    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivot = Math.abs(aug[col][col]) < 1e-12 ? (aug[col][col] >= 0 ? 1e-12 : -1e-12) : aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return Array.from({ length: n }, (_, i) => aug[i].slice(n, 2 * n));
}

/**
 * Calcule la moyenne et la variance d'une série historique
 */
function getRollingStats(values: number[], fallback: number): { mean: number; variance: number } {
  if (values.length === 0) return { mean: fallback, variance: 1e-4 };
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    sumSq += Math.pow(values[i] - mean, 2);
  }
  const variance = sumSq / values.length;
  return { mean, variance };
}

/**
 * Initialise un état de Kalman canonique
 */
export function initializeKalmanState(drawName: string, initialWeights?: AlgoWeights): KalmanFilterState {
  const safeWeights = initialWeights ? normalizeWeights(initialWeights) : getDefaultWeights();
  const keys = Object.keys(safeWeights);
  const K = keys.length;

  // Matrice de covariance P_0 initiale (diagonale basée sur 1/K)
  const initVariance = 1.0 / (K * K);
  const cov: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (__, j) => (i === j ? initVariance : 0.0))
  );

  const stateVector: Record<string, number> = {};
  for (const k of keys) {
    stateVector[k] = safeWeights[k as AlgoKey] || 1.0 / K;
  }

  const state: KalmanFilterState = {
    drawName,
    stateVector,
    covarianceMatrix: cov,
    stepCount: 0,
    lastUpdated: new Date().toISOString(),
    errorHistory: [],
    innovationHistory: [],
    innovationVectorsHistory: [],
  };

  KALMAN_CACHE[drawName] = state;
  return state;
}

/**
 * FILTRE DE KALMAN ADAPTATIF MULTIVARIÉ SOUS FORME DE JOSEPH (COVARIANCE CROISÉE K x K)
 * 
 * Élimine le bruit d'échantillonnage ponctuel (mesure R_t)
 * tout en capturant fidèlement les dérives structurelles et les co-variations inter-algorithmes (processus Q_t).
 * 
 * Équations :
 * 1. Prédiction : x_{t|t-1} = x_{t-1},  P_{t|t-1} = P_{t-1} + Q_t
 * 2. Innovation : \nu_t = z_t - x_{t|t-1}
 * 3. Opérateur d'innovation : S_t = P_{t|t-1} + R_t I_K
 * 4. Gain de Kalman multivarié : K_t = P_{t|t-1} S_t^{-1}
 * 5. Mise à jour stabilisée de Joseph : P_t = (I_K - K_t) P_{t|t-1} (I_K - K_t)^T + K_t R_t K_t^T
 */
export function updateWeightsWithKalmanFilter(params: {
  drawName: string;
  measuredWeights: AlgoWeights;
  history?: DrawResult[];
  predictionError?: number; // Score de Brier ou perte topologique
  empiricalVariance?: number;
}): KalmanUpdateResult {
  const { drawName, measuredWeights, predictionError = 0.2, empiricalVariance: customVar } = params;

  let state = KALMAN_CACHE[drawName];
  if (!state) {
    state = initializeKalmanState(drawName, measuredWeights);
  }

  const keys = Object.keys(measuredWeights) as AlgoKey[];
  const K = keys.length;

  // Redimensionnement défensif si le nombre de clés a évolué
  if (!state.covarianceMatrix || state.covarianceMatrix.length !== K) {
    state = initializeKalmanState(drawName, measuredWeights);
  }

  // Initialisation garantie des tableaux historiques
  const errorHistory = state.errorHistory ?? (state.errorHistory = []);
  const innovationHistory = state.innovationHistory ?? (state.innovationHistory = []);
  const innovationVectorsHistory = state.innovationVectorsHistory ?? (state.innovationVectorsHistory = []);

  // Enregistrer l'erreur de prédiction actuelle (Closed-Loop Autopsy Feedback)
  errorHistory.push(predictionError);
  if (errorHistory.length > 15) {
    errorHistory.shift();
  }

  // 1. Autotuning continu du bruit de mesure R_t
  const errorStats = getRollingStats(errorHistory, predictionError);
  const baseVar = customVar ?? (1.0 / (K * K));
  const rBase = Math.max(1e-5, errorStats.variance * (1.0 + errorStats.mean) + baseVar / Math.sqrt(K));

  // 2. Vecteur d'innovation actuel \nu_t = z_t - x_{t|t-1}
  const innovationVec: number[] = new Array(K).fill(0);
  const innovation: Record<string, number> = {};
  let totalInnovation = 0;

  for (let i = 0; i < K; i++) {
    const key = keys[i];
    const priorVal = state.stateVector[key] ?? (1.0 / K);
    const measuredVal = (measuredWeights as Record<string, number>)[key] ?? (1.0 / K);
    const diff = measuredVal - priorVal;
    innovationVec[i] = diff;
    innovation[key] = parseFloat(diff.toFixed(5));
    totalInnovation += diff * diff;
  }

  const currentInnovationNorm = Math.sqrt(totalInnovation);
  innovationHistory.push(currentInnovationNorm);
  if (innovationHistory.length > 15) {
    innovationHistory.shift();
  }

  innovationVectorsHistory.push(innovationVec);
  if (innovationVectorsHistory.length > 15) {
    innovationVectorsHistory.shift();
  }

  const innovationStats = getRollingStats(innovationHistory, currentInnovationNorm);
  const qDiagBase = (1.0 / (K * K)) * (1.0 + innovationStats.variance * K);

  // 3. Matrice de bruit de processus Q_t (K x K) de Sage-Husa :
  // Combine la base isotrope et la covariance empirique croisée des innovations \nu_\tau \nu_\tau^T
  const histLen = innovationVectorsHistory.length;
  const QMatrix: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (__, j) => (i === j ? qDiagBase : 0.0))
  );

  if (histLen >= 2) {
    const meanNu = new Array(K).fill(0);
    for (let m = 0; m < histLen; m++) {
      for (let i = 0; i < K; i++) {
        meanNu[i] += innovationVectorsHistory[m][i] / histLen;
      }
    }
    const couplingWeight = histLen / (histLen + Math.sqrt(K));
    for (let i = 0; i < K; i++) {
      for (let j = i; j < K; j++) {
        let covIJ = 0;
        for (let m = 0; m < histLen; m++) {
          covIJ +=
            (innovationVectorsHistory[m][i] - meanNu[i]) *
            (innovationVectorsHistory[m][j] - meanNu[j]);
        }
        covIJ = (covIJ / histLen) * couplingWeight;
        QMatrix[i][j] += covIJ;
        if (i !== j) {
          QMatrix[j][i] += covIJ;
        }
      }
    }
  } else if (histLen === 1) {
    // Produit extérieur instantané amorti au premier pas
    const damp = 1.0 / (K + 1.0);
    for (let i = 0; i < K; i++) {
      for (let j = i; j < K; j++) {
        const outer = innovationVec[i] * innovationVec[j] * damp;
        QMatrix[i][j] += outer;
        if (i !== j) QMatrix[j][i] += outer;
      }
    }
  }

  // 4. Covariance a priori P_{t|t-1} = P_{t-1} + Q_t et Opérateur d'innovation S_t = P_{t|t-1} + R_t I_K
  const currentCov = state.covarianceMatrix;
  const pPrior: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (__, j) => currentCov[i][j] + QMatrix[i][j])
  );
  const sMatrix: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (__, j) => pPrior[i][j] + (i === j ? rBase : 0.0))
  );

  // 5. Gain de Kalman multivarié K_t = P_{t|t-1} * S_t^{-1}
  const sInv = invertSymmetricPositiveMatrix(sMatrix);
  const kMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let sum = 0;
      for (let m = 0; m < K; m++) {
        sum += pPrior[i][m] * sInv[m][j];
      }
      kMatrix[i][j] = sum;
    }
  }

  // 6. Mise à jour couplée de l'état : x_t = x_{t|t-1} + K_t \nu_t
  const newWeightsMap: Record<string, number> = {};
  const kalmanGains: Record<string, number> = {};
  const minFloor = 1.0 / (K * 90.0);

  for (let i = 0; i < K; i++) {
    const key = keys[i];
    const priorState = state.stateVector[key] ?? (1.0 / K);
    let deltaI = 0;
    for (let j = 0; j < K; j++) {
      deltaI += kMatrix[i][j] * innovationVec[j];
    }
    kalmanGains[key] = parseFloat(kMatrix[i][i].toFixed(4));
    newWeightsMap[key] = Math.max(minFloor, priorState + deltaI);
  }

  // 7. Mise à jour stabilisée de Joseph : P_t = (I - K_t) P_{t|t-1} (I - K_t)^T + K_t R_t K_t^T
  const iMinusK: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (__, j) => (i === j ? 1.0 : 0.0) - kMatrix[i][j])
  );
  const tempMat: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let s = 0;
      for (let m = 0; m < K; m++) {
        s += iMinusK[i][m] * pPrior[m][j];
      }
      tempMat[i][j] = s;
    }
  }

  const nextCov: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = i; j < K; j++) {
      let josephTerm = 0;
      let noiseTerm = 0;
      for (let m = 0; m < K; m++) {
        josephTerm += tempMat[i][m] * iMinusK[j][m];
        noiseTerm += kMatrix[i][m] * rBase * kMatrix[j][m];
      }
      const val = josephTerm + noiseTerm;
      nextCov[i][j] = val;
      if (i !== j) {
        nextCov[j][i] = val;
      }
    }
  }

  // Normalisation continue des poids résultants
  const normalized = normalizeWeights(newWeightsMap as AlgoWeights);

  // Mise à jour du cache d'état
  state.stateVector = { ...normalized } as Record<string, number>;
  state.covarianceMatrix = nextCov;
  state.stepCount++;
  state.lastUpdated = new Date().toISOString();
  state.innovationVector = innovation;
  state.kalmanGains = kalmanGains;

  let trace = 0;
  let offDiagSq = 0;
  for (let i = 0; i < K; i++) {
    trace += nextCov[i][i];
    for (let j = 0; j < K; j++) {
      if (i !== j) offDiagSq += nextCov[i][j] * nextCov[i][j];
    }
  }

  return {
    updatedWeights: normalized,
    kalmanState: state,
    innovationNorm: parseFloat(currentInnovationNorm.toFixed(5)),
    traceCovariance: parseFloat(trace.toFixed(6)),
    offDiagonalNorm: parseFloat(Math.sqrt(offDiagSq).toFixed(6)),
    driftDamped: true,
  };
}
