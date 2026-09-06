import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { GapDynamicsEngine } from '../gapDynamicsEngine';
import { evaluateKDE } from '../../kdeService';

/**
 * PROJECTEUR DE TENDANCE DES ÉCARTS (Gap Trend Projector)
 * Harmonisé et unifié sous GapDynamicsEngine.
 */
export const gapTrendPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_TREND,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Lissage exponentiel double de Holt (niveau + tendance), paramètres optimisés par minimisation du SSE in-sample',
  description: 'Modélise la tendance (accélération/ralentissement) de la séquence chronologique des écarts de chaque numéro, et projette la valeur attendue du prochain écart.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    GapDynamicsEngine.analyze(ctx);
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_TREND]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.GAP_TREND];
    const analysis = cache.perNumberAnalysis?.[num];

    if (!analysis || !analysis.hasPattern) {
      return { score: 50, confidence: 0.3, metadata: { hasPattern: false } };
    }

    const { currentOpenGap, projectedNextGap, volatility, trendDirection, numGaps, fitQuality } = analysis;
    const scale = Math.max(volatility, 1.0);
    const hurstExponent = ctx.statisticalBounds?.hurstExponent || 0.5;
    const slope = Math.log(Math.max(2, numGaps + 1)) * (1.0 + hurstExponent);

    const kdeRes = evaluateKDE([projectedNextGap - scale, projectedNextGap, projectedNextGap + scale], currentOpenGap);
    const parametricScore = 100.0 / (1.0 + Math.exp(-slope * (currentOpenGap - projectedNextGap) / scale));
    const normalizedScore = 0.65 * parametricScore + 0.35 * (kdeRes.cdf * 100.0);

    const sampleReliability = 1.0 - 1.0 / Math.sqrt(numGaps + 1);
    const confidence = Math.max(0.3, Math.min(0.95, 0.3 + 0.4 * sampleReliability + 0.25 * fitQuality));
    const trendLabel = trendDirection > 0.5 ? 'allongement' : trendDirection < -0.5 ? 'raccourcissement' : 'stable';

    return {
      score: Math.max(0, Math.min(100, normalizedScore)),
      confidence,
      metadata: {
        currentOpenGap,
        projectedNextGap: Number(projectedNextGap.toFixed(2)),
        trend: trendLabel,
        trendMagnitude: Number(trendDirection.toFixed(3)),
        fitQuality: Number(fitQuality.toFixed(3)),
        sampleSize: numGaps,
        localEntropy: cache.localEntropy,
        localHurst: cache.localHurst,
        mathematicalModel: 'Holt Double Exponential Smoothing (Unified GapDynamicsEngine)'
      }
    };
  }
};
