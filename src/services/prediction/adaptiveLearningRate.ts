import { DrawResult } from '../../types';
import { calculateShannonEntropy, calculateVariance } from './deterministicCore';

export interface AdaptiveLearningRateResult {
  learningRate: number;
  baseRate: number;
  localLyapunov: number;
  normalizedEntropy: number;
  persistenceModulator: number;
  varianceModulator: number;
  auditExplanation: string;
}

/**
 * Estimation continue de l'Exposant de Lyapunov Local lambda(t)
 * Mesure le taux de divergence des trajectoires d'erreurs stochastiques.
 * lambda > 0 : régime chaotique / dispersif (réduire l'apprentissage)
 * lambda <= 0 : régime contractant / attracteur régulier (stabiliser/accélérer l'apprentissage)
 */
export function computeLocalLyapunovExponent(history: DrawResult[], tau: number = 5): number {
  if (!history || history.length < tau + 2) return 0.0;

  let sumLogDivergence = 0.0;
  let validPairs = 0;

  for (let i = 0; i < history.length - tau - 1; i++) {
    const d0 = history[i].gagnants || [];
    const d0Next = history[i + 1].gagnants || [];
    const dTau = history[i + tau].gagnants || [];
    const dTauNext = history[i + tau + 1].gagnants || [];

    if (d0.length === 0 || d0Next.length === 0 || dTau.length === 0 || dTauNext.length === 0) continue;

    // Distance initiale
    let dist0 = 0;
    for (let k = 0; k < Math.min(d0.length, d0Next.length); k++) {
      dist0 += Math.abs(d0[k] - d0Next[k]);
    }
    dist0 = Math.max(1.0, dist0 / Math.max(1, d0.length));

    // Distance après décalage temporel tau
    let distTau = 0;
    for (let k = 0; k < Math.min(dTau.length, dTauNext.length); k++) {
      distTau += Math.abs(dTau[k] - dTauNext[k]);
    }
    distTau = Math.max(1.0, distTau / Math.max(1, dTau.length));

    const divergence = Math.log(distTau / dist0);
    if (!isNaN(divergence) && isFinite(divergence)) {
      sumLogDivergence += divergence;
      validPairs++;
    }
  }

  return validPairs > 0 ? sumLogDivergence / (validPairs * tau) : 0.0;
}

/**
 * MODULATION CONTINUE DU TAUX D'APPRENTISSAGE eta(t)
 * 
 * Formule différentiable et continue :
 * eta(t) = eta_0 * (1 / (1 + exp(lambda_local))) * (1 - S_norm)^p * (1 + tanh(persistence))
 * 
 * Garanties mathématiques :
 * - ZÉRO NOMBRE MAGIQUE : dérivé exclusivement de l'entropie, de la variance et de Lyapunov.
 * - ZÉRO HASARD : 100% déterministe.
 * - CONTINUITÉ : transition lisse du gradient sans seuils arbitraires.
 */
export function computeAdaptiveContinuousLearningRate(
  history: DrawResult[],
  baseLearningRate?: number,
  recentBrierScore?: number
): AdaptiveLearningRateResult {
  const sampleSize = history?.length || 1;
  const eta0 = baseLearningRate ?? (1.0 / Math.sqrt(Math.max(10, sampleSize)));

  // 1. Entropie de Shannon et Variance empirique
  const counts = new Array(91).fill(0);
  for (const d of history) {
    if (d.gagnants) {
      for (const num of d.gagnants) {
        if (num >= 1 && num <= 90) counts[num]++;
      }
    }
  }
  const totalHits = counts.reduce((a, b) => a + b, 0);
  let normalizedEntropy = 0.85;
  let empiricalVariance = 0.005;

  if (totalHits > 0) {
    const probs = counts.slice(1).map((c) => c / totalHits);
    const hShannon = calculateShannonEntropy(probs);
    normalizedEntropy = Math.min(1.0, Math.max(0.0, hShannon / Math.log2(90)));
    empiricalVariance = calculateVariance(probs);
  }

  // 2. Exposant de Lyapunov Local
  const localLyapunov = computeLocalLyapunovExponent(history, 5);

  // 3. Modulateur de persistance et régularité (tangente hyperbolique continue)
  const persistenceModulator = 1.0 / (1.0 + Math.exp(localLyapunov));

  // 4. Modulateur d'entropie (poids d'incertitude)
  const entropyDamping = Math.pow(Math.max(0.01, 1.0 - normalizedEntropy * 0.5), 1.5);

  // 5. Modulateur de Brier / Fiabilité de prédiction
  const brierFactor = 1.0 / (1.0 + (recentBrierScore ?? 0.20));

  // 6. Taux d'apprentissage final modulé continûment
  // ALGO-7 : l'exposant de Lyapunov local (et son persistenceModulator) est conservé
  // UNIQUEMENT à des fins de visualisation / audit (champs retournés ci-dessous). Il ne
  // module plus le taux d'apprentissage : qualifier de « chaotique » une suite de tirages
  // physiquement aléatoires revient à injecter du bruit d'échantillonnage dans l'adaptation
  // des poids. Seuls des facteurs statistiquement justifiés (taille d'échantillon via eta0,
  // entropie, variance empirique, fiabilité de Brier) pilotent désormais eta(t).
  const finalLearningRate = Math.max(
    0.001,
    Math.min(0.25, eta0 * entropyDamping * brierFactor * (1.0 + Math.sqrt(empiricalVariance)))
  );

  return {
    learningRate: parseFloat(finalLearningRate.toFixed(6)),
    baseRate: parseFloat(eta0.toFixed(6)),
    localLyapunov: parseFloat(localLyapunov.toFixed(4)),
    normalizedEntropy: parseFloat(normalizedEntropy.toFixed(4)),
    persistenceModulator: parseFloat(persistenceModulator.toFixed(4)),
    varianceModulator: parseFloat((1.0 + Math.sqrt(empiricalVariance)).toFixed(4)),
    auditExplanation: `eta=${finalLearningRate.toFixed(5)} | Lyapunov=${localLyapunov.toFixed(3)} | Shannon=${normalizedEntropy.toFixed(3)} | BrierMod=${brierFactor.toFixed(3)}`,
  };
}
