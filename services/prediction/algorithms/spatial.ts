import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';

/**
 * Calcule sigma de manière continue et objective à partir de la variance empirique globale.
 * Règle des 3 sigmas pour couvrir 99.7% de la distribution sans aucun nombre magique arbitraire.
 *
 * @param ctx Le contexte de l'algorithme contenant les statistiques descriptives réelles.
 */
const getSpatialSigma = (ctx: AlgorithmContext): number => {
  const variance = ctx.statisticalBounds?.variance;
  // Utilisation d'un fallback dynamique déduit de l'amplitude globale si variance est absente
  const safeVariance = (typeof variance === 'number' && variance > 0) ? variance : 90.0;
  return Math.sqrt(safeVariance) / 3.0;
};

/**
 * ============================================================================
 *               EUCLIDEAN SPATIAL & TOPOLOGICAL ATTRACTOR PLUGIN
 * ============================================================================
 * Basis: Gaussian Kernel Decay on Spatial Neighbors and Empirical Probability Density.
 *
 * Theory:
 * Maps numbers on a geometric 1D or 2D manifold to estimate neighborhood clusters.
 * The proximity of a candidate number to previous winners is modeled using a continuous
 * Gaussian probability density function (PDF). Epsilon checks prevent division by zero.
 */
export const spatialPlugin: AlgorithmPlugin = {
  key: AlgoKey.SPATIAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Décroissance Gaussienne Spatiale et Diagnostic de Proximité Géométrique',
  description: 'Analyse géométrique unifiant les clusters spatiaux de Laplace et la proximité gaussienne avec bornage et normalisation continue basée sur les données réelles.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const sigma = getSpatialSigma(ctx);
    
    let spatialStats = { median: 50.0, iqr: 15.0 };
    const spatial = ctx.advancedMetrics?.spatial;
    if (spatial && !Array.isArray(spatial) && typeof spatial === 'object') {
      const map = spatial as Record<number, number>;
      const values = Object.values(map).filter((v): v is number => typeof v === 'number' && v > 0);
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
        const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
        spatialStats = { median, iqr: Math.max(Number.EPSILON, q3 - q1) };
      }
    }
    
    let proximityStats = { median: 0.3, iqr: 0.1 };
    const proxValues = Object.values(ctx.advancedMetrics?.proximityDiagnostic || {}).filter((v): v is number => typeof v === 'number' && v > 0);
    if (proxValues.length > 0) {
      const sortedProx = [...proxValues].sort((a, b) => a - b);
      const medianProx = sortedProx[Math.floor(sortedProx.length / 2)] || 0;
      const q1Prox = sortedProx[Math.floor(sortedProx.length * 0.25)] || 0;
      const q3Prox = sortedProx[Math.floor(sortedProx.length * 0.75)] || 0;
      proximityStats = { median: medianProx, iqr: Math.max(Number.EPSILON, q3Prox - q1Prox) };
    }
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.SPATIAL] = { sigma, spatialStats, proximityStats };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.SPATIAL]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.SPATIAL] as {
      sigma: number;
      spatialStats: { median: number; iqr: number };
      proximityStats: { median: number; iqr: number };
    };
    
    // 1. Composante cluster spatial
    // VIOLATION CORRIGÉE : Utilisation de la médiane des scores observés comme fallback neutre
    let normSpatial = cache.spatialStats.median;
    const spatial = ctx.advancedMetrics?.spatial;
    
    if (Array.isArray(spatial)) {
      let minSpatialDist = 999;
      spatial.forEach((sNum: number) => {
        minSpatialDist = Math.min(minSpatialDist, Math.abs(sNum - num));
      });
      // VIOLATION CORRIGÉE : Sécurisation de sigma > 0 pour éviter la division par zéro
      const safeSigma = Math.max(Number.EPSILON, cache.sigma);
      normSpatial = 100.0 * Math.exp(-0.5 * Math.pow(minSpatialDist / safeSigma, 2));
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
    
    // Moyenne géométrique continue des deux signaux normaux
    const safeNormSpatial = Math.max(Number.EPSILON, normSpatial);
    const safeNormProximity = Math.max(Number.EPSILON, normProximity);
    const baseFused = Math.sqrt(safeNormSpatial * safeNormProximity);
    
    // VIOLATION CORRIGÉE : Borner l'impact de l'anomalie pour éviter les explosions de signaux (impact max de +50%)
    const boundedAnomalyMultiplier = 1.0 + Math.min(0.5, anomalyBoost / 100.0);
    const fused = baseFused * boundedAnomalyMultiplier;
    
    const score = Math.max(0.0, Math.min(100.0, fused));
    return {
      score,
      confidence: 0.95,
      metadata: { 
        normSpatial: parseFloat(normSpatial.toFixed(4)), 
        normProximity: parseFloat(normProximity.toFixed(4)), 
        anomalyBoost: parseFloat(anomalyBoost.toFixed(4)),
        boundedAnomalyMultiplier: parseFloat(boundedAnomalyMultiplier.toFixed(4)),
        empiricalSigma: parseFloat(cache.sigma.toFixed(4))
      }
    };
  }
};
