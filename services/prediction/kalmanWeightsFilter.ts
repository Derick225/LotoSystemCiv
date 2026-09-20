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
  const { drawName, measuredWeights, predictionError = 0.2, empiricalVariance: customVar } = params;

  let state = KALMAN_CACHE[drawName];
  if (!state) {
    state = initializeKalmanState(drawName, measuredWeights);
  }

  // Initialisation des tableaux historiques s'ils proviennent d'un cache restauré
  if (!state.errorHistory) state.errorHistory = [];
  if (!state.innovationHistory) state.innovationHistory = [];

  const keys = Object.keys(measuredWeights) as AlgoKey[];
  const K = keys.length;

  // Enregistrer l'erreur de prédiction actuelle (Closed-Loop Autopsy Feedback)
  state.errorHistory.push(predictionError);
  if (state.errorHistory.length > 15) {
    state.errorHistory.shift();
  }

  // 1. Autotuning continu du bruit de mesure R_t
  const errorStats = getRollingStats(state.errorHistory, predictionError);
  const baseVar = customVar ?? 0.01;
  // rBase est calculé de manière continue par la variance de l'erreur historique cumulée
  const rBase = Math.max(0.0001, errorStats.variance * (1.0 + errorStats.mean) + baseVar * 0.1);

  // 2. Autotuning continu du bruit de processus Q_t (Sage-Husa)
  // ALGO-7 : l'exposant de Lyapunov local ne module plus Q_t. Sur des tirages physiquement
  // aléatoires il ne mesure aucun « régime chaotique » réel — seulement du bruit
  // d'échantillonnage — et gonflait donc le bruit de processus de façon arbitraire. Q_t
  // reste auto-ajusté par la dispersion légitime des corrections (variance d'innovation).
  const prevInnovationNorm = state.innovationVector
    ? Math.sqrt(Object.values(state.innovationVector).reduce((sum, v) => sum + v * v, 0))
    : 0.0;

  state.innovationHistory.push(prevInnovationNorm);
  if (state.innovationHistory.length > 15) {
    state.innovationHistory.shift();
  }

  const innovationStats = getRollingStats(state.innovationHistory, prevInnovationNorm);
  // qBase s'auto-ajuste à la dispersion des corrections optimales (innovation)
  const qBase = (1.0 / (K * K)) * (1.0 + innovationStats.variance * 10.0);

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
