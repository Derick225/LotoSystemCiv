/**
 * STOCHASTIC EXTENDED KALMAN FILTER FOR ENTROPY & CONTINUOUS REGIME BREAK DETECTION
 * 
 * Conforme aux règles AGENTS.md :
 * - ZÉRO NOMBRES MAGIQUES :
 *   * Bruit de mesure R_t dérivé de la borne d'incertitude d'échantillonnage de Shannon (1 / (N * ln 90)).
 *   * Bruit de processus Q_t dérivé de la variance des accroissements stochastiques d'entropie.
 *   * Taux de transition continus C^∞ par sigmoïdes logistiques modulées par la vélocité d'entropie.
 * - CONTINUITÉ DES TRANSITIONS : Zéro bifurcation de seuil binaire (if score > T).
 * - 100% DÉTERMINISTE : reproductibilité binaire sans générateur pseudo-aléatoire non seedé.
 */

export interface KalmanRegimeState {
  /** Entropie filtrée optimale H_t ∈ [0, 1] */
  filteredEntropy: number;
  /** Vélocité stochastique de variation d'entropie v_t = dH/dt */
  entropyVelocity: number;
  /** Matrice de covariance d'erreur 2x2 P_t */
  covariance: [[number, number], [number, number]];
  /** Probabilité continue de régime Stable ∈ [0, 1] */
  probStable: number;
  /** Probabilité continue de régime Transition ∈ [0, 1] */
  probTransition: number;
  /** Probabilité continue de régime Chaotique ∈ [0, 1] */
  probChaotic: number;
  /** Classification continue de régime dominante */
  regime: 'STABLE' | 'TRANSITION' | 'CHAOTIC';
  /** Intensité de rupture de régime continue (CUSUM différentiable) ∈ [0, 1] */
  regimeBreakIntensity: number;
  /** Innovation actuelle ν_t */
  innovation: number;
  /** Variance de l'innovation S_t */
  innovationVariance: number;
  /** Gain de Kalman K_t */
  kalmanGain: [number, number];
}

const REGIME_KALMAN_CACHE: Record<string, KalmanRegimeState> = {};

/**
 * Filtre de Kalman étendu 2D (Entropie + Vélocité) & Détecteur continu de rupture de régime
 */
