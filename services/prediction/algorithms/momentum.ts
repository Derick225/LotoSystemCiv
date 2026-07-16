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
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const iqr = Math.max(Number.EPSILON, q3 - q1);

    // 2. Diff stats
    const allDiffs: number[] = [];
    const maxNum = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
    
    const recentFreqs = new Array(maxNum + 1).fill(0);
    const olderFreqs = new Array(maxNum + 1).fill(0);
    
    ctx.history.slice(0, 10).forEach((d: any) => {
      if (Array.isArray(d.gagnants)) {
        d.gagnants.forEach((n: number) => {
          if (n <= maxNum) recentFreqs[n]++;
        });
      }
    });
    ctx.history.slice(10, 30).forEach((d: any) => {
      if (Array.isArray(d.gagnants)) {
        d.gagnants.forEach((n: number) => {
          if (n <= maxNum) olderFreqs[n]++;
        });
      }
    });
    
    for (let i = 1; i <= maxNum; i++) {
      allDiffs.push(Math.abs(recentFreqs[i] - olderFreqs[i] / 2.0));
    }
    
    const sortedDiffs = [...allDiffs].sort((a, b) => a - b);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)] || 0;
    const q1Diff = sortedDiffs[Math.floor(sortedDiffs.length * 0.25)] || 0;
    const q3Diff = sortedDiffs[Math.floor(sortedDiffs.length * 0.75)] || 0;
    const iqrDiff = Math.max(Number.EPSILON, q3Diff - q1Diff);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.MOMENTUM] = {
      median,
      iqr,
      medianDiff,
      iqrDiff,
      recentFreqs,
      olderFreqs
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

    // 2. Accélération (dérivée seconde)
    const recentFreq = cache.recentFreqs[num] || 0;
    const olderFreq = (cache.olderFreqs[num] || 0) / 2.0;
    const diff = recentFreq - olderFreq;
    
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
