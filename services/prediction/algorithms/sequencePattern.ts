import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { sequencePatternAnalyzer } from '../sequencePatternAnalyzer';

export const sequencePatternPlugin: AlgorithmPlugin = {
  key: AlgoKey.SEQUENCE_PATTERN,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Fenêtre glissante configurable pour détection de patterns stochastiques déterministes sur séquences d\'écarts',
  description: 'Analyse l\'historique pour identifier des récurrences dans les séquences d\'écarts et extraire un signal continu basé sur les correspondances de fenêtre (sliding window).',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const drawName = ctx.drawName || '';
    const results = sequencePatternAnalyzer.analyze(drawName, ctx.history, {
      slidingWindowSize: 3,
      minRecurrenceThreshold: 0.1,
      maxNumber: 90
    });
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache['SEQUENCE_PATTERN'] = { results };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.['SEQUENCE_PATTERN']) {
      this.precompute(ctx);
    }
    
    const cache = ctx.pluginCache!['SEQUENCE_PATTERN'];
    const results = cache.results as any[];
    
    const stat = results.find(r => r.number === num);
    
    if (!stat) {
      return { score: 0, confidence: 0 };
    }
    
    return {
      score: stat.stochasticScore,
      confidence: stat.bestMatch ? stat.bestMatch.confidence / 100 : 0.3,
      metadata: {
        currentGap: stat.currentGap,
        bestMatch: stat.bestMatch
      }
    };
  }
};
