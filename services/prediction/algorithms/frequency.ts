
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const frequencyPlugin: AlgorithmPlugin = {
  key: AlgoKey.FREQUENCY,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Loi des Grands Nombres et Distribution Empirique Robuste',
  description: 'Évalue la fréquence historique normalisée de manière robuste aux valeurs aberrantes (outliers).',
  isStrictlyDeterministic: true,
  /**
   * Precomputes median and IQR of frequencies.
   * Uses Number.EPSILON to guarantee division safety.
   */
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
      const iqr = Math.max(Number.EPSILON, q3 - q1);
      cacheVal = { median, iqr };
    }
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.FREQUENCY] = cacheVal;
  },
  /**
   * Evaluates the frequency score of a number.
   * 
   * CRITICAL DESIGN DECISION:
   * Any non-statistical heuristics (such as Digital Root / Numerology) have been completely removed
   * to strictly adhere to the project's statistical philosophy of "Zero Non-Statistical Heuristics".
   * Under the Law of Large Numbers, the expectation of draws is independent of digit sums, and 
   * injecting numerological boosts would distort the gradient landscape and compromise prediction rigor.
   */
  evaluate(num, ctx) {
    const rawFreq = Number(ctx.features.freqMap[num]) || 0;
    
    if (!ctx.pluginCache?.[AlgoKey.FREQUENCY]) {
      frequencyPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.FREQUENCY];
    const median = cache.median;
    const iqr = cache.iqr;
    
    const slope = 1.0 / iqr;
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (rawFreq - median)));
    
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { rawFreq }
    };
  }
};
