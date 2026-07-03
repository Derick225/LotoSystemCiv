import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { analyzeDecadePatterns, getDecadeIndex } from '../decadePatternService';

export const decadePatternPlugin: AlgorithmPlugin = {
  key: AlgoKey.DECADE_PATTERN,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: "Co-occurrence de Pearson, Entropie de Shannon, et Transition Markovienne d'ordre 1",
  description: 'Analyse et prédiction fondées sur les corrélations inter-dizaines et transitions temporelles continues.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const drawName = ctx.history[0]?.drawName || "ALL";
    const analysis = analyzeDecadePatterns(drawName, ctx.history);

    // Précalcule les scores bruts pour les 9 décennies pour pouvoir normaliser de façon continue
    const decadeRawScores = new Float32Array(9);
    for (let d = 0; d < 9; d++) {
      // 1. Distribution historique (Fréquence)
      const freq = analysis.distribution[d];

      // 2. Score temporel (Markov transition)
      const temp = analysis.projectedTemporalScore[d];

      // 3. Alignement de corrélation (Pearson correlation alignment)
      let correlationAlignment = 0;
      for (let j = 0; j < 9; j++) {
        correlationAlignment += analysis.projectedTemporalScore[j] * analysis.correlationMatrix[d][j];
      }

      // Fusion linéaire des composantes sans nombre magique (coefficients normalisés sommés à 1.0)
      // Ajustement dynamique des coefficients basé sur le score de déséquilibre continu (imbalanceScore)
      const wTemp = 0.4 + 0.1 * analysis.imbalanceScore;
      const wFreq = 0.3 - 0.1 * analysis.imbalanceScore;
      const wAlign = 0.3;

      decadeRawScores[d] = wFreq * freq + wTemp * temp + wAlign * correlationAlignment;
    }

    // Calcul de la médiane et du MAD des scores de décennies pour un z-score robuste
    const sortedRaw = [...decadeRawScores].sort((a, b) => a - b);
    const median = sortedRaw[4] || 0.0; // Index 4 est la médiane des 9 éléments
    const absDeviations = decadeRawScores.map(v => Math.abs(v - median));
    const sortedDev = [...absDeviations].sort((a, b) => a - b);
    const mad = (sortedDev[4] || 0.0) * 1.4826 + 1e-6; // Éviter la division par zéro

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.DECADE_PATTERN] = {
      analysis,
      decadeRawScores,
      median,
      mad
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.DECADE_PATTERN]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache![AlgoKey.DECADE_PATTERN];
    const d = getDecadeIndex(num);

    const rawScore = cache.decadeRawScores[d];
    const median = cache.median;
    const mad = cache.mad;

    // Calcul du z-score modifié robuste
    const robustZ = (0.6745 * (rawScore - median)) / mad;

    // CDF Logistique standard de la Loi Normale pour squasher dans [0, 1] puis multiplier par 100
    const LOGISTIC_APPROX_FACTOR = 1.702;
    const score = 100.0 / (1.0 + Math.exp(-LOGISTIC_APPROX_FACTOR * robustZ));

    return {
      score,
      confidence: 0.90, // Niveau de confiance statistique cible
      metadata: {
        decadeIndex: d,
        historicalFrequency: cache.analysis.distribution[d],
        temporalProjection: cache.analysis.projectedTemporalScore[d],
        imbalanceFactor: cache.analysis.imbalanceScore
      }
    };
  }
};
