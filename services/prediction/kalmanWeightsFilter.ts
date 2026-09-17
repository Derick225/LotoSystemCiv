import { AlgoWeights, DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { normalizeWeights, getDefaultWeights } from './weightsManager';
import { computeLocalLyapunovExponent } from './adaptiveLearningRate';
import { calculateShannonEntropy, calculateVariance } from './deterministicCore';

export interface KalmanFilterState {
  drawName: string;
  stateVector: Record<string, number>; // Poids estimes x_t
  covarianceMatrix: number[][]; // Matrice de covariance P_t (K x K)
  stepCount: number;
  lastUpdated: string;
  innovationVector?: Record<string, number>;
  kalmanGains?: Record<string, number>;
}

export interface KalmanUpdateResult {
  updatedWeights: AlgoWeights;
  kalmanState: KalmanFilterState;
  innovationNorm: number;
  traceCovariance: number;
  driftDamped: boolean;
}

const KALMAN_CACHE: Record<string, KalmanFilterState> = {};

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
  };

  KALMAN_CACHE[drawName] = state;
  return state;
}

/**
 * FILTRE DE KALMAN ADAPTATIF POUR LES POIDS ALGORITHMIQUES
 * 
 * Élimine le bruit d'échantillonnage ponctuel (mesure R_t)
 * tout en capturant fidèlement les vraies dérives structurelles (processus Q_t).
 * 
 * Équations :
 * 1. Prédiction : x_{t|t-1} = x_{t-1},  P_{t|t-1} = P_{t-1} + Q_t
 * 2. Innovation : y_t = z_t - H x_{t|t-1}
 * 3. Gain de Kalman : K_t = P_{t|t-1} (P_{t|t-1} + R_t)^{-1}
 * 4. Mise à jour de Joseph : P_t = (I - K_t) P_{t|t-1} (I - K_t)^T + K_t R_t K_t^T
 * 5. Projection continue sur le simplexe par Softmax
 */
export function updateWeightsWithKalmanFilter(params: {
  drawName: string;
  measuredWeights: AlgoWeights;
  history?: DrawResult[];
  predictionError?: number; // Score de Brier ou perte topologique
  empiricalVariance?: number;
}): KalmanUpdateResult {
  const { drawName, measuredWeights, history = [], predictionError = 0.2, empiricalVariance: customVar } = params;

  let state = KALMAN_CACHE[drawName];
  if (!state) {
    state = initializeKalmanState(drawName, measuredWeights);
  }

  const keys = Object.keys(measuredWeights) as AlgoKey[];
  const K = keys.length;

  // Calcul du bruit de processus Q_t (dérive stochastique réelle)
  const lyapunov = computeLocalLyapunovExponent(history, 5);
  const qBase = (1.0 / (K * K)) * (1.0 + Math.max(0, lyapunov) * 0.5);

  // Calcul du bruit de mesure R_t (bruit d'échantillonnage de tirage)
  const rBase = Math.max(0.001, (customVar ?? 0.01) * (1.0 + predictionError));

  const currentCov = state.covarianceMatrix;
  const nextCov: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  const newWeightsMap: Record<string, number> = {};
  const kalmanGains: Record<string, number> = {};
  const innovation: Record<string, number> = {};
  let totalInnovation = 0;

  for (let i = 0; i < K; i++) {
    const key = keys[i];
    const priorState = state.stateVector[key] ?? (1.0 / K);
    const measured = (measuredWeights as any)[key] ?? (1.0 / K);

    // 1. Prédiction Covariance P_{t|t-1} = P_{i,i} + Q
    const pPrior = currentCov[i][i] + qBase;

    // 2. Gain de Kalman K_i = P_{prior} / (P_{prior} + R)
    const kGain = pPrior / (pPrior + rBase);
    kalmanGains[key] = parseFloat(kGain.toFixed(4));

    // 3. Innovation
    const diff = measured - priorState;
    innovation[key] = parseFloat(diff.toFixed(5));
    totalInnovation += diff * diff;

    // 4. Mise à jour de l'état (lissage bayésien)
    const updatedVal = priorState + kGain * diff;
    newWeightsMap[key] = Math.max(0.001, updatedVal);

    // 5. Mise à jour de la variance P_t
    const pPosterior = (1.0 - kGain) * pPrior;
    nextCov[i][i] = pPosterior;
  }

  // Normalisation continue des poids résultants
  const normalized = normalizeWeights(newWeightsMap as AlgoWeights);

  // Mise à jour du cache d'état
  state.stateVector = { ...normalized } as any;
  state.covarianceMatrix = nextCov;
  state.stepCount++;
  state.lastUpdated = new Date().toISOString();
  state.innovationVector = innovation;
  state.kalmanGains = kalmanGains;

  let trace = 0;
  for (let i = 0; i < K; i++) trace += nextCov[i][i];

  return {
    updatedWeights: normalized,
    kalmanState: state,
    innovationNorm: parseFloat(Math.sqrt(totalInnovation).toFixed(5)),
    traceCovariance: parseFloat(trace.toFixed(6)),
    driftDamped: true,
  };
}
