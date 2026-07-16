
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const markovPlugin: AlgorithmPlugin = {
  key: AlgoKey.MARKOV,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Probabilité de Transition de Chaîne de Markov d\'ordre 1 Normalisée Robuste',
  description: 'Analyse des transitions n -> n+1 avec normalisation robuste aux valeurs aberrantes.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const values = Array.from(ctx.features.markovMap).slice(1).filter(v => v > 0);
    let cacheVal;
    if (values.length === 0) {
      cacheVal = { median: 0, iqr: 1.0 };
    } else {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = Math.max(Number.EPSILON, q3 - q1);
      cacheVal = { median, iqr };
    }
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.MARKOV] = cacheVal;
  },
  evaluate(num, ctx) {
    const rawMarkov = Number(ctx.features.markovMap[num]) || 0.0;
    
    if (!ctx.pluginCache?.[AlgoKey.MARKOV]) {
      markovPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.MARKOV];
    const median = cache.median;
    const iqr = cache.iqr;
    
    // Integration de la succession du leader (Chaîne de plus haut degré)
    const leaderBoost = (ctx.advancedMetrics?.leaderSuccession as Record<number, number>)?.[num] || 0.0;
    const effectiveMarkov = rawMarkov * (1.0 + leaderBoost / 100.0);
    
    // Normalisation robuste (Robust Scaler) mappée via une CDF Logistique
    const slope = 1.0 / iqr;
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (effectiveMarkov - median)));
    
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { rawMarkov, leaderBoost }
    };
  }
};
