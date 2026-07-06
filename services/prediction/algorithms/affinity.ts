import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const affinityPlugin: AlgorithmPlugin = {
  key: AlgoKey.AFFINITY,
  category: 'advanced',
  stability: 'experimental',
  mathematicalBasis: 'Fusion de Co-occurrence d\'Affinité',
  description: 'Unification continue des forces d\'attraction bidirectionnelles.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const domainSize = ctx.features.markovMap.length;
    const maxNum = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
    const rawAffinityScores = new Array(maxNum + 1).fill(0.0);
    const medians = new Array(maxNum + 1).fill(0.0);
    const iqrs = new Array(maxNum + 1).fill(1.0);
    
    for (let num = 1; num <= maxNum; num++) {
      const affinityArr = ctx.features.affinityMap[num];
      if (affinityArr) {
        let rawAffinityScore = 0.0;
        for (let i = 1; i < domainSize; i++) {
          const markovProb = Number(ctx.features.markovMap[i]) || 0.0;
          const affinityProb = Number(affinityArr[i]) || 0.0;
          rawAffinityScore += markovProb * affinityProb;
        }
        rawAffinityScores[num] = rawAffinityScore;
        
        const values = Array.from(affinityArr).slice(1);
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
        const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
        const iqr = Math.max(1e-6, q3 - q1);
        
        medians[num] = median;
        iqrs[num] = iqr;
      }
    }
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.AFFINITY] = {
      rawAffinityScores,
      medians,
      iqrs
    };
  },
  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.AFFINITY]) {
      affinityPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.AFFINITY];
    const rawAffinityScore = cache.rawAffinityScores[num] || 0.0;
    const median = cache.medians[num] || 0.0;
    const iqr = cache.iqrs[num] || 1.0;
    
    const zScore = (rawAffinityScore - median) / iqr;
    const normAffinity = 100.0 / (1.0 + Math.exp(-zScore));

    const score = Math.max(0.0, Math.min(100.0, normAffinity));
    return {
      score,
      confidence: 0.85,
      metadata: { rawAffinityScore, zScore }
    };
  }
};
