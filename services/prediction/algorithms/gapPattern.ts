import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { GapDynamicsEngine } from '../gapDynamicsEngine';

/**
 * ANALYSEUR DE MOTIFS DE SÉQUENCES D'ÉCARTS (Gap Pattern Analyzer)
 * Colonne vertébrale unifiée de la dynamique des écarts (GapDynamicsEngine).
 *
 * Base mathématique : Modèle Autorégressif AR(1) par numéro + auto-corrélation lag-1
 * harmonisée avec la cadence collective, les tendances de Holt et les bandes d'écarts.
 */
export const gapPatternPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_PATTERN,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Modèle Autorégressif AR(1) par numéro sur séquence d\'écarts individuelle (auto-corrélation de décalage 1)',
  description: 'Détecte, pour chaque numéro individuellement, un motif récurrent dans sa propre séquence chronologique d\'écarts (AR(1)) unifié avec la dynamique complète des écarts.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    GapDynamicsEngine.analyze(ctx);
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_PATTERN]) {
      this.precompute(ctx);
    }
    const profile = GapDynamicsEngine.getProfile(num, ctx);

    if (!profile || !profile.hasPattern) {
      return {
        score: 50,
        confidence: 0.3,
        metadata: { hasPattern: false }
      };
    }

    return {
      score: profile.unifiedScore,
      confidence: profile.confidence,
      metadata: {
        hasPattern: true,
        currentOpenGap: profile.currentOpenGap,
        predictedGap: profile.predictedGap,
        personalMeanGap: profile.meanGap,
        autocorrelation: profile.autocorrelation,
        sampleSize: profile.numGaps,
        standardError: profile.standardError,
        predictionZScore: profile.predictionZScore,
        cadenceScore: Number(profile.cadenceScore.toFixed(2)),
        trendScore: Number(profile.trendScore.toFixed(2)),
        bandScore: Number(profile.bandScore.toFixed(2))
      }
    };
  }
};

