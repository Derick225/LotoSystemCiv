import { AlgorithmPlugin } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';

/**
 * ============================================================================
 *               TOPOLOGICAL SHADOW PROBABILITY PLUGIN (GAUSSIAN NOYAU)
 * ============================================================================
 * Basis: Continuous Gaussian Kernel Smoothing on Domain Space.
 *
 * Theory:
 * The topological shadow represents the spillover probability of drawn numbers over
 * their immediate adjacent domain neighbors. Using a Gaussian kernel:
 *   K(x, y) = exp( - (d(x, y))^2 / (2 * sigma^2) )
 * To cover 99.7% of the [1, 90] space without boundary distortion, sigma is derived
 * from the domain width:
 *   sigma = DOMAIN_SIZE / 6.0 = 90.0 / 6.0 = 15.0
 * The distance d(x, y) is calculated circularly to account for periodic modular boundary
 * behavior in lotto spaces.
 */
export const shadowProbabilityPlugin: AlgorithmPlugin = {
  key: AlgoKey.SHADOW_PROBABILITY,
  category: 'advanced',
  stability: 'volatile',
  mathematicalBasis: 'Noyau Gaussien Continu et Topologie de Voisinage Circulaire',
  description: 'Évalue la probabilité de spillover topologique en lissant l\'impact des derniers gagnants par un Noyau Gaussien (Sigma = 15.0, couvrant 99.7% du domaine).',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const DOMAIN_SIZE = 90;
    const sigma = DOMAIN_SIZE / 6.0; // 15.0 (covers 99.7% of the distribution)
    const varG = sigma * sigma;

    const shadowScores = new Float64Array(DOMAIN_SIZE + 1);

    // Get the most recent draw winners as the center of our Gaussian kernels
    const lastDraw = ctx.history[0];
    const winners = lastDraw ? (lastDraw.gagnants || []) : [];

    for (let num = 1; num <= DOMAIN_SIZE; num++) {
      let kernelSum = 0;
      for (const winner of winners) {
        // Gaussian distance in the circular space [1, 90]
        const dDirect = Math.abs(num - winner);
        const dCircular = Math.min(dDirect, DOMAIN_SIZE - dDirect);
        const kValue = Math.exp(- (dCircular * dCircular) / (2.0 * varG));
        kernelSum += kValue;
      }
      // Normalize by the number of winners to keep in [0, 1]
      const avgKernel = winners.length > 0 ? kernelSum / winners.length : 0;
      shadowScores[num] = avgKernel * 100.0; // scale to [0, 100]
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.SHADOW_PROBABILITY] = shadowScores;
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.SHADOW_PROBABILITY]) {
      this.precompute(ctx);
    }
    const score = ctx.pluginCache![AlgoKey.SHADOW_PROBABILITY][num] || 0.0;
    return {
      score: Math.max(0.0, Math.min(100.0, score)),
      confidence: 0.80,
      metadata: {
        gaussianSigma: 90.0 / 6.0,
        basis: 'Continuous Gaussian Kernel Smoothing'
      }
    };
  }
};

/**
 * ============================================================================
 *               NETWORK CORRELATION PLUGIN (GLOBAL GRAPH LIFT)
 * ============================================================================
 * Basis: Conditional Probabilities and Statistical Lift.
 *
 * Theory:
 * Instead of computing a heuristic or black-box centrality, this plugin computes
 * the continuous "Lift" in the global affinity network graph.
 * For any two numbers A and B, the Lift is defined as:
 *   Lift(A, B) = P(A | B) - P(A)
 * Where:
 *   P(A) is the marginal probability of number A.
 *   P(A | B) = P(A ∩ B) / P(B) is the conditional probability of A given B.
 * The overall Network Correlation score for A is the average Lift across all other
 * active numbers B in the domain, mapped continuously using a logistic sigmoid.
 */
