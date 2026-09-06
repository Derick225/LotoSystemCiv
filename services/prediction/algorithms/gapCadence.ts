import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { GapDynamicsEngine } from '../gapDynamicsEngine';
import { evaluateKDE } from '../../kdeService';

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const logistic = (x: number): number =>
  1 / (1 + Math.exp(-x));

/**
 * ALGORITHME DE CADENCE DES ÉCARTS (Gap Cadence)
 * Harmonisé et unifié sous GapDynamicsEngine.
 */
export const gapCadencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_CADENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Statistiques robustes d\'ordre (Médiane, IQR, Fences de Tukey continus) et KDE sur pool d\'écarts',
  description: 'Évalue la tension de cadence d\'un numéro par rapport aux statistiques d\'ordre et fences de Tukey continus.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    GapDynamicsEngine.analyze(ctx);
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_CADENCE]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAP_CADENCE];
    const profile = GapDynamicsEngine.getProfile(num, ctx);
    const currentGap = profile.currentOpenGap || Number(ctx.features.gapsMap?.[num]) || 0;

    // Estimation KDE continue
    const kdeRes = evaluateKDE(cache.sortedPooled, currentGap);
    const percentileScore = kdeRes.cdf * 100;

    // Z-score robuste via médiane + IQR
    const robustScale = Math.max(1, cache.pooledIqr / 1.349);
    const robustZ = (currentGap - cache.pooledMedian) / robustScale;
    const individualGapStrength = logistic((robustZ - 0.75) * 1.4);

    // Dépassement relatif du seuil de Tukey continu
    const tukeyExcess = cache.tukeyUpperFence > 0 ? (currentGap - cache.tukeyUpperFence) / cache.tukeyUpperFence : 0;
    const tukeyExcessStrength = logistic(tukeyExcess * 8);

    const intrinsicGapScore = 0.5 * percentileScore + 25 * individualGapStrength + 25 * tukeyExcessStrength;
    const regimeBoostStrength = cache.cadenceStrength * cache.cadenceReliability;
    const boostMultiplier = 1 + 0.55 * regimeBoostStrength;
    const eligibilityGate = 0.35 + 0.65 * individualGapStrength;

    const amplifiedScore = intrinsicGapScore * (1 + (boostMultiplier - 1) * eligibilityGate);
    const finalScore = clamp(amplifiedScore, 0, 100);

    const sampleConfidence = logistic((cache.pooledSampleSize - 40) * 0.08);
    const recentConfidence = logistic((cache.recentGapsCount - 8) * 0.25);
    const fenceStability = logistic((cache.pooledIqr - 2) * 0.4);

    const confidence = clamp(
      0.20 + 0.25 * sampleConfidence + 0.25 * recentConfidence + 0.15 * cache.cadenceReliability + 0.15 * fenceStability,
      0.25,
      0.92
    );

    return {
      score: finalScore,
      confidence,
      metadata: {
        currentGap,
        percentileScore: Number(percentileScore.toFixed(2)),
        intrinsicGapScore: Number(intrinsicGapScore.toFixed(2)),
        cadenceIntensity: Number(cache.cadenceIntensity.toFixed(4)),
        cadenceStrength: Number(cache.cadenceStrength.toFixed(4)),
        cadenceReliability: Number(cache.cadenceReliability.toFixed(4)),
        regimeBoostStrength: Number(regimeBoostStrength.toFixed(4)),
        individualGapStrength: Number(individualGapStrength.toFixed(4)),
        tukeyExcessStrength: Number(tukeyExcessStrength.toFixed(4)),
        tukeyUpperFence: Number(cache.tukeyUpperFence.toFixed(2)),
        pooledMedian: Number(cache.pooledMedian.toFixed(2)),
        pooledIqr: Number(cache.pooledIqr.toFixed(2)),
        recentBigReturns: cache.recentBigReturnsCount,
        recentGapsCount: cache.recentGapsCount,
        recentWindowSize: cache.recentWindowSize,
        pooledSampleSize: cache.pooledSampleSize,
        unifiedGapScore: Number(profile.unifiedScore.toFixed(2))
      }
    };
  }
};
