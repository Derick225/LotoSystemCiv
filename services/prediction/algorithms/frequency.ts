
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const frequencyPlugin: AlgorithmPlugin = {
  key: AlgoKey.FREQUENCY,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Loi des Grands Nombres et Distribution Empirique Robuste',
  description: 'Évalue la fréquence historique normalisée de manière robuste aux valeurs aberrantes (outliers).',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const values = Array.from(ctx.features.freqMap).slice(1).filter(v => v > 0);
    let cacheVal;
    if (values.length === 0) {
      cacheVal = { median: 0, iqr: 1.0 };
    } else {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = Math.max(1e-6, q3 - q1);
      cacheVal = { median, iqr };
    }
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.FREQUENCY] = cacheVal;
  },
  evaluate(num, ctx) {
    const rawFreq = Number(ctx.features.freqMap[num]) || 0;
    
    if (!ctx.pluginCache?.[AlgoKey.FREQUENCY]) {
      frequencyPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.FREQUENCY];
    const median = cache.median;
    const iqr = cache.iqr;
    
    // Intégration de la racine numérique (Digital Root)
    const digitalRootBoost = (ctx.advancedMetrics?.digitalRoot as Record<number, number>)?.[num] || 0.0;
    
    const slope = 1.0 / iqr;
    const effectiveFreq = rawFreq * (1.0 + digitalRootBoost / 100.0);
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (effectiveFreq - median)));
    
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { rawFreq, digitalRootBoost }
    };
  }
};
