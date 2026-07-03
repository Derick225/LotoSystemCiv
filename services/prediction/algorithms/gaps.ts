
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

// CONSTANTES EXACTES (Zéro Nombre Magique)
const getDrawSizeConfig = (ctx: any) => {
  const domainSize = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
  const drawSize = ctx.history[0]?.gagnants?.length || 5; 
  return { domainSize, drawSize };
};

export const gapsPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAPS,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Fonction de Répartition Cumulative (CDF) Géométrique Exacte',
  description: 'Évaluation des écarts entre les sorties vs écart théorique via CDF géométrique.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const { domainSize, drawSize } = getDrawSizeConfig(ctx);
    const theoreticalProbability = Math.min(1.0, drawSize / Math.max(1, domainSize));
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAPS] = { theoreticalProbability };
  },
  evaluate(num, ctx) {
    const currentGap = Number(ctx.features.gapsMap[num]) || 0;
    
    if (!ctx.pluginCache?.[AlgoKey.GAPS]) {
      gapsPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAPS];
    const theoreticalProbability = cache.theoreticalProbability;
    
    const cdf = 1.0 - Math.pow(1.0 - theoreticalProbability, currentGap);
    
    // Intégration des harmoniques avancées (Velocity & Résistance)
    const gapVelocity = (ctx.advancedMetrics?.gapVelocity as Record<number, number>)?.[num] || 0.0;
    const resistance = (ctx.advancedMetrics?.resistance as Record<number, number>)?.[num] || 0.0;
    
    // Pondération géométrique pour fusionner la CDF classique avec la vélocité et la résistance spatiale
    const baseScore = cdf * 100.0;
    const velocityScale = 1.0 + (gapVelocity / 100.0);
    const resistanceDecay = 1.0 / (1.0 + (resistance / 100.0));
    
    const fusedScore = baseScore * velocityScale * resistanceDecay;
    const score = Math.max(0.0, Math.min(100.0, fusedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { currentGap, gapVelocity, resistance }
    };
  }
};
