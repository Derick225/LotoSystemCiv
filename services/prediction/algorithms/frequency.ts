import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { StateDynamicsEngine } from '../stateDynamicsEngine';

export const frequencyPlugin: AlgorithmPlugin = {
  key: AlgoKey.FREQUENCY,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Loi des Grands Nombres et Distribution Empirique Robuste (État Statique d\'Ordre 0 unifié)',
  description: 'Évalue la fréquence historique normalisée de manière robuste aux valeurs aberrantes au sein du moteur d\'état unifié.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    StateDynamicsEngine.analyze(ctx);
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.FREQUENCY]) {
      this.precompute(ctx);
    }
    const profile = StateDynamicsEngine.getProfile(num, ctx);
    
    return {
      score: profile.frequencyScore,
      confidence: profile.confidence,
      metadata: {
        rawFreq: profile.frequencyRaw,
        frequencyScore: Number(profile.frequencyScore.toFixed(2)),
        stateScore: Number(profile.stateScore.toFixed(2)),
        model: 'StateDynamicsEngine (Order 0 Frequency)'
      }
    };
  }
};
