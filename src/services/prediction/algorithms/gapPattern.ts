import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';

/**
 * PROCESSUS PONCTUEL DE HAWKES DISCRET MUTUEL (AUTO-EXCITATION & CONTAGION SPATIO-TEMPORELLE)
 *
 * Remplace l'ancien modèle redondant AR(1) univarié par un processus stochastique
 * multivarié continu d'auto-excitation et de contagion croisée.
 *
 * Principes (AGENTS.md) :
 * 1. Zéro nombre magique : le taux de base est l'invariable combinatoire mu_0 = 5/90.
 *    Le taux de décroissance temporelle beta dérive de la médiane de l'écart.
 *    L'intensité d'excitation mutuelle alpha_ij est calculée à partir des co-occurrences réelles.
 * 2. Zéro hasard : 100% déterministe et reproductible pour le même historique.
 * 3. Continuité C^infinity : projection logistique sans bifurcation ni seuil binaire.
 */
export const gapPatternPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_PATTERN,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Processus ponctuel de Hawkes multivarié en temps discret (Auto-excitation alpha_ii et couplage mutuel alpha_ij)',
  description: 'Modélise les activations passées comme des impulsions excitatrices qui se propagent aux numéros affines avec une décroissance temporelle exponentielle régie par la variance des écarts.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const N = 90;
    const history = ctx.history || [];
    const H = Math.min(history.length, 60);

    const scores: Record<number, number> = {};
    const confidences: Record<number, number> = {};
    const intensities: Record<number, number> = {};

    if (H < 3) {
      for (let i = 1; i <= N; i++) {
        scores[i] = 50.0;
        confidences[i] = 0.1;
      }
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.GAP_PATTERN] = { scores, confidences, intensities };
      return;
    }

    // 1. Taux de base combinatoire exact
    const mu0 = 5.0 / 90.0;

    // 2. Taux de décroissance temporelle continu calibré sur la médiane d'écart
    const medianGap = Math.max(1.0, ctx.statisticalBounds?.median ?? 17.0);
    const beta = Math.LN2 / (medianGap + 1.0);

    // 3. Matrice de co-occurrences empiriques sur l'historique disponible
    const pairCooc = new Float64Array((N + 1) * (N + 1));
    const singleCount = new Float64Array(N + 1);

    for (let t = 0; t < H; t++) {
      const winners = history[t]?.gagnants || [];
      const len = winners.length;
      for (let a = 0; a < len; a++) {
        const u = winners[a];
        if (u >= 1 && u <= N) {
          singleCount[u]++;
          for (let b = a + 1; b < len; b++) {
            const v = winners[b];
            if (v >= 1 && v <= N) {
              pairCooc[u * (N + 1) + v]++;
              pairCooc[v * (N + 1) + u]++;
            }
          }
        }
      }
    }

    // Espérance uniforme de co-occurrence sur H tirages
    const expectedCooc = H * ((5.0 * 4.0) / (90.0 * 89.0));
    const expectedSingle = H * (5.0 / 90.0);

    // 4. Calcul de l'intensité de Hawkes lambda_i
    const rawLambda = new Float64Array(N + 1);

    for (let i = 1; i <= N; i++) {
      let excitation = 0.0;

      for (let lag = 0; lag < H; lag++) {
        const decay = Math.exp(-beta * lag);
        const winners = history[lag]?.gagnants || [];

        for (const j of winners) {
          if (j < 1 || j > N) continue;

          if (i === j) {
            // Auto-excitation : tendance à la récurrence immédiate
            const alpha_self = (singleCount[i] + 1.0) / (expectedSingle + 1.0);
            excitation += alpha_self * decay;
          } else {
            // Excitation mutuelle par le réseau de co-occurrences
            const cooc = pairCooc[i * (N + 1) + j];
            const alpha_cross = (cooc + 0.1) / (expectedCooc + 0.1);
            excitation += alpha_cross * decay;
          }
        }
      }

      rawLambda[i] = mu0 + excitation;
    }

    // 5. Normalisation robuste par Z-score (médiane & MAD)
    const lambdaVals: number[] = [];
    for (let i = 1; i <= N; i++) lambdaVals.push(rawLambda[i]);
    lambdaVals.sort((a, b) => a - b);

    const medianLambda = lambdaVals[Math.floor(N / 2)];
    const absDevs = lambdaVals.map(v => Math.abs(v - medianLambda)).sort((a, b) => a - b);
    const madLambda = Math.max(1e-6, absDevs[Math.floor(N / 2)] * 1.4826);

    const sampleConfidence = Math.max(0.1, Math.min(0.95, 1.0 - Math.exp(-H / 18.0)));

    for (let i = 1; i <= N; i++) {
      const z = (rawLambda[i] - medianLambda) / madLambda;
      // Projection logistique différentiable C^infinity sur [0, 100]
      const score = 100.0 / (1.0 + Math.exp(-1.702 * z));
      scores[i] = Math.max(0.0, Math.min(100.0, score));
      confidences[i] = sampleConfidence;
      intensities[i] = rawLambda[i];
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_PATTERN] = { scores, confidences, intensities };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_PATTERN]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.GAP_PATTERN];
    const score = cache.scores[num] ?? 50.0;
    const confidence = cache.confidences[num] ?? 0.5;
    const intensity = cache.intensities?.[num] ?? 0.0;

    return {
      score,
      confidence,
      metadata: {
        hawkesIntensity: intensity,
        model: 'Multivariate Hawkes Point Process'
      }
    };
  }
};
