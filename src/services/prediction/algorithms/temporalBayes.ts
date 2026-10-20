import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

/**
 * ============================================================================
 *               TEMPORAL & POISSON FUSION PLUGIN
 * ============================================================================
 * Basis: Weighted Geometric Mean of Temporal Trend and Poisson Expected Value.
 *
 * Theory:
 * Combines deep temporal survival trend estimations (survival times) and localized 
 * Poisson event probability rates. Under independent Poisson processes, the survival 
 * time is exponentially distributed. The fusion combines these dual aspects of timing
 * and frequency via a continuous, robust Weighted Geometric Mean to avoid zero-collapse
 * using an EPSILON floor.
 */
export const temporalPlugin: AlgorithmPlugin = {
  key: AlgoKey.TEMPORAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Fusion de Modèle Temporel Continu (Survie) et de Loi de Poisson',
  description: 'Modèle temporel unifié combinant les tendances temporelles profondes et l\'espérance mathématique de Poisson via une moyenne géométrique pondérée continue.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const DOMAIN_SIZE = 90;
    const tempScores = new Float64Array(DOMAIN_SIZE + 1);
    const poissonScores = new Float64Array(DOMAIN_SIZE + 1);
    const temporalMap = (ctx.advancedMetrics?.temporal as Record<number, number>) || {};
    const poissonMap = (ctx.advancedMetrics?.poisson as Record<number, number>) || {};
    
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      tempScores[i] = Number(temporalMap[i]) || 0.0;
      poissonScores[i] = Number(poissonMap[i]) || 0.0;
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.TEMPORAL] = {
      tempScores,
      poissonScores
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.TEMPORAL]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.TEMPORAL];
    const tempVal = cache.tempScores[num] || 0.0;
    const poissonVal = cache.poissonScores[num] || 0.0;

    // Adaptive weights derived from Hurst exponent:
    // High persistence (H→1): temporal trend dominates; high randomness (H→0): Poisson dominates
    const H = ctx.statisticalBounds?.hurstExponent ?? 0.5;
    const wTemporal = 0.3 + 0.4 * H;       // [0.3, 0.7]
    const wPoisson  = 1.0 - wTemporal;      // [0.3, 0.7]

    const safeTemp = Math.max(Number.EPSILON, tempVal);
    const safePoisson = Math.max(Number.EPSILON, poissonVal);

    const fusedVal = Math.pow(safeTemp, wTemporal) * Math.pow(safePoisson, wPoisson);
    const score = Math.max(0.0, Math.min(100.0, fusedVal));

    return {
      score,
      confidence: 0.95,
      metadata: {
        tempVal: parseFloat(tempVal.toFixed(4)),
        poissonVal: parseFloat(poissonVal.toFixed(4)),
        weightTemporal: parseFloat(wTemporal.toFixed(4)),
        weightPoisson: parseFloat(wPoisson.toFixed(4)),
        fusionMethod: 'Adaptive Weighted Geometric Mean (Hurst-derived)'
      }
    };
  }
};

/**
 * ============================================================================
 *               BAYESIAN POSTERIOR INFERENCE PLUGIN
 * ============================================================================
 * Basis: Bayesian Conjugate Prior Update with Bounded AI Intuition.
 *
 * Theory:
 * Estimates the posterior probability of a number being drawn given historic evidence.
 * It blends the pure Bayesian conjugate evidence score with the high-dimensional
 * AI Intuition (Meta LLM) pattern matcher, capping the positive boost to +50% to prevent
 * mathematical explosions.
 */
export const bayesPlugin: AlgorithmPlugin = {
  key: AlgoKey.BAYES,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Inférence Bayesienne et Probabilité Conditionnelle Continue (Modulée par l\'Intuition du Meta LLM)',
  description: 'Évalue les probabilités a posteriori bayésiennes pour chaque numéro avec un ajustement d\'ensemble LLM borné.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const DOMAIN_SIZE = 90;
    const bayesScores = new Float64Array(DOMAIN_SIZE + 1);
    const aiScores = new Float64Array(DOMAIN_SIZE + 1);
    const bayesMap = (ctx.advancedMetrics?.bayes as Record<number, number>) || {};
    const aiMap = (ctx.advancedMetrics?.aiIntuition as Record<number, number>) || {};

    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      bayesScores[i] = Number(bayesMap[i]) || 0.0;
      aiScores[i] = Number(aiMap[i]) || 0.0;
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.BAYES] = {
      bayesScores,
      aiScores
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.BAYES]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.BAYES];
    const bayesVal = cache.bayesScores[num] || 0.0;
    const aiVal = cache.aiScores[num] || 0.0;
    
    // Bounded continuous modulation to prevent signal explosion (capping maximum AI boost to +50%)
    const boundedAiVal = Math.max(-50.0, Math.min(50.0, aiVal));
    const fusedVal = bayesVal * (1.0 + boundedAiVal / 100.0);
    const score = Math.max(0.0, Math.min(100.0, fusedVal));

    return {
      score,
      confidence: 0.95,
      metadata: { 
        bayesVal: parseFloat(bayesVal.toFixed(4)), 
        aiVal: parseFloat(aiVal.toFixed(4)),
        boundedAiVal: parseFloat(boundedAiVal.toFixed(4)),
        fusionMethod: 'Bayesian Evidence with Bounded AI Escalation'
      }
    };
  }
};
