import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { GapDynamicsEngine } from '../gapDynamicsEngine';

export const gapsPlugin: AlgorithmPlugin = {
  key: AlgoKey.GAPS,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Fusion de la CDF Géométrique Exacte et de l\'Estimation par Noyau de Densité (KDE) Continue unifiée',
  description: 'Évaluation des écarts entre les sorties vs écart théorique via CDF géométrique enrichie par lissage continu KDE sur l\'historique des écarts.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    GapDynamicsEngine.analyze(ctx);
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAPS]) {
      this.precompute(ctx);
    }
    const profile = GapDynamicsEngine.getProfile(num, ctx);

    // Intégration des harmoniques avancées (Velocity & Résistance continues)
    const gapVelocity = (ctx.advancedMetrics?.gapVelocity as Record<number, number>)?.[num] || 0.0;
    const resistance = (ctx.advancedMetrics?.resistance as Record<number, number>)?.[num] || 0.0;

    const baseScore = profile.geometricScore;
    const velocityScale = 1.0 + Math.tanh(gapVelocity / 50.0) * 0.25;
    const resistanceDecay = 1.0 / (1.0 + Math.max(0, resistance) / 100.0);

    const fusedScore = Math.max(0.0, Math.min(100.0, baseScore * velocityScale * resistanceDecay));

    return {
      score: fusedScore,
      confidence: profile.confidence,
      metadata: {
        currentGap: profile.currentOpenGap,
        geometricScore: Number(profile.geometricScore.toFixed(2)),
        unifiedGapScore: Number(profile.unifiedScore.toFixed(2)),
        gapVelocity,
        resistance
      }
    };
  }
};
