
import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { evaluateKDE, calculateSilvermanBandwidth } from '../../kdeService';

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
  mathematicalBasis: 'Fusion de la CDF Géométrique Exacte et de l\'Estimation par Noyau de Densité (KDE) Continue',
  description: 'Évaluation des écarts entre les sorties vs écart théorique via CDF géométrique enrichie par lissage continu KDE sur l\'historique des écarts.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const { domainSize, drawSize } = getDrawSizeConfig(ctx);
    const theoreticalProbability = Math.min(1.0, drawSize / Math.max(1, domainSize));
    
    // Collect all current gaps across the population for KDE empirical smoothing
    const currentGapsList: number[] = [];
    if (ctx.features.gapsMap) {
      for (let i = 1; i <= domainSize; i++) {
        if (typeof ctx.features.gapsMap[i] === 'number') {
          currentGapsList.push(ctx.features.gapsMap[i]);
        }
      }
    }

    const kdeBandwidth = calculateSilvermanBandwidth(currentGapsList.length > 0 ? currentGapsList : [10]);

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAPS] = { 
      theoreticalProbability,
      currentGapsList,
      kdeBandwidth
    };
  },
  evaluate(num, ctx) {
    const currentGap = Number(ctx.features.gapsMap[num]) || 0;
    
    if (!ctx.pluginCache?.[AlgoKey.GAPS]) {
      gapsPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.GAPS];
    const theoreticalProbability = cache.theoreticalProbability;
    const currentGapsList: number[] = cache.currentGapsList || [];
    
    // 1. Theoretical Geometric CDF
    const geomCdf = 1.0 - Math.pow(1.0 - theoreticalProbability, currentGap);

    // 2. Continuous Empirical KDE Probability & Density Estimation
    const kdeRes = evaluateKDE(currentGapsList, currentGap, cache.kdeBandwidth);
    const empiricalKdeCdf = kdeRes.cdf;

    // Fused Continuous CDF: 60% theoretical geometric + 40% empirical continuous KDE
    const fusedCdf = 0.60 * geomCdf + 0.40 * empiricalKdeCdf;
    
    // Intégration des harmoniques avancées (Velocity & Résistance)
    const gapVelocity = (ctx.advancedMetrics?.gapVelocity as Record<number, number>)?.[num] || 0.0;
    const resistance = (ctx.advancedMetrics?.resistance as Record<number, number>)?.[num] || 0.0;
    
    // Pondération géométrique pour fusionner la CDF classique avec la vélocité et la résistance spatiale
    const baseScore = fusedCdf * 100.0;
    const velocityScale = 1.0 + (gapVelocity / 100.0);
    const resistanceDecay = 1.0 / (1.0 + (resistance / 100.0));
    
    const fusedScore = baseScore * velocityScale * resistanceDecay;
    const score = Math.max(0.0, Math.min(100.0, fusedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { currentGap, gapVelocity, resistance, kdePdf: Number(kdeRes.pdf.toFixed(4)), kdeCdf: Number(empiricalKdeCdf.toFixed(4)), bandwidth: Number(cache.kdeBandwidth.toFixed(2)) }
    };
  }
};

