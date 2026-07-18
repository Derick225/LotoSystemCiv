import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

interface GapCadenceCache {
  tukeyUpperFence: number;
  pooledMean: number;
  pooledStd: number;
  pooledMedian: number;
  pooledIqr: number;
  cadenceIntensity: number;
  cadenceStrength: number;
  cadenceReliability: number;
  sortedPooled: number[];
  recentWindowSize: number;
  recentBigReturnsCount: number;
  recentGapsCount: number;
  pooledSampleSize: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const logistic = (x: number): number =>
  1 / (1 + Math.exp(-x));

const mean = (arr: number[]): number =>
  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

const stdDev = (arr: number[], avg?: number): number => {
  if (arr.length === 0) return 1;
  const m = avg ?? mean(arr);
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length;
  return Math.sqrt(variance) || 1;
};

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const quantile = (arr: number[], q: number): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx] ?? sorted[sorted.length - 1];
};

const binarySearchPercentile = (sorted: number[], value: number): number => {
  if (sorted.length === 0) return 0.5;

  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }

  return lo / sorted.length;
};

export const gapCadencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_CADENCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis:
    'Détection de régime collectif via clôtures de Tukey, percentile empirique et calibration logistique continue',
  description:
    "Détecte si le tirage traverse une phase collective de retour de numéros retardataires et module en continu l'importance du gap individuel.",
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const history = ctx.history || [];
    const domainSize = ctx.features.freqMap?.length
      ? ctx.features.freqMap.length - 1
      : 90;
    const drawSize = history[0]?.gagnants?.length || 5;

    const pooledOccurrenceGaps: number[] = [];
    const lastSeenAtIndex: Record<number, number> = {};

    for (let i = history.length - 1; i >= 0; i--) {
      const draw = history[i];
      (draw.gagnants || []).forEach(num => {
        const prev = lastSeenAtIndex[num];
        const gap = prev !== undefined ? prev - i : null;
        if (gap !== null && gap > 0) {
          pooledOccurrenceGaps.push(gap);
        }
        lastSeenAtIndex[num] = i;
      });
    }

    const fallbackGap = domainSize / Math.max(1, drawSize);
    let pooledMean = fallbackGap;
    let pooledStd = Math.max(1, fallbackGap * 0.5);
    let pooledMedian = fallbackGap;
    let pooledIqr = Math.max(1, fallbackGap * 0.5);
    let tukeyUpperFence = fallbackGap;

    if (pooledOccurrenceGaps.length >= 8) {
      pooledMean = mean(pooledOccurrenceGaps);
      pooledStd = stdDev(pooledOccurrenceGaps, pooledMean);
      pooledMedian = median(pooledOccurrenceGaps);

      const q1 = quantile(pooledOccurrenceGaps, 0.25);
      const q3 = quantile(pooledOccurrenceGaps, 0.75);
      pooledIqr = Math.max(1e-6, q3 - q1);
      tukeyUpperFence = q3 + 1.5 * pooledIqr;
    }

    const recentWindowSize = Math.min(
      history.length,
      2 * Math.ceil(domainSize / Math.max(1, drawSize))
    );

    let recentGapsCount = 0;
    let recentBigReturnsCount = 0;
    const lastSeenForRecent: Record<number, number> = {};

    for (let i = history.length - 1; i >= 0; i--) {
      const draw = history[i];
      const isInRecentWindow = i < recentWindowSize;

      (draw.gagnants || []).forEach(num => {
        const prev = lastSeenForRecent[num];
        const gap = prev !== undefined ? prev - i : null;

        if (gap !== null && gap > 0 && isInRecentWindow) {
          recentGapsCount++;
          if (gap >= tukeyUpperFence) {
            recentBigReturnsCount++;
          }
        }

        lastSeenForRecent[num] = i;
      });
    }

    const cadenceIntensity =
      recentGapsCount > 0 ? recentBigReturnsCount / recentGapsCount : 0;

    // force continue du régime observé
    const cadenceStrength = logistic((cadenceIntensity - 0.18) * 10);

    // fiabilité liée à la quantité réelle d'observations récentes
    const cadenceReliability = logistic((recentGapsCount - 10) * 0.35);

    const sortedPooled = [...pooledOccurrenceGaps].sort((a, b) => a - b);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_CADENCE] = {
      tukeyUpperFence,
      pooledMean,
      pooledStd,
      pooledMedian,
      pooledIqr,
      cadenceIntensity,
      cadenceStrength,
      cadenceReliability,
      sortedPooled,
      recentWindowSize,
      recentBigReturnsCount,
      recentGapsCount,
      pooledSampleSize: pooledOccurrenceGaps.length
    } satisfies GapCadenceCache;
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_CADENCE]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.GAP_CADENCE] as GapCadenceCache;
    const currentGap = Number(ctx.features.gapsMap[num]) || 0;

    const percentile = binarySearchPercentile(cache.sortedPooled, currentGap);
    const percentileScore = percentile * 100;

    // z-score robuste via médiane + IQR
    const robustScale = Math.max(1, cache.pooledIqr / 1.349);
    const robustZ = (currentGap - cache.pooledMedian) / robustScale;

    // intensité individuelle d'écart atypique
    const individualGapStrength = logistic((robustZ - 0.75) * 1.4);

    // dépassement relatif du seuil de Tukey
    const tukeyExcess =
      cache.tukeyUpperFence > 0
        ? (currentGap - cache.tukeyUpperFence) / cache.tukeyUpperFence
        : 0;
    const tukeyExcessStrength = logistic(tukeyExcess * 8);

    // score individuel composite
    const intrinsicGapScore =
      0.5 * percentileScore +
      25 * individualGapStrength +
      25 * tukeyExcessStrength;

    // boost collectif : n'agit fortement que si le régime est à la fois intense et fiable
    const regimeBoostStrength =
      cache.cadenceStrength * cache.cadenceReliability;

    // amplification bornée, évite les emballements
    const boostMultiplier = 1 + 0.55 * regimeBoostStrength;

    // si le numéro n'est pas lui-même en retard significatif, le régime collectif ne doit pas trop l'aider
    const eligibilityGate = 0.35 + 0.65 * individualGapStrength;

    const amplifiedScore = intrinsicGapScore * (1 + (boostMultiplier - 1) * eligibilityGate);
    const finalScore = clamp(amplifiedScore, 0, 100);

    // confiance composite
    const sampleConfidence = logistic((cache.pooledSampleSize - 40) * 0.08);
    const recentConfidence = logistic((cache.recentGapsCount - 8) * 0.25);
    const fenceStability = logistic((cache.pooledIqr - 2) * 0.4);

    const confidence =
      0.20 +
      0.25 * sampleConfidence +
      0.25 * recentConfidence +
      0.15 * cache.cadenceReliability +
      0.15 * fenceStability;

    return {
      score: finalScore,
      confidence: clamp(confidence, 0.25, 0.92),
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
        pooledSampleSize: cache.pooledSampleSize
      }
    };
  }
};
