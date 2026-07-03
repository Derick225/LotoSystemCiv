import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

const getSpatialSigma = (ctx: any): number => 
  (ctx.advancedMetrics?.statisticalBounds?.variance || 900.0) / 30.0;

export const spatialPlugin: AlgorithmPlugin = {
  key: AlgoKey.SPATIAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Décroissance Gaussienne Spatiale et Diagnostic de Proximité Géométrique',
  description: 'Analyse géométrique unifiant les clusters spatiaux de Laplace et la proximité gaussienne.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const sigma = getSpatialSigma(ctx);
    
    let spatialStats = { median: 0, iqr: 1 };
    const spatial = ctx.advancedMetrics?.spatial;
    if (spatial && !Array.isArray(spatial) && typeof spatial === 'object') {
      const map = spatial as Record<number, number>;
      const values = Object.values(map).filter(v => v > 0);
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
        const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
        spatialStats = { median, iqr: Math.max(1e-6, q3 - q1) };
      }
    }
    
    let proximityStats = { median: 0, iqr: 1 };
    const proxValues = Object.values(ctx.advancedMetrics?.proximityDiagnostic || {}).filter(v => typeof v === 'number' && v > 0) as number[];
    if (proxValues.length > 0) {
      const sortedProx = [...proxValues].sort((a, b) => a - b);
      const medianProx = sortedProx[Math.floor(sortedProx.length / 2)] || 0;
      const q1Prox = sortedProx[Math.floor(sortedProx.length * 0.25)] || 0;
      const q3Prox = sortedProx[Math.floor(sortedProx.length * 0.75)] || 0;
      proximityStats = { median: medianProx, iqr: Math.max(1e-6, q3Prox - q1Prox) };
    }
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.SPATIAL] = { sigma, spatialStats, proximityStats };
  },
  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.SPATIAL]) {
      spatialPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.SPATIAL];
    
    // 1. Composante cluster spatial
    let normSpatial = 50.0;
    const spatial = ctx.advancedMetrics?.spatial;
    if (Array.isArray(spatial)) {
      let minSpatialDist = 999;
      spatial.forEach((sNum: number) => {
        minSpatialDist = Math.min(minSpatialDist, Math.abs(sNum - num));
      });
      normSpatial = 100.0 * Math.exp(-0.5 * Math.pow(minSpatialDist / cache.sigma, 2));
    } else if (spatial && typeof spatial === 'object') {
      const map = spatial as Record<number, number>;
      const val = map[num] || 0.0;
      const { median, iqr } = cache.spatialStats;
      const slope = 1.0 / iqr;
      normSpatial = 100.0 / (1.0 + Math.exp(-slope * (val - median)));
    }

    // 2. Diagnostic de Proximité (Proximity Diagnostic)
    const proximityVal = (ctx.advancedMetrics?.proximityDiagnostic as Record<number, number>)?.[num] || 0.0;
    const { median: medP, iqr: iqrP } = cache.proximityStats;
    const slopeProx = 1.0 / iqrP;
    const normProximity = 100.0 / (1.0 + Math.exp(-slopeProx * (proximityVal - medP)));

    // Fusion continue et intégration de l'anomalie spatio-topologique
    const anomalyBoost = (ctx.advancedMetrics?.anomalyDetection as Record<number, number>)?.[num] || 0.0;
    const baseFused = Math.sqrt(normSpatial * normProximity) || (normSpatial + normProximity) / 2.0;
    const fused = baseFused * (1.0 + anomalyBoost / 100.0);
    
    const score = Math.max(0.0, Math.min(100.0, fused));
    return {
      score,
      confidence: 0.95,
      metadata: { normSpatial, normProximity, anomalyBoost }
    };
  }
};