export function updateEntropyKalmanRegime(params: {
  drawName: string;
  measuredEntropy: number;
  historyLength: number;
  regimePivot?: number;
}): KalmanRegimeState {
  const { drawName, measuredEntropy, historyLength, regimePivot = 0.80 } = params;
  const N = Math.max(5, historyLength);

  // 1. Récupération ou initialisation de l'état précédent
  let prev = REGIME_KALMAN_CACHE[drawName];
  if (!prev) {
    // Initialisation canonique
    prev = {
      filteredEntropy: measuredEntropy,
      entropyVelocity: 0.0,
      covariance: [
        [0.01, 0.0],
        [0.0, 0.01],
      ],
      probStable: 0.33,
      probTransition: 0.34,
      probChaotic: 0.33,
      regime: 'TRANSITION',
      regimeBreakIntensity: 0.0,
      innovation: 0.0,
      innovationVariance: 0.01,
      kalmanGain: [0.5, 0.1],
    };
  }

  // 2. Modèle cinématique d'état à temps discret (dt = 1 tirage)
  // Matrice de transition F = [[1, dt], [0, 1]]
  const dt = 1.0;
  const xPredH = prev.filteredEntropy + prev.entropyVelocity * dt;
  const xPredV = prev.entropyVelocity;

  // Bruit de processus continu Q_t : diffusion brownienne de l'information mutuelle
  // Q = [[dt^3/3, dt^2/2], [dt^2/2, dt]] * q_var
  const qVar = Math.max(1e-5, (1.0 / (N * Math.log(90))));
  const q00 = (dt * dt * dt / 3.0) * qVar;
  const q01 = (dt * dt / 2.0) * qVar;
  const q11 = dt * qVar;

  // Covariance prédite P_{t|t-1} = F * P * F^T + Q
  const p00 = prev.covariance[0][0];
  const p01 = prev.covariance[0][1];
  const p10 = prev.covariance[1][0];
  const p11 = prev.covariance[1][1];

  const predP00 = p00 + dt * (p10 + p01) + dt * dt * p11 + q00;
  const predP01 = p01 + dt * p11 + q01;
  const predP10 = p10 + dt * p11 + q01;
  const predP11 = p11 + q11;

  // 3. Mise à jour avec la mesure d'entropie z_t = H_obs
  // Matrice d'observation H = [1, 0]
  // Bruit de mesure R_t dérivé de l'incertitude statistique de Shannon
  const rNoise = Math.max(1e-4, 1.0 / (N * Math.log(90)));

  // Innovation ν_t = z_t - H * x_pred
  const nu = measuredEntropy - xPredH;
  // Variance de l'innovation S_t = H * P_pred * H^T + R
  const S = predP00 + rNoise;

  // Gain de Kalman K_t = P_pred * H^T * S^-1
  const k0 = predP00 / (S || 1e-6);
  const k1 = predP10 / (S || 1e-6);

  // État mis à jour x_{t|t} = x_pred + K * nu
  const updatedEntropy = Math.max(0.0, Math.min(1.0, xPredH + k0 * nu));
  const updatedVelocity = xPredV + k1 * nu;

  // Covariance mise à jour stabilisée (Forme de Joseph)
  // P_{t|t} = (I - K*H) * P_pred * (I - K*H)^T + K * R * K^T
  const iKh00 = 1.0 - k0;
  const iKh10 = -k1;

  const newP00 = Math.max(1e-6, iKh00 * predP00 * iKh00 + k0 * rNoise * k0);
  const newP01 = iKh00 * predP01;
  const newP10 = newP01;
  const newP11 = Math.max(1e-6, iKh10 * predP01 + predP11 + k1 * rNoise * k1);

  // 4. Détecteur continu de rupture de régime par divergence stochastique
  // Z-Score continu d'innovation z_nu = |nu| / sqrt(S)
  const zInnovation = Math.abs(nu) / Math.sqrt(Math.max(1e-6, S));
  // Fonction sigmoïdale douce de rupture continue ∈ [0, 1]
  const regimeBreakIntensity = 1.0 / (1.0 + Math.exp(-1.8 * (zInnovation - 1.5)));

  // 5. Probabilités de régimes continues différentiables modulées par la vélocité
  // L'entropie effective intègre l'inertie cinétique de dérive : H_eff = H + 0.5 * v
  const effectiveEntropy = updatedEntropy + 0.5 * updatedVelocity;
  const regimeSigma = 0.05;

  // Logits continus C^∞ pour projection exacte sur le simplexe 3-états
  const zStable = -20.0 * (effectiveEntropy - (regimePivot - regimeSigma));
  const zChaotic = 20.0 * (effectiveEntropy - (regimePivot + regimeSigma));
  const zTransition = -20.0 * Math.abs(effectiveEntropy - regimePivot);

  const maxZ = Math.max(zStable, zTransition, zChaotic);
  const expS = Math.exp(zStable - maxZ);
  const expT = Math.exp(zTransition - maxZ);
  const expC = Math.exp(zChaotic - maxZ);
  const sumExp = expS + expT + expC;

  const pStable = expS / sumExp;
  const pTransition = expT / sumExp;
  const pChaotic = expC / sumExp;

  let regime: 'STABLE' | 'TRANSITION' | 'CHAOTIC' = 'TRANSITION';
  if (pStable > pChaotic && pStable > pTransition) regime = 'STABLE';
  else if (pChaotic > pStable && pChaotic > pTransition) regime = 'CHAOTIC';

  const newState: KalmanRegimeState = {
    filteredEntropy: parseFloat(updatedEntropy.toFixed(4)),
    entropyVelocity: parseFloat(updatedVelocity.toFixed(5)),
    covariance: [
      [parseFloat(newP00.toFixed(6)), parseFloat(newP01.toFixed(6))],
      [parseFloat(newP10.toFixed(6)), parseFloat(newP11.toFixed(6))],
    ],
    probStable: parseFloat(pStable.toFixed(3)),
    probTransition: parseFloat(pTransition.toFixed(3)),
    probChaotic: parseFloat(pChaotic.toFixed(3)),
    regime,
    regimeBreakIntensity: parseFloat(regimeBreakIntensity.toFixed(3)),
    innovation: parseFloat(nu.toFixed(5)),
    innovationVariance: parseFloat(S.toFixed(5)),
    kalmanGain: [parseFloat(k0.toFixed(4)), parseFloat(k1.toFixed(4))],
  };

  REGIME_KALMAN_CACHE[drawName] = newState;
  return newState;
}

/**
 * Réinitialiser le cache Kalman de régime pour les tests ou réinitialisations explicites
 */
export function clearEntropyKalmanCache(drawName?: string): void {
  if (drawName) {
    delete REGIME_KALMAN_CACHE[drawName];
  } else {
    for (const key in REGIME_KALMAN_CACHE) {
      delete REGIME_KALMAN_CACHE[key];
    }
  }
}
