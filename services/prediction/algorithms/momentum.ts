import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const momentumPlugin: AlgorithmPlugin = {
  key: AlgoKey.MOMENTUM,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Dérivée Première (MOMENTUM) et Seconde (ACCELERATION) de la Vélocité Temporelle unifiée',
  description: 'Fusion cinématique continue de la vélocité récente vs profonde (momentum) et de l\'accélération des cycles d\'apparition.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    // 1. Momentum stats
    const values = Array.from(ctx.features.momentumMap).slice(1).filter(v => v > 0);
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    const median = n % 2 !== 0 ? (sorted[mid] || 0) : ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2;
    const q1 = sorted[Math.floor(n * 0.25)] || 0;
    const q3 = sorted[Math.floor(n * 0.75)] || 0;
    const iqr = Math.max(Number.EPSILON, q3 - q1);

    // 2. Adaptive window sizes derived from history length (no magic numbers)
    const T = ctx.history.length;
    const maxNum = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
    // Recent window: ~sqrt(T) draws, capped at T/4 to avoid overlap with older window
    const recentLen = Math.max(3, Math.min(Math.round(Math.sqrt(T)), Math.floor(T / 4)));
    // Older window: next 2*recentLen draws for a stable baseline
    const olderLen = Math.min(T - recentLen, 2 * recentLen);

    const recentFreqs = new Array(maxNum + 1).fill(0);
    const olderFreqs = new Array(maxNum + 1).fill(0);

    ctx.history.slice(0, recentLen).forEach((d: any) => {
      if (Array.isArray(d.gagnants)) {
        d.gagnants.forEach((n: number) => { if (n <= maxNum) recentFreqs[n]++; });
      }
    });
    ctx.history.slice(recentLen, recentLen + olderLen).forEach((d: any) => {
      if (Array.isArray(d.gagnants)) {
        d.gagnants.forEach((n: number) => { if (n <= maxNum) olderFreqs[n]++; });
      }
    });

    // Normalize older freqs to same window length as recent for fair comparison
    const normFactor = olderLen > 0 ? recentLen / olderLen : 1.0;
    const allDiffs: number[] = [];
    for (let i = 1; i <= maxNum; i++) {
      allDiffs.push(recentFreqs[i] - olderFreqs[i] * normFactor);
    }

    const sortedDiffs = [...allDiffs].sort((a, b) => a - b);
    const nd = sortedDiffs.length;
    const midD = Math.floor(nd / 2);
    const medianDiff = nd % 2 !== 0 ? sortedDiffs[midD] : (sortedDiffs[midD - 1] + sortedDiffs[midD]) / 2;
    const q1Diff = sortedDiffs[Math.floor(nd * 0.25)] || 0;
    const q3Diff = sortedDiffs[Math.floor(nd * 0.75)] || 0;
    const iqrDiff = Math.max(Number.EPSILON, q3Diff - q1Diff);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.MOMENTUM] = {
      median, iqr, medianDiff, iqrDiff, recentFreqs, olderFreqs, normFactor, recentLen, olderLen
    };
  },
  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.MOMENTUM]) {
      momentumPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.MOMENTUM];
    
    // 1. Momentum
    const rawMom = Number(ctx.features.momentumMap[num]) || 0.0;
    const slope = 1.0 / cache.iqr;
    const normMomentum = 100.0 / (1.0 + Math.exp(-slope * (rawMom - cache.median)));

    // 2. Accélération (dérivée seconde) — normalized diff
    const recentFreq = cache.recentFreqs[num] || 0;
    const olderFreqNorm = (cache.olderFreqs[num] || 0) * (cache.normFactor || 1.0);
    const diff = recentFreq - olderFreqNorm;
    
    const slopeDiff = 1.0 / cache.iqrDiff;
    const normAcceleration = 100.0 / (1.0 + Math.exp(-slopeDiff * (diff - cache.medianDiff)));

    // 3. Modèle de Hawkes (Excitation Temporelle)
    const hawkesBoost = (ctx.advancedMetrics?.hawkesExcitation as Record<number, number>)?.[num] || 0.0;

    // Fusion continue (dérivée temporelle unifiée modifiée par Hawkes)
    const baseFused = Math.sqrt(normMomentum * normAcceleration) || (normMomentum + normAcceleration) / 2.0;
    const fused = baseFused * (1.0 + hawkesBoost / 100.0);
    const score = Math.max(0.0, Math.min(100.0, fused));
    return {
      score,
      confidence: 0.95,
      metadata: { rawMom, diff, hawkesBoost }
    };
  }
};