export const networkCorrelationPlugin: AlgorithmPlugin = {
  key: AlgoKey.NETWORK_CORRELATION,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Score de Lift Statistique Continu d\'Affinité P(A|B) - P(A)',
  description: 'Score issu du Lift moyen continu de co-occurrence de chaque numéro au sein du graphe d\'affinités réelles.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const DOMAIN_SIZE = 90;
    const history = ctx.history;
    const totalDraws = history.length;
    
    const networkScores = new Float64Array(DOMAIN_SIZE + 1);
    if (totalDraws === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.NETWORK_CORRELATION] = networkScores;
      return;
    }

    // 1. Compute marginal counts P(X) and joint co-occurrence counts
    const counts = new Float64Array(DOMAIN_SIZE + 1);
    const coCounts = Array(DOMAIN_SIZE + 1).fill(0).map(() => new Float64Array(DOMAIN_SIZE + 1));

    for (const draw of history) {
      const winners = draw.gagnants || [];
      for (let i = 0; i < winners.length; i++) {
        const u = winners[i];
        if (u >= 1 && u <= DOMAIN_SIZE) counts[u]++;
        for (let j = i + 1; j < winners.length; j++) {
          const v = winners[j];
          if (v >= 1 && v <= DOMAIN_SIZE) {
            coCounts[u][v]++;
            coCounts[v][u]++;
          }
        }
      }
    }

    const P = new Float64Array(DOMAIN_SIZE + 1);
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      P[i] = counts[i] / totalDraws;
    }

    for (let A = 1; A <= DOMAIN_SIZE; A++) {
      let liftSum = 0;
      let countNeighbors = 0;
      
      const pA = P[A];
      if (pA === 0) continue;

      for (let B = 1; B <= DOMAIN_SIZE; B++) {
        if (A === B) continue;
        const pB = P[B];
        if (pB === 0) continue;

        // P(A|B) = P(A and B) / P(B)
        const pAandB = coCounts[A][B] / totalDraws;
        const pAgivenB = pAandB / pB;

        // Lift defined as P(A|B) - P(A)
        const lift = pAgivenB - pA;
        liftSum += lift;
        countNeighbors++;
      }

      const avgLift = countNeighbors > 0 ? liftSum / countNeighbors : 0.0;
      
      // Map average Lift to a beautiful continuous score in [0, 100] using a sigmoid
      // Centered at 50, with slope adjusted for the typical small scale of marginal probabilities
      const score = 100.0 / (1.0 + Math.exp(-150.0 * avgLift));
      networkScores[A] = score;
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.NETWORK_CORRELATION] = networkScores;
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.NETWORK_CORRELATION]) {
      this.precompute(ctx);
    }
    const score = ctx.pluginCache![AlgoKey.NETWORK_CORRELATION][num] || 0.0;
    return {
      score: Math.max(0.0, Math.min(100.0, score)),
      confidence: 0.85,
      metadata: {
        basis: 'Conditional Probability Lift P(A|B) - P(A)'
      }
    };
  }
};

/**
 * ============================================================================
 *               ISOLATION ANOMALY PLUGIN (VARIANCE-WEIGHTED FUSION)
 * ============================================================================
 * Basis: Inverse-Variance Weighted Estimation.
 *
 * Theory:
 * Under the Gauss-Markov theorem, the minimum variance unbiased estimator (MVUE)
 * of a joint signal is the inverse-variance weighted average of individual independent estimators.
 * We extract:
 *   X_anomaly = anomalyDetection score
 *   X_gap = raw gap score
 * We compute their sample variances (var_anomaly, var_gap) across the 90 numbers.
 * The fused score is calculated as:
 *   Fused = ( (X_anomaly / var_anomaly) + (X_gap / var_gap) ) / ( (1 / var_anomaly) + (1 / var_gap) )
 * This guarantees mathematically optimal signal fusion with zero hardcoded thresholds.
 */
export const isolationAnomalyPlugin: AlgorithmPlugin = {
  key: AlgoKey.ISOLATION_ANOMALY,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Fusion de Signaux Optimale par Pondération Inverse de la Variance (Gauss-Markov)',
  description: 'Fusionne de manière optimale les scores d\'anomalie et d\'écart par l\'inverse de leur variance d\'échantillon pour maximiser le rapport signal/bruit.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const DOMAIN_SIZE = 90;
    const anomalies = new Float64Array(DOMAIN_SIZE + 1);
    const gaps = new Float64Array(DOMAIN_SIZE + 1);

    const anomalyMap = ctx.advancedMetrics?.anomalyDetection || {};
    
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      anomalies[i] = Number(anomalyMap[i]) || 0.0;
      gaps[i] = Number(ctx.features.gapsMap[i]) || 0.0;
    }

    // Compute sample means
    let meanAnomaly = 0;
    let meanGap = 0;
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      meanAnomaly += anomalies[i];
      meanGap += gaps[i];
    }
    meanAnomaly /= DOMAIN_SIZE;
    meanGap /= DOMAIN_SIZE;

    // Compute sample variances
    let varAnomaly = 0;
    let varGap = 0;
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      varAnomaly += Math.pow(anomalies[i] - meanAnomaly, 2);
      varGap += Math.pow(gaps[i] - meanGap, 2);
    }
    
    // Prevent division by zero with EPSILON fallback
    varAnomaly = Math.max(Number.EPSILON, varAnomaly / DOMAIN_SIZE);
    varGap = Math.max(Number.EPSILON, varGap / DOMAIN_SIZE);

    // Inverse variance weights
    const wAnomaly = 1.0 / varAnomaly;
    const wGap = 1.0 / varGap;
    const wSum = wAnomaly + wGap;

    const fusedScores = new Float64Array(DOMAIN_SIZE + 1);
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      const fusedValue = (anomalies[i] * wAnomaly + gaps[i] * wGap) / wSum;
      fusedScores[i] = Math.max(0.0, Math.min(100.0, fusedValue));
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.ISOLATION_ANOMALY] = {
      fusedScores,
      varAnomaly,
      varGap
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.ISOLATION_ANOMALY]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.ISOLATION_ANOMALY];
    const score = cache.fusedScores[num] || 0.0;
    return {
      score: score,
      confidence: 0.90,
      metadata: {
        varAnomaly: parseFloat(cache.varAnomaly.toFixed(4)),
        varGap: parseFloat(cache.varGap.toFixed(4)),
        basis: 'Inverse-Variance Weighted Fusion (Gauss-Markov)'
      }
    };
  }
};

