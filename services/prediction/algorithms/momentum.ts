import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { StateDynamicsEngine } from '../stateDynamicsEngine';

export const momentumPlugin: AlgorithmPlugin = {
  key: AlgoKey.MOMENTUM,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Dérivée Première (MOMENTUM) et Vélocité Temporelle unifiée (État Cinétique d\'Ordre 1)',
  description: 'Fusion cinématique continue de la vélocité récente vs profonde (momentum) harmonisée au sein du moteur d\'état unifié.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    StateDynamicsEngine.analyze(ctx);
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.MOMENTUM]) {
      this.precompute(ctx);
    }
    const profile = StateDynamicsEngine.getProfile(num, ctx);

    // Modèle de Hawkes (Excitation Temporelle continue)
    const hawkesBoost = (ctx.advancedMetrics?.hawkesExcitation as Record<number, number>)?.[num] || 0.0;
    const boundedHawkes = Math.tanh(hawkesBoost / 50.0) * 15.0; // Borné continûment [-15, +15]
    const finalScore = Math.max(0.0, Math.min(100.0, profile.momentumScore + boundedHawkes));

    return {
      score: finalScore,
      confidence: profile.confidence,
      metadata: {
        velocityRaw: profile.velocityRaw,
        momentumScore: Number(profile.momentumScore.toFixed(2)),
        hawkesBoost,
        stateScore: Number(profile.stateScore.toFixed(2)),
        model: 'StateDynamicsEngine (Order 1 Kinetic Velocity)'
      }
    };
  }
};
